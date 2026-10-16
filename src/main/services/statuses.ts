import type { StatusCategory, WorkflowStatus } from '@shared/domain';
import type { AddStatusInput, RemoveStatusInput } from '@shared/schemas';
import type { Db } from '../db/connection';
import { evenlySpacedKeys, keyAfter } from '../domain/sort-keys';
import { nameKey } from '../domain/text';
import { AppError } from '../errors';
import { notFound, nowIso, withUniqueName, type ServiceContext } from './context';
import { STATUS_SELECT, toStatus, type StatusRow } from './rows';

const DUPLICATE = 'This project already has a status with this name.';

export const DEFAULT_WORKFLOW: readonly { name: string; category: StatusCategory }[] = [
  { name: 'To do', category: 'todo' },
  { name: 'In progress', category: 'in_progress' },
  { name: 'Done', category: 'done' },
  { name: 'Cancelled', category: 'cancelled' },
];

/** Seeds the default workflow for a new project. Call inside the creating transaction. */
export function insertDefaultStatuses(
  db: Db,
  projectId: string,
  newId: () => string,
  now: string,
): void {
  const insert = db.prepare(
    `INSERT INTO project_statuses
       (id, project_id, name, name_key, category, sort_key, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const keys = evenlySpacedKeys(DEFAULT_WORKFLOW.length);
  DEFAULT_WORKFLOW.forEach((status, i) => {
    insert.run(
      newId(),
      projectId,
      status.name,
      nameKey(status.name),
      status.category,
      keys[i],
      i === 0 ? 1 : 0,
      now,
      now,
    );
  });
}

export class StatusService {
  constructor(private readonly ctx: ServiceContext) {}

  listForProject(projectId: string): WorkflowStatus[] {
    const rows = this.ctx.db
      .prepare(`${STATUS_SELECT} WHERE project_id = ? ORDER BY sort_key`)
      .all(projectId) as StatusRow[];
    if (rows.length === 0) throw notFound('Project');
    return rows.map(toStatus);
  }

  get(id: string): WorkflowStatus {
    const row = this.ctx.db.prepare(`${STATUS_SELECT} WHERE id = ?`).get(id) as
      StatusRow | undefined;
    if (!row) throw notFound('Status');
    return toStatus(row);
  }

  add(input: AddStatusInput): WorkflowStatus {
    const { db } = this.ctx;
    const project = db
      .prepare('SELECT 1 FROM projects WHERE id = ? AND deleted_at IS NULL')
      .get(input.projectId);
    if (!project) throw notFound('Project');
    const last = db
      .prepare('SELECT max(sort_key) AS k FROM project_statuses WHERE project_id = ?')
      .get(input.projectId) as { k: number | null };
    const id = this.ctx.newId();
    const now = nowIso(this.ctx);
    withUniqueName(DUPLICATE, () =>
      db
        .prepare(
          `INSERT INTO project_statuses
             (id, project_id, name, name_key, category, sort_key, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(
          id,
          input.projectId,
          input.name,
          nameKey(input.name),
          input.category,
          keyAfter(last.k),
          now,
          now,
        ),
    );
    return this.get(id);
  }

  rename(id: string, name: string): WorkflowStatus {
    const result = withUniqueName(DUPLICATE, () =>
      this.ctx.db
        .prepare('UPDATE project_statuses SET name = ?, name_key = ?, updated_at = ? WHERE id = ?')
        .run(name, nameKey(name), nowIso(this.ctx), id),
    );
    if (result.changes === 0) throw notFound('Status');
    return this.get(id);
  }

  /** `ids` must list every status of the project exactly once, in the new order. */
  reorder(projectId: string, ids: string[]): WorkflowStatus[] {
    const current = this.listForProject(projectId).map((s) => s.id);
    const known = new Set(current);
    if (
      ids.length !== current.length ||
      new Set(ids).size !== ids.length ||
      !ids.every((id) => known.has(id))
    ) {
      throw new AppError('VALIDATION_FAILED', 'The new order must include every status once.');
    }
    const keys = evenlySpacedKeys(ids.length);
    const update = this.ctx.db.prepare(
      'UPDATE project_statuses SET sort_key = ?, updated_at = ? WHERE id = ?',
    );
    const now = nowIso(this.ctx);
    this.ctx.db.transaction(() => ids.forEach((id, i) => update.run(keys[i], now, id)))();
    return this.listForProject(projectId);
  }

  /** New tasks start in the default status, which must be a "to do" or "in progress" status. */
  setDefault(id: string): WorkflowStatus {
    const status = this.get(id);
    if (status.category !== 'todo' && status.category !== 'in_progress') {
      throw new AppError(
        'VALIDATION_FAILED',
        'Only a "to do" or "in progress" status can be the default.',
      );
    }
    const { db } = this.ctx;
    const now = nowIso(this.ctx);
    db.transaction(() => {
      db.prepare(
        'UPDATE project_statuses SET is_default = 0, updated_at = ? WHERE project_id = ? AND is_default = 1',
      ).run(now, status.projectId);
      db.prepare('UPDATE project_statuses SET is_default = 1, updated_at = ? WHERE id = ?').run(
        now,
        id,
      );
    })();
    return this.get(id);
  }

  /**
   * Removes a status after moving its tasks (including trashed ones) to a replacement.
   * The default status and the last "done" status cannot be removed.
   */
  remove(input: RemoveStatusInput): { reassignedTasks: number } {
    const status = this.get(input.id);
    const replacement = this.get(input.replacementStatusId);
    if (replacement.projectId !== status.projectId || replacement.id === status.id) {
      throw new AppError('VALIDATION_FAILED', 'Choose a different status from the same project.');
    }
    if (status.isDefault) {
      throw new AppError('CONFLICT', 'Choose another default status before removing this one.');
    }
    const { db } = this.ctx;
    if (status.category === 'done') {
      const doneCount = db
        .prepare(
          "SELECT count(*) AS n FROM project_statuses WHERE project_id = ? AND category = 'done'",
        )
        .get(status.projectId) as { n: number };
      if (doneCount.n <= 1) {
        throw new AppError('CONFLICT', 'A project needs at least one "done" status.');
      }
    }
    const now = nowIso(this.ctx);
    return db.transaction(() => {
      const moved = db
        .prepare(
          `UPDATE tasks SET status_id = ?, updated_at = ?,
             completed_at = CASE WHEN ? = 'done' THEN coalesce(completed_at, ?) ELSE NULL END
           WHERE status_id = ?`,
        )
        .run(replacement.id, now, replacement.category, now, status.id);
      db.prepare('DELETE FROM project_statuses WHERE id = ?').run(status.id);
      return { reassignedTasks: moved.changes };
    })();
  }
}
