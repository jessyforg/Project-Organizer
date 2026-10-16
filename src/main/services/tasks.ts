import {
  UPCOMING_DAYS,
  type StatusCategory,
  type Task,
  type TaskNotice,
  type TaskUpdateResult,
} from '@shared/domain';
import type {
  CreateTaskInput,
  MoveTaskInput,
  ReorderTaskInput,
  TaskListQuery,
  UpdateTaskInput,
} from '@shared/schemas';
import { addDays } from '../domain/dates';
import { toFtsQuery } from '../domain/fts';
import { evenlySpacedKeys, keyAfter, keyBetween } from '../domain/sort-keys';
import { AppError } from '../errors';
import { notFound, nowIso, placeholders, today, type ServiceContext } from './context';
import { ensureInbox, ProjectService, requireLiveProject } from './projects';
import { PRIORITY_RANK_SQL, TASK_SELECT, toTask, type TaskRow } from './rows';

const DEFAULT_PAGE_SIZE = 500;

interface StatusRef {
  id: string;
  project_id: string;
  category: StatusCategory;
}

const ORDER_BY: Record<NonNullable<TaskListQuery['sort']>, string> = {
  priority: `${PRIORITY_RANK_SQL}, t.due_date IS NULL, t.due_date, t.created_at, t.id`,
  // Dated tasks first (earliest first), then undated tasks; never invents deadlines.
  due: `t.due_date IS NULL, t.due_date, ${PRIORITY_RANK_SQL}, t.created_at, t.id`,
  created: 't.created_at DESC, t.id',
  manual: 't.sort_key, t.created_at, t.id',
};

function assertDateOrder(start: string | null, due: string | null): void {
  if (start !== null && due !== null && start > due) {
    throw new AppError('VALIDATION_FAILED', 'The start date must be on or before the due date.');
  }
}

export class TaskService {
  private readonly projects: ProjectService;

  constructor(private readonly ctx: ServiceContext) {
    this.projects = new ProjectService(ctx);
  }

  get(id: string): Task {
    const row = this.ctx.db
      .prepare(`${TASK_SELECT} WHERE t.id = ? AND t.deleted_at IS NULL`)
      .get(id) as TaskRow | undefined;
    if (!row) throw notFound('Task');
    return toTask(row);
  }

  /** Filtering, searching, and sorting all happen in SQL (R18). */
  list(query: TaskListQuery = {}): Task[] {
    const where = ['t.deleted_at IS NULL', 'p.deleted_at IS NULL'];
    const params: unknown[] = [];
    const add = (clause: string, ...values: unknown[]) => {
      where.push(clause);
      params.push(...values);
    };

    if (!query.includeArchived) add('p.archived_at IS NULL');
    if (query.projectId) add('t.project_id = ?', query.projectId);
    if (query.parentTaskId === null) add('t.parent_task_id IS NULL');
    else if (query.parentTaskId) add('t.parent_task_id = ?', query.parentTaskId);
    if (query.statusIds?.length) {
      add(`t.status_id IN (${placeholders(query.statusIds.length)})`, ...query.statusIds);
    }
    if (query.statusCategories?.length) {
      add(
        `s.category IN (${placeholders(query.statusCategories.length)})`,
        ...query.statusCategories,
      );
    }
    if (query.priorities?.length) {
      const named = query.priorities.filter((p) => p !== 'none');
      const clauses: string[] = [];
      if (named.length) clauses.push(`t.priority IN (${placeholders(named.length)})`);
      if (query.priorities.includes('none')) clauses.push('t.priority IS NULL');
      add(`(${clauses.join(' OR ')})`, ...named);
    }
    if (query.tagIds?.length) {
      add(
        `EXISTS (SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id
                 AND tt.tag_id IN (${placeholders(query.tagIds.length)}))`,
        ...query.tagIds,
      );
    }
    const day = today(this.ctx);
    switch (query.due) {
      case 'overdue':
        add("t.due_date < ? AND s.category NOT IN ('done', 'cancelled')", day);
        break;
      case 'today':
        add('t.due_date = ?', day);
        break;
      case 'upcoming':
        add('t.due_date > ? AND t.due_date <= ?', day, addDays(day, UPCOMING_DAYS));
        break;
      case 'none':
        add('t.due_date IS NULL');
        break;
      case undefined:
        break;
    }
    if (query.dueFrom) add('t.due_date >= ?', query.dueFrom);
    if (query.dueTo) add('t.due_date <= ?', query.dueTo);
    const fts = query.text === undefined ? null : toFtsQuery(query.text);
    if (fts !== null) add('t.id IN (SELECT task_id FROM tasks_fts WHERE tasks_fts MATCH ?)', fts);

    const sql = `${TASK_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY ${ORDER_BY[query.sort ?? 'priority']} LIMIT ? OFFSET ?`;
    const rows = this.ctx.db
      .prepare(sql)
      .all(...params, query.limit ?? DEFAULT_PAGE_SIZE, query.offset ?? 0) as TaskRow[];
    return rows.map(toTask);
  }

  create(input: CreateTaskInput): Task {
    const { db } = this.ctx;
    const id = this.ctx.newId();
    db.transaction(() => {
      let projectId = input.projectId;
      const parentId = input.parentTaskId ?? null;
      if (parentId !== null) {
        const parent = this.get(parentId);
        if (parent.parentTaskId !== null) {
          throw new AppError('VALIDATION_FAILED', 'Subtasks cannot have their own subtasks.');
        }
        if (projectId !== undefined && projectId !== parent.projectId) {
          throw new AppError(
            'VALIDATION_FAILED',
            'A subtask must be in the same project as its parent.',
          );
        }
        projectId = parent.projectId;
      }
      projectId ??= ensureInbox(this.ctx);
      const project = requireLiveProject(db, projectId);
      if (project.archived_at !== null) {
        throw new AppError('CONFLICT', 'Unarchive the project before adding tasks to it.');
      }
      const status = this.resolveStatus(projectId, input.statusId);
      const startDate = input.startDate ?? null;
      const dueDate = input.dueDate ?? null;
      assertDateOrder(startDate, dueDate);
      const last = db
        .prepare(
          'SELECT max(sort_key) AS k FROM tasks WHERE project_id = ? AND parent_task_id IS ?',
        )
        .get(projectId, parentId) as { k: number | null };
      const now = nowIso(this.ctx);
      db.prepare(
        `INSERT INTO tasks (id, project_id, parent_task_id, status_id, title, description, priority,
           start_date, due_date, sort_key, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        projectId,
        parentId,
        status.id,
        input.title,
        input.description ?? null,
        input.priority ?? null,
        startDate,
        dueDate,
        keyAfter(last.k),
        status.category === 'done' ? now : null,
        now,
        now,
      );
      this.insertTags(id, input.tagIds ?? []);
    })();
    return this.get(id);
  }

  update(input: UpdateTaskInput): TaskUpdateResult {
    const current = this.get(input.id);
    const status =
      input.statusId === undefined
        ? { id: current.statusId, category: current.statusCategory }
        : this.resolveStatus(current.projectId, input.statusId);
    const pick = <K extends 'title' | 'description' | 'priority' | 'startDate' | 'dueDate'>(
      key: K,
    ) => (input[key] === undefined ? current[key] : input[key]) as Task[K];
    const next = {
      title: pick('title'),
      description: pick('description'),
      priority: pick('priority'),
      startDate: pick('startDate'),
      dueDate: pick('dueDate'),
    };
    assertDateOrder(next.startDate, next.dueDate);

    const now = nowIso(this.ctx);
    const wasDone = current.statusCategory === 'done';
    const isDone = status.category === 'done';
    const completedAt = isDone ? (wasDone ? current.completedAt : now) : null;
    this.ctx.db
      .prepare(
        `UPDATE tasks SET title = ?, description = ?, priority = ?, start_date = ?, due_date = ?,
           status_id = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        next.title,
        next.description,
        next.priority,
        next.startDate,
        next.dueDate,
        status.id,
        completedAt,
        now,
        input.id,
      );

    const task = this.get(input.id);
    return { task, notices: this.noticesAfterStatusChange(current, task) };
  }

  /**
   * Moves a top-level task (and all its subtasks, including trashed ones) to another project.
   * Statuses are mapped by category; dependencies that would cross projects are removed.
   */
  move(input: MoveTaskInput): { task: Task; removedDependencies: number } {
    const task = this.get(input.id);
    if (task.parentTaskId !== null) {
      throw new AppError('VALIDATION_FAILED', 'Move the parent task; its subtasks move with it.');
    }
    if (task.projectId === input.projectId) return { task, removedDependencies: 0 };
    const { db } = this.ctx;
    const target = requireLiveProject(db, input.projectId);
    if (target.archived_at !== null) {
      throw new AppError('CONFLICT', 'Unarchive the project before moving tasks to it.');
    }

    const removed = db.transaction(() => {
      const children = db
        .prepare(
          `SELECT t.id, t.completed_at, s.category FROM tasks t
           JOIN project_statuses s ON s.id = t.status_id WHERE t.parent_task_id = ?`,
        )
        .all(task.id) as { id: string; completed_at: string | null; category: StatusCategory }[];
      const movedIds = [task.id, ...children.map((c) => c.id)];
      const inList = placeholders(movedIds.length);
      const removedDeps = db
        .prepare(
          `DELETE FROM task_dependencies
           WHERE (task_id IN (${inList}) AND depends_on_task_id NOT IN (${inList}))
              OR (depends_on_task_id IN (${inList}) AND task_id NOT IN (${inList}))`,
        )
        .run(...movedIds, ...movedIds, ...movedIds, ...movedIds).changes;

      const targetStatuses = db
        .prepare(
          'SELECT id, category, is_default FROM project_statuses WHERE project_id = ? ORDER BY sort_key',
        )
        .all(input.projectId) as { id: string; category: StatusCategory; is_default: number }[];
      const fallback = targetStatuses.find((s) => s.is_default === 1);
      if (!fallback) throw new Error('Project has no default status');
      const mapStatus = (category: StatusCategory) =>
        targetStatuses.find((s) => s.category === category) ?? fallback;

      const now = nowIso(this.ctx);
      const last = db
        .prepare(
          'SELECT max(sort_key) AS k FROM tasks WHERE project_id = ? AND parent_task_id IS NULL',
        )
        .get(input.projectId) as { k: number | null };
      const update = db.prepare(
        `UPDATE tasks SET project_id = ?, status_id = ?, completed_at = ?, sort_key = ?,
           updated_at = ? WHERE id = ?`,
      );
      const moveOne = (
        id: string,
        category: StatusCategory,
        completedAt: string | null,
        sortKey: number,
      ) => {
        const mapped = mapStatus(category);
        const nextCompleted = mapped.category === 'done' ? (completedAt ?? now) : null;
        update.run(input.projectId, mapped.id, nextCompleted, sortKey, now, id);
      };
      // Parent first, so the subtask guard sees the parent already in the target project.
      moveOne(task.id, task.statusCategory, task.completedAt, keyAfter(last.k));
      const childKeys = db.prepare('SELECT sort_key FROM tasks WHERE id = ?');
      for (const child of children) {
        const { sort_key } = childKeys.get(child.id) as { sort_key: number };
        moveOne(child.id, child.category, child.completed_at, sort_key);
      }
      return removedDeps;
    })();

    return { task: this.get(task.id), removedDependencies: removed };
  }

  /** Manual ordering among siblings: before `beforeTaskId`, or last when null. */
  reorder(input: ReorderTaskInput): Task {
    const task = this.get(input.id);
    const { db } = this.ctx;
    const siblings = db
      .prepare(
        `SELECT id, sort_key FROM tasks
         WHERE project_id = ? AND parent_task_id IS ? AND deleted_at IS NULL AND id <> ?
         ORDER BY sort_key, created_at, id`,
      )
      .all(task.projectId, task.parentTaskId, task.id) as { id: string; sort_key: number }[];

    let index = siblings.length;
    if (input.beforeTaskId !== null) {
      index = siblings.findIndex((s) => s.id === input.beforeTaskId);
      if (index === -1) {
        throw new AppError('VALIDATION_FAILED', 'Tasks can only be reordered among siblings.');
      }
    }
    const previous = siblings[index - 1]?.sort_key ?? null;
    const following = siblings[index]?.sort_key;
    const key = following === undefined ? keyAfter(previous) : keyBetween(previous, following);
    const now = nowIso(this.ctx);
    const update = db.prepare('UPDATE tasks SET sort_key = ?, updated_at = ? WHERE id = ?');

    if (key !== null) {
      update.run(key, now, task.id);
    } else {
      const ordered = siblings.map((s) => s.id);
      ordered.splice(index, 0, task.id);
      const keys = evenlySpacedKeys(ordered.length);
      db.transaction(() => ordered.forEach((id, i) => update.run(keys[i], now, id)))();
    }
    return this.get(task.id);
  }

  private resolveStatus(projectId: string, statusId: string | undefined): StatusRef {
    const { db } = this.ctx;
    const row = (
      statusId === undefined
        ? db
            .prepare(
              'SELECT id, project_id, category FROM project_statuses WHERE project_id = ? AND is_default = 1',
            )
            .get(projectId)
        : db
            .prepare('SELECT id, project_id, category FROM project_statuses WHERE id = ?')
            .get(statusId)
    ) as StatusRef | undefined;
    if (!row || row.project_id !== projectId) {
      throw new AppError('VALIDATION_FAILED', 'The status does not belong to this project.');
    }
    return row;
  }

  private noticesAfterStatusChange(before: Task, after: Task): TaskNotice[] {
    if (before.statusId === after.statusId) return [];
    const { db } = this.ctx;
    const notices: TaskNotice[] = [];

    if (after.statusCategory === 'in_progress' || after.statusCategory === 'done') {
      // Done and cancelled prerequisites count as satisfied; trashed ones are reported elsewhere.
      const unfinished = db
        .prepare(
          `SELECT p.id FROM task_dependencies d
           JOIN tasks p ON p.id = d.depends_on_task_id
           JOIN project_statuses s ON s.id = p.status_id
           WHERE d.task_id = ? AND p.deleted_at IS NULL AND s.category NOT IN ('done', 'cancelled')
           ORDER BY p.id`,
        )
        .all(after.id) as { id: string }[];
      if (unfinished.length > 0) {
        notices.push({ type: 'unfinished_prerequisites', taskIds: unfinished.map((r) => r.id) });
      }
    }

    const enteredDone = after.statusCategory === 'done' && before.statusCategory !== 'done';
    const leftDone = before.statusCategory === 'done' && after.statusCategory !== 'done';
    if (enteredDone && after.parentTaskId !== null) {
      const parent = this.get(after.parentTaskId);
      const open = db
        .prepare(
          `SELECT count(*) AS n FROM tasks c JOIN project_statuses s ON s.id = c.status_id
           WHERE c.parent_task_id = ? AND c.deleted_at IS NULL
             AND s.category NOT IN ('done', 'cancelled')`,
        )
        .get(parent.id) as { n: number };
      if (open.n === 0 && parent.statusCategory !== 'done') {
        notices.push({ type: 'parent_may_be_complete', taskId: parent.id });
      }
    }
    if (enteredDone && this.projects.shouldSuggestCompletion(after.projectId)) {
      notices.push({ type: 'project_may_be_complete', projectId: after.projectId });
    }
    if (leftDone) {
      const project = requireLiveProject(db, after.projectId);
      if (project.status === 'completed') {
        notices.push({ type: 'completed_project_has_open_tasks', projectId: after.projectId });
      }
    }
    return notices;
  }

  private insertTags(taskId: string, tagIds: string[]): void {
    const unique = [...new Set(tagIds)];
    if (unique.length === 0) return;
    const { db } = this.ctx;
    const found = db
      .prepare(`SELECT count(*) AS n FROM tags WHERE id IN (${placeholders(unique.length)})`)
      .get(...unique) as { n: number };
    if (found.n !== unique.length) throw notFound('Tag');
    const insert = db.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)');
    for (const tagId of unique) insert.run(taskId, tagId);
  }
}
