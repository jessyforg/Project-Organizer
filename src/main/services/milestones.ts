import {
  UPCOMING_DAYS,
  type ColorToken,
  type Milestone,
  type MilestoneEntry,
  type Progress,
  type StatusCategory,
} from '@shared/domain';
import type { CreateMilestoneInput, UpdateMilestoneInput } from '@shared/schemas';
import { addDays } from '../domain/dates';
import { computeProgress } from '../domain/progress';
import { AppError } from '../errors';
import { recordActivity } from './activity';
import { notFound, nowIso, placeholders, today, type ServiceContext } from './context';
import { requireLiveProject } from './projects';

interface Row {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  target_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  favourite: number;
  project_name: string;
  project_color: string | null;
}

const SELECT = `
  SELECT m.id, m.project_id, m.name, m.description, m.target_date, m.completed_at,
         m.created_at, m.updated_at,
         EXISTS (SELECT 1 FROM favourites WHERE milestone_id = m.id) AS favourite,
         p.name AS project_name, p.color AS project_color
  FROM milestones m JOIN projects p ON p.id = m.project_id`;

/** Open first; then by target date (undated last) and name. */
const ORDER =
  'm.completed_at IS NOT NULL, m.target_date IS NULL, m.target_date, m.name COLLATE NOCASE, m.id';

/**
 * Milestones in projects (ADR-0020). Progress uses the project rules (R13) over the milestone's
 * live top-level tasks and their live subtasks. Completing never changes the tasks.
 */
export class MilestoneService {
  constructor(private readonly ctx: ServiceContext) {}

  list(projectId: string): Milestone[] {
    requireLiveProject(this.ctx.db, projectId);
    const rows = this.ctx.db
      .prepare(`${SELECT} WHERE m.project_id = ? AND m.deleted_at IS NULL ORDER BY ${ORDER}`)
      .all(projectId) as Row[];
    return this.withProgress(rows);
  }

  get(id: string): Milestone {
    const row = this.ctx.db
      .prepare(`${SELECT} WHERE m.id = ? AND m.deleted_at IS NULL AND p.deleted_at IS NULL`)
      .get(id) as Row | undefined;
    if (!row) throw notFound('Milestone');
    return this.withProgress([row])[0]!;
  }

  /** Live milestones with a target date in [from, to], in live, unarchived projects. */
  inRange(range: { from: string; to: string }): MilestoneEntry[] {
    const rows = this.ctx.db
      .prepare(
        `${SELECT} WHERE m.deleted_at IS NULL AND p.deleted_at IS NULL AND p.archived_at IS NULL
           AND m.target_date BETWEEN ? AND ? ORDER BY m.target_date, ${ORDER}`,
      )
      .all(range.from, range.to) as Row[];
    return this.entries(rows);
  }

  /** Open milestones that are overdue or due within the upcoming days, overdue first. */
  dueSoon(): MilestoneEntry[] {
    const now = today(this.ctx);
    const rows = this.ctx.db
      .prepare(
        `${SELECT} WHERE m.deleted_at IS NULL AND p.deleted_at IS NULL AND p.archived_at IS NULL
           AND m.completed_at IS NULL AND m.target_date IS NOT NULL AND m.target_date <= ?
         ORDER BY m.target_date, m.name COLLATE NOCASE, m.id`,
      )
      .all(addDays(now, UPCOMING_DAYS)) as Row[];
    return this.entries(rows);
  }

  create(input: CreateMilestoneInput): Milestone {
    this.requireOpenProject(input.projectId);
    const id = this.ctx.newId();
    const now = nowIso(this.ctx);
    this.ctx.db.transaction(() => {
      this.ctx.db
        .prepare(
          `INSERT INTO milestones (id, project_id, name, description, target_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          input.projectId,
          input.name,
          input.description ?? null,
          input.targetDate ?? null,
          now,
          now,
        );
      recordActivity(this.ctx, {
        kind: 'milestone',
        id,
        projectId: input.projectId,
        title: input.name,
        action: 'created',
      });
    })();
    return this.get(id);
  }

  update(input: UpdateMilestoneInput): Milestone {
    const current = this.requireEditable(input.id);
    const pick = <K extends 'name' | 'description' | 'targetDate'>(key: K) =>
      input[key] === undefined ? current[key] : input[key];
    const name = pick('name');
    const targetDate = pick('targetDate');
    this.ctx.db.transaction(() => {
      this.ctx.db
        .prepare(
          'UPDATE milestones SET name = ?, description = ?, target_date = ?, updated_at = ? WHERE id = ?',
        )
        .run(name, pick('description'), targetDate, nowIso(this.ctx), input.id);
      const base = {
        kind: 'milestone' as const,
        id: input.id,
        projectId: current.projectId,
        title: name,
      };
      if (name !== current.name) {
        recordActivity(this.ctx, {
          ...base,
          action: 'renamed',
          oldValue: current.name,
          newValue: name,
        });
      }
      if (targetDate !== current.targetDate) {
        recordActivity(this.ctx, {
          ...base,
          action: 'changed',
          field: 'target_date',
          oldValue: current.targetDate,
          newValue: targetDate,
        });
      }
    })();
    return this.get(input.id);
  }

  /** Completing keeps the time it was first completed; reopening clears it. Tasks are untouched. */
  setCompleted(id: string, completed: boolean): Milestone {
    const current = this.requireEditable(id);
    if ((current.completedAt !== null) === completed) return current;
    const now = nowIso(this.ctx);
    this.ctx.db.transaction(() => {
      this.ctx.db
        .prepare('UPDATE milestones SET completed_at = ?, updated_at = ? WHERE id = ?')
        .run(completed ? now : null, now, id);
      recordActivity(this.ctx, {
        kind: 'milestone',
        id,
        projectId: current.projectId,
        title: current.name,
        action: completed ? 'completed' : 'reopened',
      });
    })();
    return this.get(id);
  }

  /** A live milestone in a live, unarchived project. */
  requireEditable(id: string): Milestone {
    const milestone = this.get(id);
    this.requireOpenProject(milestone.projectId);
    return milestone;
  }

  private requireOpenProject(projectId: string): void {
    const project = requireLiveProject(this.ctx.db, projectId);
    if (project.archived_at !== null) {
      throw new AppError('CONFLICT', 'Unarchive the project to change its milestones.');
    }
  }

  private entries(rows: Row[]): MilestoneEntry[] {
    return this.withProgress(rows).map((milestone, i) => ({
      ...milestone,
      projectName: rows[i]!.project_name,
      projectColor: rows[i]!.project_color as ColorToken | null,
    }));
  }

  private withProgress(rows: Row[]): Milestone[] {
    const progress = this.progressFor(rows.map((r) => r.id));
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description,
      targetDate: row.target_date,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      progress: progress.get(row.id) ?? computeProgress([]),
      favourite: row.favourite === 1,
    }));
  }

  /** The milestone's live top-level tasks and their live subtasks, counted like a project. */
  private progressFor(ids: string[]): Map<string, Progress> {
    const result = new Map<string, Progress>();
    if (ids.length === 0) return result;
    const rows = this.ctx.db
      .prepare(
        `SELECT t.id, t.parent_task_id, s.category,
                coalesce(t.milestone_id, parent.milestone_id) AS milestone_id
         FROM tasks t
         JOIN project_statuses s ON s.id = t.status_id
         LEFT JOIN tasks parent ON parent.id = t.parent_task_id
         WHERE t.deleted_at IS NULL
           AND coalesce(t.milestone_id, parent.milestone_id) IN (${placeholders(ids.length)})
           AND (t.parent_task_id IS NULL OR parent.deleted_at IS NULL)`,
      )
      .all(...ids) as {
      id: string;
      parent_task_id: string | null;
      category: StatusCategory;
      milestone_id: string;
    }[];
    for (const id of ids) {
      const tasks = rows
        .filter((r) => r.milestone_id === id)
        .map((r) => ({ id: r.id, parentTaskId: r.parent_task_id, category: r.category }));
      result.set(id, computeProgress(tasks));
    }
    return result;
  }
}
