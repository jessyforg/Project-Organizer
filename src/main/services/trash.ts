import {
  TRASH_RETENTION_DAYS,
  type RestoreResult,
  type TaskTrashPreview,
  type TrashEntry,
} from '@shared/domain';
import { daysAfter, daysBefore } from '../domain/dates';
import { AppError } from '../errors';
import { notFound, nowIso, placeholders, type ServiceContext } from './context';
import { requireLiveProject } from './projects';

interface BatchRow {
  batch_id: string;
  kind: 'project' | 'task';
  title: string;
  project_name: string | null;
  deleted_at: string;
  item_count: number;
}

/**
 * Recoverable deletion (docs/DATA_MODEL.md §6). Moving to trash marks every row of one user
 * action with the same deletion batch, so a hierarchy is restored or purged together.
 */
export class TrashService {
  constructor(private readonly ctx: ServiceContext) {}

  previewTaskTrash(taskId: string): TaskTrashPreview {
    const ids = this.liveTaskAndSubtasks(taskId);
    const dependents = this.ctx.db
      .prepare(
        `SELECT DISTINCT t.id, t.title, s.category, t.deleted_at FROM task_dependencies d
         JOIN tasks t ON t.id = d.task_id
         JOIN project_statuses s ON s.id = t.status_id
         WHERE d.depends_on_task_id IN (${placeholders(ids.length)})
           AND t.deleted_at IS NULL AND t.id NOT IN (${placeholders(ids.length)})
         ORDER BY t.title COLLATE NOCASE, t.id`,
      )
      .all(...ids, ...ids) as { id: string; title: string; category: string }[];
    return {
      subtaskCount: ids.length - 1,
      dependents: dependents.map((d) => ({
        id: d.id,
        title: d.title,
        statusCategory: d.category as TaskTrashPreview['dependents'][number]['statusCategory'],
        trashed: false,
      })),
    };
  }

  /** Moves a task and its live subtasks to the trash. Dependency links are kept. */
  trashTask(taskId: string): { batchId: string } {
    const { db } = this.ctx;
    const ids = this.liveTaskAndSubtasks(taskId);
    const batchId = this.ctx.newId();
    const now = nowIso(this.ctx);
    db.prepare(
      `UPDATE tasks SET deleted_at = ?, deletion_batch_id = ?, updated_at = ?
       WHERE id IN (${placeholders(ids.length)})`,
    ).run(now, batchId, now, ...ids);
    return { batchId };
  }

  /** Moves a project and all its live tasks to the trash as one batch. */
  trashProject(projectId: string): { batchId: string } {
    const { db } = this.ctx;
    const project = requireLiveProject(db, projectId);
    if (project.is_inbox === 1) {
      throw new AppError('VALIDATION_FAILED', 'The Inbox cannot be deleted.');
    }
    const batchId = this.ctx.newId();
    const now = nowIso(this.ctx);
    db.transaction(() => {
      db.prepare(
        'UPDATE tasks SET deleted_at = ?, deletion_batch_id = ?, updated_at = ? WHERE project_id = ? AND deleted_at IS NULL',
      ).run(now, batchId, now, projectId);
      db.prepare(
        'UPDATE projects SET deleted_at = ?, deletion_batch_id = ?, updated_at = ? WHERE id = ?',
      ).run(now, batchId, now, projectId);
    })();
    return { batchId };
  }

  list(): TrashEntry[] {
    const rows = this.ctx.db
      .prepare(
        `SELECT p.deletion_batch_id AS batch_id, 'project' AS kind, p.name AS title,
                NULL AS project_name, p.deleted_at,
                1 + (SELECT count(*) FROM tasks t WHERE t.deletion_batch_id = p.deletion_batch_id)
                  AS item_count
         FROM projects p WHERE p.deleted_at IS NOT NULL
         UNION ALL
         SELECT t.deletion_batch_id, 'task', t.title, p.name, t.deleted_at,
                (SELECT count(*) FROM tasks x WHERE x.deletion_batch_id = t.deletion_batch_id)
         FROM tasks t JOIN projects p ON p.id = t.project_id
         WHERE t.deleted_at IS NOT NULL
           -- the root task of a task-only batch: its parent is not in the same batch
           AND NOT EXISTS (SELECT 1 FROM projects bp WHERE bp.deletion_batch_id = t.deletion_batch_id)
           AND NOT EXISTS (SELECT 1 FROM tasks parent WHERE parent.id = t.parent_task_id
                           AND parent.deletion_batch_id = t.deletion_batch_id)
         ORDER BY deleted_at DESC, batch_id`,
      )
      .all() as BatchRow[];
    return rows.map((row) => ({
      batchId: row.batch_id,
      kind: row.kind,
      title: row.title,
      projectName: row.project_name,
      itemCount: row.item_count,
      deletedAt: row.deleted_at,
      purgeAfter: daysAfter(row.deleted_at, TRASH_RETENTION_DAYS),
    }));
  }

  /**
   * Restores one batch. Refuses if the batch's project or parent task is still in the trash,
   * and never recreates permanently deleted records.
   */
  restore(batchId: string): RestoreResult {
    const { db } = this.ctx;
    return db.transaction(() => {
      const projects = db
        .prepare('SELECT id FROM projects WHERE deletion_batch_id = ?')
        .all(batchId) as { id: string }[];
      const tasks = db
        .prepare(
          `SELECT t.id, t.parent_task_id,
                  (SELECT p.deleted_at IS NOT NULL AND p.deletion_batch_id IS NOT t.deletion_batch_id
                   FROM projects p WHERE p.id = t.project_id) AS project_trashed,
                  (SELECT x.deleted_at IS NOT NULL AND x.deletion_batch_id IS NOT t.deletion_batch_id
                   FROM tasks x WHERE x.id = t.parent_task_id) AS parent_trashed
           FROM tasks t WHERE t.deletion_batch_id = ?`,
        )
        .all(batchId) as {
        id: string;
        parent_task_id: string | null;
        project_trashed: number;
        parent_trashed: number | null;
      }[];
      if (projects.length === 0 && tasks.length === 0) throw notFound('Trash item');
      if (tasks.some((t) => t.project_trashed === 1)) {
        throw new AppError('CONFLICT', 'Restore the project first; it is also in the trash.');
      }
      if (tasks.some((t) => t.parent_trashed === 1)) {
        throw new AppError('CONFLICT', 'Restore the parent task first; it is also in the trash.');
      }

      const now = nowIso(this.ctx);
      db.prepare(
        'UPDATE projects SET deleted_at = NULL, deletion_batch_id = NULL, updated_at = ? WHERE deletion_batch_id = ?',
      ).run(now, batchId);
      db.prepare(
        'UPDATE tasks SET deleted_at = NULL, deletion_batch_id = NULL, updated_at = ? WHERE deletion_batch_id = ?',
      ).run(now, batchId);

      const unresolved = tasks.length
        ? (db
            .prepare(
              `SELECT d.task_id, d.depends_on_task_id FROM task_dependencies d
               JOIN tasks p ON p.id = d.depends_on_task_id
               WHERE d.task_id IN (${placeholders(tasks.length)}) AND p.deleted_at IS NOT NULL
               ORDER BY d.task_id, d.depends_on_task_id`,
            )
            .all(...tasks.map((t) => t.id)) as { task_id: string; depends_on_task_id: string }[])
        : [];
      return {
        restoredProjects: projects.length,
        restoredTasks: tasks.length,
        unresolvedDependencies: unresolved.map((u) => ({
          taskId: u.task_id,
          prerequisiteId: u.depends_on_task_id,
        })),
      };
    })();
  }

  /** Permanently deletes one batch. Cannot be undone. */
  deletePermanently(batchId: string): void {
    if (this.purgeBatches([batchId]) === 0) throw notFound('Trash item');
  }

  /** Permanently deletes everything in the trash; returns the number of batches removed. */
  empty(): number {
    return this.purgeBatches(this.allBatchIds());
  }

  /** Permanently deletes batches trashed more than 30 days ago. */
  purgeExpired(): number {
    const cutoff = daysBefore(this.ctx.clock(), TRASH_RETENTION_DAYS);
    return this.purgeBatches(this.allBatchIds(cutoff));
  }

  private allBatchIds(deletedBefore?: string): string[] {
    const filter = deletedBefore === undefined ? '' : 'AND deleted_at < ?';
    const args = deletedBefore === undefined ? [] : [deletedBefore, deletedBefore];
    const rows = this.ctx.db
      .prepare(
        `SELECT deletion_batch_id AS id FROM projects WHERE deleted_at IS NOT NULL ${filter}
         UNION
         SELECT deletion_batch_id FROM tasks WHERE deleted_at IS NOT NULL ${filter}`,
      )
      .all(...args) as { id: string }[];
    return rows.map((r) => r.id);
  }

  /** Hard deletes; foreign-key cascades remove statuses, subtasks, tags links, and dependencies. */
  private purgeBatches(batchIds: string[]): number {
    if (batchIds.length === 0) return 0;
    const { db } = this.ctx;
    return db.transaction(() => {
      let purged = 0;
      const deleteProjects = db.prepare('DELETE FROM projects WHERE deletion_batch_id = ?');
      const deleteTasks = db.prepare('DELETE FROM tasks WHERE deletion_batch_id = ?');
      for (const batchId of batchIds) {
        const changes = deleteProjects.run(batchId).changes + deleteTasks.run(batchId).changes;
        if (changes > 0) purged++;
      }
      return purged;
    })();
  }

  private liveTaskAndSubtasks(taskId: string): string[] {
    const { db } = this.ctx;
    const task = db
      .prepare('SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL')
      .get(taskId) as { id: string } | undefined;
    if (!task) throw notFound('Task');
    const children = db
      .prepare('SELECT id FROM tasks WHERE parent_task_id = ? AND deleted_at IS NULL')
      .all(taskId) as { id: string }[];
    return [taskId, ...children.map((c) => c.id)];
  }
}
