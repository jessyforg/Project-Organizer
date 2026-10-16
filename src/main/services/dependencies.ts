import type { StatusCategory, TaskReference } from '@shared/domain';
import type { DependencyInput } from '@shared/schemas';
import { AppError } from '../errors';
import { notFound, nowIso, type ServiceContext } from './context';

interface RefRow {
  id: string;
  title: string;
  category: StatusCategory;
  deleted_at: string | null;
}

const toRef = (row: RefRow): TaskReference => ({
  id: row.id,
  title: row.title,
  statusCategory: row.category,
  trashed: row.deleted_at !== null,
});

/** "A depends on B": B is a prerequisite of A. Warnings only; never blocks status changes (R12). */
export class DependencyService {
  constructor(private readonly ctx: ServiceContext) {}

  add(input: DependencyInput): void {
    const { db } = this.ctx;
    if (input.taskId === input.dependsOnTaskId) {
      throw new AppError('DEPENDENCY_CYCLE', 'A task cannot depend on itself.');
    }
    db.transaction(() => {
      const projectOf = db.prepare(
        'SELECT project_id FROM tasks WHERE id = ? AND deleted_at IS NULL',
      );
      const task = projectOf.get(input.taskId) as { project_id: string } | undefined;
      const prerequisite = projectOf.get(input.dependsOnTaskId) as
        { project_id: string } | undefined;
      if (!task || !prerequisite) throw notFound('Task');
      if (task.project_id !== prerequisite.project_id) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Dependencies can only link tasks in the same project.',
        );
      }
      if (this.dependsOn(input.dependsOnTaskId, input.taskId)) {
        throw new AppError(
          'DEPENDENCY_CYCLE',
          'This would create a circular dependency between tasks.',
        );
      }
      db.prepare(
        `INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, created_at)
         VALUES (?, ?, ?)`,
      ).run(input.taskId, input.dependsOnTaskId, nowIso(this.ctx));
    })();
  }

  remove(input: DependencyInput): void {
    this.ctx.db
      .prepare('DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_task_id = ?')
      .run(input.taskId, input.dependsOnTaskId);
  }

  /** Tasks that `taskId` depends on, including trashed ones (flagged). */
  prerequisites(taskId: string): TaskReference[] {
    const rows = this.ctx.db
      .prepare(
        `SELECT p.id, p.title, s.category, p.deleted_at FROM task_dependencies d
         JOIN tasks p ON p.id = d.depends_on_task_id
         JOIN project_statuses s ON s.id = p.status_id
         WHERE d.task_id = ? ORDER BY p.title COLLATE NOCASE, p.id`,
      )
      .all(taskId) as RefRow[];
    return rows.map(toRef);
  }

  /** Live tasks that depend on `taskId`. */
  dependents(taskId: string): TaskReference[] {
    const rows = this.ctx.db
      .prepare(
        `SELECT t.id, t.title, s.category, t.deleted_at FROM task_dependencies d
         JOIN tasks t ON t.id = d.task_id
         JOIN project_statuses s ON s.id = t.status_id
         WHERE d.depends_on_task_id = ? AND t.deleted_at IS NULL
         ORDER BY t.title COLLATE NOCASE, t.id`,
      )
      .all(taskId) as RefRow[];
    return rows.map(toRef);
  }

  /** True when `from` depends on `to` directly or through other tasks. */
  private dependsOn(from: string, to: string): boolean {
    const row = this.ctx.db
      .prepare(
        `WITH RECURSIVE reachable (id) AS (
           SELECT depends_on_task_id FROM task_dependencies WHERE task_id = ?
           UNION
           SELECT d.depends_on_task_id FROM task_dependencies d JOIN reachable r ON d.task_id = r.id
         )
         SELECT 1 FROM reachable WHERE id = ? LIMIT 1`,
      )
      .get(from, to);
    return row !== undefined;
  }
}
