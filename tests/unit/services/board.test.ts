import { describe, expect, it } from 'vitest';
import { expectAppError, setupProfile, statusOf, type TestProfile } from './setup';

/** Card titles per column, in board order (manual sort, top-level tasks). */
function board(p: TestProfile, projectId: string): Record<string, string[]> {
  const columns: Record<string, string[]> = {};
  for (const status of p.statuses.listForProject(projectId)) columns[status.name] = [];
  for (const task of p.tasks.list({ projectId, parentTaskId: null, sort: 'manual' })) {
    const status = p.statuses.listForProject(projectId).find((s) => s.id === task.statusId)!;
    columns[status.name]!.push(task.title);
  }
  return columns;
}

async function setupBoard() {
  const p = await setupProfile();
  const project = p.projects.create({ name: 'Website' });
  const [a, b, c] = ['A', 'B', 'C'].map((title) =>
    p.tasks.create({ title, projectId: project.id }),
  );
  const doing = statusOf(p, project.id, 'in_progress');
  const done = statusOf(p, project.id, 'done');
  return { p, project, a: a!, b: b!, c: c!, doing, done };
}

describe('Kanban moves (L1.1)', () => {
  it('moves a card to another column, last or before a chosen card', async () => {
    const { p, project, a, b, c, doing } = await setupBoard();
    p.tasks.moveOnBoard({ id: c.id, statusId: doing.id, beforeTaskId: null });
    p.tasks.moveOnBoard({ id: a.id, statusId: doing.id, beforeTaskId: c.id });
    expect(board(p, project.id)).toMatchObject({ 'To do': ['B'], 'In progress': ['A', 'C'] });
    // Reorder within a column.
    p.tasks.moveOnBoard({ id: c.id, statusId: doing.id, beforeTaskId: a.id });
    expect(board(p, project.id)['In progress']).toEqual(['C', 'A']);
    expect(p.tasks.get(b.id).statusCategory).toBe('todo');
  });

  it('sets and clears completion like any status change, with notices', async () => {
    const { p, a, b, c, done } = await setupBoard();
    p.tasks.moveOnBoard({ id: a.id, statusId: done.id, beforeTaskId: null });
    p.tasks.moveOnBoard({ id: b.id, statusId: done.id, beforeTaskId: null });
    const last = p.tasks.moveOnBoard({ id: c.id, statusId: done.id, beforeTaskId: a.id });
    expect(last.task.completedAt).not.toBeNull();
    expect(last.notices).toContainEqual(
      expect.objectContaining({ type: 'project_may_be_complete' }),
    );
    const todo = p.tasks.get(a.id);
    const reopened = p.tasks.moveOnBoard({
      id: a.id,
      statusId: p.statuses.listForProject(todo.projectId).find((s) => s.isDefault)!.id,
      beforeTaskId: null,
    });
    expect(reopened.task.completedAt).toBeNull();
  });

  it('rejects invalid targets and changes nothing when it does', async () => {
    const { p, project, a, b, doing } = await setupBoard();
    const before = board(p, project.id);
    // The "before" card is in another column.
    await expectAppError(
      () => p.tasks.moveOnBoard({ id: a.id, statusId: doing.id, beforeTaskId: b.id }),
      'VALIDATION_FAILED',
    );
    // A status from another project.
    const other = p.projects.create({ name: 'Other' });
    await expectAppError(
      () =>
        p.tasks.moveOnBoard({
          id: a.id,
          statusId: statusOf(p, other.id, 'todo').id,
          beforeTaskId: null,
        }),
      'VALIDATION_FAILED',
    );
    // Subtasks are not cards.
    const sub = p.tasks.create({ title: 'Sub', parentTaskId: a.id });
    await expectAppError(
      () => p.tasks.moveOnBoard({ id: sub.id, statusId: doing.id, beforeTaskId: null }),
      'VALIDATION_FAILED',
    );
    expect(board(p, project.id)).toEqual(before);
  });
});
