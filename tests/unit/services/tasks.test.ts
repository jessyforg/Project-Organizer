import { describe, expect, it } from 'vitest';
import { addDays } from '../../../src/main/domain/dates';
import { expectAppError, setupProfile, statusOf } from './setup';

describe('TaskService: create and update', () => {
  it('puts quick-added tasks in the Inbox with no priority (R08, R28)', async () => {
    const p = await setupProfile();
    const task = p.tasks.create({ title: 'Buy milk' });
    expect(task).toMatchObject({
      projectId: p.inboxId,
      priority: null,
      statusCategory: 'todo',
      dueDate: null,
      completedAt: null,
    });
  });

  it('infers a subtask project from its parent and limits nesting to one level', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const other = p.projects.create({ name: 'Other' });
    const parent = p.tasks.create({ title: 'Parent', projectId: project.id });
    const child = p.tasks.create({ title: 'Child', parentTaskId: parent.id });
    expect(child.projectId).toBe(project.id);
    expect(p.tasks.get(parent.id).subtaskCount).toBe(1);
    await expectAppError(
      () => p.tasks.create({ title: 'Nested', parentTaskId: child.id }),
      'VALIDATION_FAILED',
    );
    await expectAppError(
      () => p.tasks.create({ title: 'X', parentTaskId: parent.id, projectId: other.id }),
      'VALIDATION_FAILED',
    );
  });

  it('rejects a status from another project', async () => {
    const p = await setupProfile();
    const a = p.projects.create({ name: 'A' });
    const b = p.projects.create({ name: 'B' });
    await expectAppError(
      () => p.tasks.create({ title: 'T', projectId: a.id, statusId: statusOf(p, b.id, 'todo').id }),
      'VALIDATION_FAILED',
    );
  });

  it('refuses new tasks in archived projects', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    p.projects.archive(project.id);
    await expectAppError(() => p.tasks.create({ title: 'T', projectId: project.id }), 'CONFLICT');
  });

  it('sets completedAt only while the status category is "done" (invariant 8)', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const done = statusOf(p, project.id, 'done').id;
    const todo = statusOf(p, project.id, 'todo').id;
    const task = p.tasks.create({ title: 'T', projectId: project.id });
    const completed = p.tasks.update({ id: task.id, statusId: done }).task;
    expect(completed.completedAt).not.toBeNull();
    const renamed = p.tasks.update({ id: task.id, title: 'Renamed' }).task;
    expect(renamed.completedAt).toBe(completed.completedAt);
    expect(p.tasks.update({ id: task.id, statusId: todo }).task.completedAt).toBeNull();
  });

  it('clears fields with null and leaves omitted fields unchanged', async () => {
    const p = await setupProfile();
    const task = p.tasks.create({
      title: 'T',
      priority: 'high',
      dueDate: '2026-04-01',
      description: 'D',
    });
    const updated = p.tasks.update({ id: task.id, priority: null, dueDate: null }).task;
    expect(updated).toMatchObject({ priority: null, dueDate: null, description: 'D', title: 'T' });
    await expectAppError(
      () => p.tasks.update({ id: task.id, startDate: '2026-05-02', dueDate: '2026-05-01' }),
      'VALIDATION_FAILED',
    );
  });

  it('warns about unfinished prerequisites without blocking the change (R12)', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const first = p.tasks.create({ title: 'First', projectId: project.id });
    const second = p.tasks.create({ title: 'Second', projectId: project.id });
    p.dependencies.add({ taskId: second.id, dependsOnTaskId: first.id });

    const result = p.tasks.update({
      id: second.id,
      statusId: statusOf(p, project.id, 'in_progress').id,
    });
    expect(result.task.statusCategory).toBe('in_progress');
    expect(result.notices).toEqual([{ type: 'unfinished_prerequisites', taskIds: [first.id] }]);

    p.tasks.update({ id: first.id, statusId: statusOf(p, project.id, 'done').id });
    const again = p.tasks.update({ id: second.id, statusId: statusOf(p, project.id, 'todo').id });
    expect(again.notices).toEqual([]);
  });

  it('suggests completing the parent and the project, and flags reopened completed projects (R05)', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const done = statusOf(p, project.id, 'done').id;
    const todo = statusOf(p, project.id, 'todo').id;
    const parent = p.tasks.create({ title: 'Parent', projectId: project.id });
    const a = p.tasks.create({ title: 'A', parentTaskId: parent.id });
    const b = p.tasks.create({ title: 'B', parentTaskId: parent.id });

    expect(p.tasks.update({ id: a.id, statusId: done }).notices).toEqual([]);
    const last = p.tasks.update({ id: b.id, statusId: done }).notices;
    expect(last).toContainEqual({ type: 'parent_may_be_complete', taskId: parent.id });
    expect(last).toContainEqual({ type: 'project_may_be_complete', projectId: project.id });

    p.projects.setStatus(project.id, 'completed');
    const reopened = p.tasks.update({ id: a.id, statusId: todo });
    expect(reopened.notices).toEqual([
      { type: 'completed_project_has_open_tasks', projectId: project.id },
    ]);
    expect(p.projects.get(project.id).status).toBe('completed');
  });
});

describe('TaskService: list, sort, filter, search', () => {
  async function seeded() {
    const p = await setupProfile();
    const today = p.time.today();
    const project = p.projects.create({ name: 'Work' });
    const done = statusOf(p, project.id, 'done').id;
    const make = (title: string, extra: Record<string, unknown> = {}) =>
      p.tasks.create({ title, projectId: project.id, ...extra });
    const tasks = {
      urgentLate: make('Urgent late', { priority: 'urgent', dueDate: addDays(today, -2) }),
      lowToday: make('Low today', { priority: 'low', dueDate: today }),
      none: make('No priority'),
      highSoon: make('High soon', { priority: 'high', dueDate: addDays(today, 3) }),
      mediumFar: make('Medium far', { priority: 'medium', dueDate: addDays(today, 30) }),
      doneLate: make('Done late', { dueDate: addDays(today, -5), statusId: done }),
    };
    return { p, project, today, tasks };
  }

  it('sorts by priority: Urgent → High → Medium → Low → none (R10)', async () => {
    const { p, project, tasks } = await seeded();
    const titles = p.tasks.list({ projectId: project.id, sort: 'priority' }).map((t) => t.title);
    expect(titles.indexOf(tasks.urgentLate.title)).toBe(0);
    expect(titles.slice(0, 4)).toEqual(['Urgent late', 'High soon', 'Medium far', 'Low today']);
    expect(titles.slice(4).sort()).toEqual(['Done late', 'No priority']);
  });

  it('sorts by due date with undated tasks last (R11)', async () => {
    const { p, project } = await seeded();
    const titles = p.tasks.list({ projectId: project.id, sort: 'due' }).map((t) => t.title);
    expect(titles).toEqual([
      'Done late',
      'Urgent late',
      'Low today',
      'High soon',
      'Medium far',
      'No priority',
    ]);
  });

  it('filters overdue (excluding done), today, upcoming, and undated', async () => {
    const { p, project } = await seeded();
    const titles = (due: 'overdue' | 'today' | 'upcoming' | 'none') =>
      p.tasks.list({ projectId: project.id, due }).map((t) => t.title);
    expect(titles('overdue')).toEqual(['Urgent late']);
    expect(titles('today')).toEqual(['Low today']);
    expect(titles('upcoming')).toEqual(['High soon']);
    expect(titles('none')).toEqual(['No priority']);
  });

  it('filters by priority including "none", by status category, and by tag', async () => {
    const { p, project, tasks } = await seeded();
    const tag = p.tags.create({ name: 'Focus' });
    p.tags.setTaskTags(tasks.none.id, [tag.id]);
    expect(
      p.tasks
        .list({ projectId: project.id, priorities: ['urgent', 'none'] })
        .map((t) => t.title)
        .sort(),
    ).toEqual(['Done late', 'No priority', 'Urgent late']);
    expect(
      p.tasks.list({ projectId: project.id, statusCategories: ['done'] }).map((t) => t.title),
    ).toEqual(['Done late']);
    expect(p.tasks.list({ tagIds: [tag.id] }).map((t) => t.id)).toEqual([tasks.none.id]);
  });

  it('pages results with limit and offset', async () => {
    const { p, project } = await seeded();
    const all = p.tasks.list({ projectId: project.id, sort: 'due' }).map((t) => t.id);
    const page = p.tasks
      .list({ projectId: project.id, sort: 'due', limit: 2, offset: 2 })
      .map((t) => t.id);
    expect(page).toEqual(all.slice(2, 4));
  });

  it('searches titles and descriptions with prefixes, ignoring case and accents', async () => {
    const p = await setupProfile();
    p.tasks.create({ title: 'Café menu redesign' });
    p.tasks.create({ title: 'Other', description: 'Update the LOGIN page' });
    expect(p.tasks.list({ text: 'cafe' }).map((t) => t.title)).toEqual(['Café menu redesign']);
    expect(p.tasks.list({ text: 'log' }).map((t) => t.title)).toEqual(['Other']);
    expect(p.tasks.list({ text: 'redes menu' }).map((t) => t.title)).toEqual([
      'Café menu redesign',
    ]);
  });

  it.each(['"', 'a" OR "b', 'NEAR(', '*', 'col:value', '-x', '(((', "it's"])(
    'treats %j as plain text without query errors',
    async (text) => {
      const p = await setupProfile();
      p.tasks.create({ title: 'Something' });
      expect(() => p.tasks.list({ text })).not.toThrow();
    },
  );

  it('keeps the search index in sync with edits and excludes trashed tasks', async () => {
    const p = await setupProfile();
    const task = p.tasks.create({ title: 'Alpha' });
    p.tasks.update({ id: task.id, title: 'Beta' });
    expect(p.tasks.list({ text: 'alpha' })).toEqual([]);
    expect(p.tasks.list({ text: 'beta' })).toHaveLength(1);
    p.trash.trashTask(task.id);
    expect(p.tasks.list({ text: 'beta' })).toEqual([]);
  });

  it('global search includes archived projects', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Garden plan' });
    p.tasks.create({ title: 'Plant garden beds', projectId: project.id });
    p.projects.archive(project.id);
    const results = p.search.search('garden');
    expect(results.projects.map((x) => x.name)).toEqual(['Garden plan']);
    expect(results.tasks.map((x) => x.title)).toEqual(['Plant garden beds']);
    expect(p.search.search('   ')).toEqual({ projects: [], tasks: [] });
  });
});

describe('TaskService: move and reorder', () => {
  it('moves a task with its subtasks, maps statuses by category, and removes cross-project links', async () => {
    const p = await setupProfile();
    const source = p.projects.create({ name: 'Source' });
    const target = p.projects.create({ name: 'Target' });
    const parent = p.tasks.create({ title: 'Parent', projectId: source.id });
    const child = p.tasks.create({
      title: 'Child',
      parentTaskId: parent.id,
      statusId: statusOf(p, source.id, 'done').id,
    });
    const other = p.tasks.create({ title: 'Other', projectId: source.id });
    p.dependencies.add({ taskId: parent.id, dependsOnTaskId: other.id });
    p.dependencies.add({ taskId: parent.id, dependsOnTaskId: child.id });

    const result = p.tasks.move({ id: parent.id, projectId: target.id });
    expect(result.removedDependencies).toBe(1);
    expect(result.task).toMatchObject({
      projectId: target.id,
      statusId: statusOf(p, target.id, 'todo').id,
    });
    expect(result.task.prerequisiteIds).toEqual([child.id]);
    const movedChild = p.tasks.get(child.id);
    expect(movedChild).toMatchObject({
      projectId: target.id,
      statusId: statusOf(p, target.id, 'done').id,
    });
    expect(movedChild.completedAt).not.toBeNull();
  });

  it('falls back to the default status when the target lacks the category', async () => {
    const p = await setupProfile();
    const source = p.projects.create({ name: 'S' });
    const target = p.projects.create({ name: 'T' });
    const targetInProgress = statusOf(p, target.id, 'in_progress');
    p.statuses.remove({
      id: targetInProgress.id,
      replacementStatusId: statusOf(p, target.id, 'todo').id,
    });
    const task = p.tasks.create({
      title: 'X',
      projectId: source.id,
      statusId: statusOf(p, source.id, 'in_progress').id,
    });
    expect(p.tasks.move({ id: task.id, projectId: target.id }).task.statusId).toBe(
      statusOf(p, target.id, 'todo').id,
    );
  });

  it('refuses to move a subtask on its own', async () => {
    const p = await setupProfile();
    const target = p.projects.create({ name: 'T' });
    const parent = p.tasks.create({ title: 'P' });
    const child = p.tasks.create({ title: 'C', parentTaskId: parent.id });
    await expectAppError(
      () => p.tasks.move({ id: child.id, projectId: target.id }),
      'VALIDATION_FAILED',
    );
  });

  it('reorders manually, renumbering when there is no room left', async () => {
    const p = await setupProfile();
    const ids = ['A', 'B', 'C'].map((title) => p.tasks.create({ title }).id);
    const order = () => p.tasks.list({ projectId: p.inboxId, sort: 'manual' }).map((t) => t.title);
    expect(order()).toEqual(['A', 'B', 'C']);
    p.tasks.reorder({ id: ids[2]!, beforeTaskId: ids[0]! });
    expect(order()).toEqual(['C', 'A', 'B']);
    // Repeated swaps halve the gap each time until keys must be renumbered.
    for (let i = 0; i < 15; i++) {
      p.tasks.reorder({ id: ids[1]!, beforeTaskId: ids[0]! });
      p.tasks.reorder({ id: ids[0]!, beforeTaskId: ids[1]! });
    }
    expect(order()).toEqual(['C', 'A', 'B']);
    p.tasks.reorder({ id: ids[2]!, beforeTaskId: null });
    expect(order()).toEqual(['A', 'B', 'C']);
    const keys = p.tasks.list({ projectId: p.inboxId, sort: 'manual' }).map((t) => t.sortKey);
    expect(new Set(keys).size).toBe(3);
  });

  it('only reorders among siblings', async () => {
    const p = await setupProfile();
    const parent = p.tasks.create({ title: 'P' });
    const child = p.tasks.create({ title: 'C', parentTaskId: parent.id });
    const other = p.tasks.create({ title: 'O' });
    await expectAppError(
      () => p.tasks.reorder({ id: child.id, beforeTaskId: other.id }),
      'VALIDATION_FAILED',
    );
  });
});
