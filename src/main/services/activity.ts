import type { ActivityAction, ActivityEvent, ActivityField, ActivityKind } from '@shared/domain';
import { nowIso, placeholders, type ServiceContext } from './context';

/** Note renames and edits closer together than this are one event (ADR-0021). */
export const NOTE_MERGE_MS = 10 * 60 * 1000;

export interface ActivityInput {
  kind: ActivityKind;
  id: string;
  projectId: string | null;
  title: string;
  action: ActivityAction;
  field?: ActivityField;
  oldValue?: string | null;
  newValue?: string | null;
}

/**
 * Records one change (ADR-0021). Call it inside the same transaction as the change, so a
 * failed change leaves no event and a successful one always has one. Note renames and edits
 * within 10 minutes of the note's previous event of the same kind update that event instead.
 */
export function recordActivity(ctx: ServiceContext, event: ActivityInput): void {
  const { db } = ctx;
  const now = nowIso(ctx);
  if (event.kind === 'note' && (event.action === 'renamed' || event.action === 'edited')) {
    const last = db
      .prepare(
        `SELECT id, at FROM activity_events
         WHERE item_kind = 'note' AND item_id = ? AND action = ?
         ORDER BY at DESC, id DESC LIMIT 1`,
      )
      .get(event.id, event.action) as { id: number; at: string } | undefined;
    if (last && Date.parse(now) - Date.parse(last.at) < NOTE_MERGE_MS) {
      db.prepare('UPDATE activity_events SET at = ?, title = ?, new_value = ? WHERE id = ?').run(
        now,
        event.title,
        event.newValue ?? null,
        last.id,
      );
      return;
    }
  }
  db.prepare(
    `INSERT INTO activity_events
       (at, item_kind, item_id, project_id, title, action, field, old_value, new_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    now,
    event.kind,
    event.id,
    event.projectId,
    event.title,
    event.action,
    event.field ?? null,
    event.oldValue ?? null,
    event.newValue ?? null,
  );
}

interface Row {
  id: number;
  at: string;
  item_kind: ActivityKind;
  item_id: string;
  project_id: string | null;
  title: string;
  action: ActivityAction;
  field: ActivityField | null;
  old_value: string | null;
  new_value: string | null;
  live: number;
}

/** Whether the event's item still exists outside the trash. */
const LIVE = `CASE e.item_kind
  WHEN 'task' THEN EXISTS (SELECT 1 FROM tasks t JOIN projects p ON p.id = t.project_id
    WHERE t.id = e.item_id AND t.deleted_at IS NULL AND p.deleted_at IS NULL)
  WHEN 'note' THEN EXISTS (SELECT 1 FROM notes n JOIN projects p ON p.id = n.project_id
    WHERE n.id = e.item_id AND n.deleted_at IS NULL AND p.deleted_at IS NULL)
  WHEN 'milestone' THEN EXISTS (SELECT 1 FROM milestones m JOIN projects p ON p.id = m.project_id
    WHERE m.id = e.item_id AND m.deleted_at IS NULL AND p.deleted_at IS NULL)
  ELSE EXISTS (SELECT 1 FROM projects p WHERE p.id = e.item_id AND p.deleted_at IS NULL)
END`;

const SELECT = `SELECT e.id, e.at, e.item_kind, e.item_id, e.project_id, e.title, e.action, e.field,
  e.old_value, e.new_value, ${LIVE} AS live FROM activity_events e`;

function toEvent(row: Row): ActivityEvent {
  return {
    id: row.id,
    at: row.at,
    itemKind: row.item_kind,
    itemId: row.item_id,
    projectId: row.project_id,
    title: row.title,
    action: row.action,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    live: row.live === 1,
  };
}

/** Reading the activity log, and keeping it to its retention period (ADR-0021). */
export class ActivityService {
  constructor(private readonly ctx: ServiceContext) {}

  forItem(input: { kind: ActivityKind; id: string; limit: number }): ActivityEvent[] {
    return (
      this.ctx.db
        .prepare(
          `${SELECT} WHERE e.item_kind = ? AND e.item_id = ? ORDER BY e.at DESC, e.id DESC LIMIT ?`,
        )
        .all(input.kind, input.id, input.limit) as Row[]
    ).map(toEvent);
  }

  /** The project's own events and those of its tasks, notes, and milestones. */
  forProject(input: { projectId: string; limit: number }): ActivityEvent[] {
    return (
      this.ctx.db
        .prepare(`${SELECT} WHERE e.project_id = ? ORDER BY e.at DESC, e.id DESC LIMIT ?`)
        .all(input.projectId, input.limit) as Row[]
    ).map(toEvent);
  }

  recent(input: { limit: number }): ActivityEvent[] {
    return (
      this.ctx.db
        .prepare(`${SELECT} ORDER BY e.at DESC, e.id DESC LIMIT ?`)
        .all(input.limit) as Row[]
    ).map(toEvent);
  }

  /** Deletes events older than the retention period; returns how many. */
  purgeOlderThan(days: number): number {
    const cutoff = new Date(this.ctx.clock().getTime() - days * 86_400_000).toISOString();
    return this.ctx.db.prepare('DELETE FROM activity_events WHERE at < ?').run(cutoff).changes;
  }

  /** Forgets items deleted for good, and everything in deleted projects. */
  forget(items: { ids: string[]; projectIds: string[] }): void {
    const { db } = this.ctx;
    if (items.ids.length > 0) {
      db.prepare(
        `DELETE FROM activity_events WHERE item_id IN (${placeholders(items.ids.length)})`,
      ).run(...items.ids);
    }
    if (items.projectIds.length > 0) {
      db.prepare(
        `DELETE FROM activity_events WHERE project_id IN (${placeholders(items.projectIds.length)})`,
      ).run(...items.projectIds);
    }
  }
}
