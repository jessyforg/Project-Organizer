import type { Progress, Project, ProjectState, StatusCategory } from '@shared/domain';
import type { CreateProjectInput, UpdateProjectInput } from '@shared/schemas';
import type { Db } from '../db/connection';
import { computeProgress } from '../domain/progress';
import { AppError } from '../errors';
import { notFound, nowIso, placeholders, type ServiceContext } from './context';
import { PROJECT_SELECT, toProject, type ProjectRow } from './rows';
import { insertDefaultStatuses } from './statuses';

export const INBOX_NAME = 'Inbox';

interface ProjectStateRow {
  id: string;
  is_inbox: number;
  status: string;
  archived_at: string | null;
}

/** Loads a project that is not in the trash, or throws NOT_FOUND. */
export function requireLiveProject(db: Db, id: string): ProjectStateRow {
  const row = db
    .prepare(
      'SELECT id, is_inbox, status, archived_at FROM projects WHERE id = ? AND deleted_at IS NULL',
    )
    .get(id) as ProjectStateRow | undefined;
  if (!row) throw notFound('Project');
  return row;
}

function assertDateOrder(start: string | null, end: string | null, label: string): void {
  if (start !== null && end !== null && start > end) {
    throw new AppError('VALIDATION_FAILED', `The start date must be on or before the ${label}.`);
  }
}

/** Creates the profile's Inbox if it does not exist. Safe to call on every profile open. */
export function ensureInbox(ctx: ServiceContext): string {
  const { db } = ctx;
  return db.transaction(() => {
    const existing = db.prepare('SELECT id FROM projects WHERE is_inbox = 1').get() as
      { id: string } | undefined;
    if (existing) return existing.id;
    const id = ctx.newId();
    const now = nowIso(ctx);
    db.prepare(
      `INSERT INTO projects (id, name, is_inbox, created_at, updated_at) VALUES (?, ?, 1, ?, ?)`,
    ).run(id, INBOX_NAME, now, now);
    insertDefaultStatuses(db, id, ctx.newId, now);
    return id;
  })();
}

export class ProjectService {
  constructor(private readonly ctx: ServiceContext) {}

  /** Projects not in the trash. The Inbox comes first, then by name. */
  list(options: { includeArchived?: boolean } = {}): Project[] {
    const archived = options.includeArchived ? '' : 'AND p.archived_at IS NULL';
    const rows = this.ctx.db
      .prepare(
        `${PROJECT_SELECT} WHERE p.deleted_at IS NULL ${archived}
         ORDER BY p.is_inbox DESC, p.name COLLATE NOCASE, p.created_at`,
      )
      .all() as ProjectRow[];
    return rows.map(toProject);
  }

  get(id: string): Project {
    const row = this.ctx.db
      .prepare(`${PROJECT_SELECT} WHERE p.id = ? AND p.deleted_at IS NULL`)
      .get(id) as ProjectRow | undefined;
    if (!row) throw notFound('Project');
    return toProject(row);
  }

  inboxId(): string {
    return ensureInbox(this.ctx);
  }

  create(input: CreateProjectInput): Project {
    const { db } = this.ctx;
    assertDateOrder(input.startDate ?? null, input.targetDate ?? null, 'target date');
    const id = this.ctx.newId();
    const now = nowIso(this.ctx);
    db.transaction(() => {
      if (input.folderId) {
        if (!db.prepare('SELECT 1 FROM folders WHERE id = ?').get(input.folderId)) {
          throw notFound('Folder');
        }
      }
      db.prepare(
        `INSERT INTO projects
           (id, folder_id, name, description, kind, color, start_date, target_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.folderId ?? null,
        input.name,
        input.description ?? null,
        input.kind ?? 'general',
        input.color ?? null,
        input.startDate ?? null,
        input.targetDate ?? null,
        now,
        now,
      );
      insertDefaultStatuses(db, id, this.ctx.newId, now);
      this.insertTags(id, input.tagIds ?? []);
    })();
    return this.get(id);
  }

  update(input: UpdateProjectInput): Project {
    const current = this.get(input.id);
    const pick = <K extends keyof UpdateProjectInput & keyof Project>(key: K) =>
      (input[key] === undefined ? current[key] : input[key]) as Project[K];
    const next = {
      name: pick('name'),
      description: pick('description'),
      kind: pick('kind'),
      color: pick('color'),
      folderId: pick('folderId'),
      startDate: pick('startDate'),
      targetDate: pick('targetDate'),
    };
    assertDateOrder(next.startDate, next.targetDate, 'target date');
    const { db } = this.ctx;
    if (next.folderId && !db.prepare('SELECT 1 FROM folders WHERE id = ?').get(next.folderId)) {
      throw notFound('Folder');
    }
    db.prepare(
      `UPDATE projects SET name = ?, description = ?, kind = ?, color = ?, folder_id = ?,
         start_date = ?, target_date = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      next.name,
      next.description,
      next.kind,
      next.color,
      next.folderId,
      next.startDate,
      next.targetDate,
      nowIso(this.ctx),
      input.id,
    );
    return this.get(input.id);
  }

  /** Marks a project active or completed. Never changes tasks. */
  setStatus(id: string, status: ProjectState): Project {
    const project = requireLiveProject(this.ctx.db, id);
    if (project.is_inbox === 1 && status !== 'active') {
      throw new AppError('VALIDATION_FAILED', 'The Inbox is always active.');
    }
    this.ctx.db
      .prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, nowIso(this.ctx), id);
    return this.get(id);
  }

  /** Hides the project from active views. Status and tasks are left unchanged. */
  archive(id: string): Project {
    const project = requireLiveProject(this.ctx.db, id);
    if (project.is_inbox === 1) {
      throw new AppError('VALIDATION_FAILED', 'The Inbox cannot be archived.');
    }
    if (project.archived_at === null) {
      const now = nowIso(this.ctx);
      this.ctx.db
        .prepare('UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?')
        .run(now, now, id);
    }
    return this.get(id);
  }

  unarchive(id: string): Project {
    requireLiveProject(this.ctx.db, id);
    this.ctx.db
      .prepare('UPDATE projects SET archived_at = NULL, updated_at = ? WHERE id = ?')
      .run(nowIso(this.ctx), id);
    return this.get(id);
  }

  progress(id: string): Progress {
    requireLiveProject(this.ctx.db, id);
    return this.progressFor([id]).get(id) ?? computeProgress([]);
  }

  /** Progress for several projects in one query. */
  progressFor(projectIds: string[]): Map<string, Progress> {
    const result = new Map<string, Progress>();
    if (projectIds.length === 0) return result;
    const rows = this.ctx.db
      .prepare(
        `SELECT t.id, t.project_id, t.parent_task_id, s.category
         FROM tasks t JOIN project_statuses s ON s.id = t.status_id
         WHERE t.deleted_at IS NULL AND t.project_id IN (${placeholders(projectIds.length)})`,
      )
      .all(...projectIds) as {
      id: string;
      project_id: string;
      parent_task_id: string | null;
      category: StatusCategory;
    }[];
    for (const projectId of projectIds) {
      const tasks = rows
        .filter((r) => r.project_id === projectId)
        .map((r) => ({ id: r.id, parentTaskId: r.parent_task_id, category: r.category }));
      result.set(projectId, computeProgress(tasks));
    }
    return result;
  }

  /** True when an active project has countable tasks and all of them are done (R05). */
  shouldSuggestCompletion(id: string): boolean {
    const project = requireLiveProject(this.ctx.db, id);
    if (project.status !== 'active' || project.is_inbox === 1) return false;
    const progress = this.progress(id);
    return progress.total > 0 && progress.done === progress.total;
  }

  private insertTags(projectId: string, tagIds: string[]): void {
    const unique = [...new Set(tagIds)];
    if (unique.length === 0) return;
    const { db } = this.ctx;
    const found = db
      .prepare(`SELECT count(*) AS n FROM tags WHERE id IN (${placeholders(unique.length)})`)
      .get(...unique) as { n: number };
    if (found.n !== unique.length) throw notFound('Tag');
    const insert = db.prepare('INSERT INTO project_tags (project_id, tag_id) VALUES (?, ?)');
    for (const tagId of unique) insert.run(projectId, tagId);
  }
}
