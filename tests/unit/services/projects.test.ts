import { describe, expect, it } from 'vitest';
import { ensureInbox } from '../../../src/main/services/projects';
import { expectAppError, setupProfile, statusOf } from './setup';

describe('ProjectService', () => {
  it('creates the Inbox once, first in the list (invariant 7)', async () => {
    const p = await setupProfile();
    expect(ensureInbox(p.ctx)).toBe(p.inboxId);
    p.projects.create({ name: 'Alpha' });
    const list = p.projects.list();
    expect(list[0]).toMatchObject({ id: p.inboxId, isInbox: true, name: 'Inbox' });
    expect(list.filter((x) => x.isInbox)).toHaveLength(1);
  });

  it('creates a project with defaults and the default workflow', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Website', kind: 'software', color: 'blue' });
    expect(project).toMatchObject({
      status: 'active',
      kind: 'software',
      color: 'blue',
      archivedAt: null,
    });
    const statuses = p.statuses.listForProject(project.id);
    expect(statuses.map((s) => [s.name, s.category, s.isDefault])).toEqual([
      ['To do', 'todo', true],
      ['In progress', 'in_progress', false],
      ['Done', 'done', false],
      ['Cancelled', 'cancelled', false],
    ]);
  });

  it('keeps the ID stable when renamed (invariant 6)', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Old' });
    const renamed = p.projects.update({ id: project.id, name: 'New', description: 'D' });
    expect(renamed).toMatchObject({ id: project.id, name: 'New', description: 'D' });
  });

  it('rejects a start date after the target date', async () => {
    const p = await setupProfile();
    await expectAppError(
      () => p.projects.create({ name: 'X', startDate: '2026-05-02', targetDate: '2026-05-01' }),
      'VALIDATION_FAILED',
    );
    const project = p.projects.create({ name: 'Y', targetDate: '2026-05-01' });
    await expectAppError(
      () => p.projects.update({ id: project.id, startDate: '2026-06-01' }),
      'VALIDATION_FAILED',
    );
  });

  it('keeps archive independent of status and tasks (invariant 12)', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const task = p.tasks.create({ title: 'Open task', projectId: project.id });
    p.projects.setStatus(project.id, 'completed');
    p.projects.archive(project.id);

    expect(p.projects.list().some((x) => x.id === project.id)).toBe(false);
    expect(p.projects.list({ includeArchived: true }).some((x) => x.id === project.id)).toBe(true);
    expect(p.tasks.list().some((t) => t.id === task.id)).toBe(false);

    const restored = p.projects.unarchive(project.id);
    expect(restored).toMatchObject({ status: 'completed', archivedAt: null });
    expect(p.tasks.get(task.id)).toMatchObject({ statusCategory: 'todo', title: 'Open task' });
  });

  it('protects the Inbox from completion and archiving', async () => {
    const p = await setupProfile();
    await expectAppError(() => p.projects.setStatus(p.inboxId, 'completed'), 'VALIDATION_FAILED');
    await expectAppError(() => p.projects.archive(p.inboxId), 'VALIDATION_FAILED');
  });

  it('calculates progress and suggests completion only when all countable tasks are done (R05)', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    expect(p.projects.progress(project.id).ratio).toBeNull();
    expect(p.projects.shouldSuggestCompletion(project.id)).toBe(false);

    const done = statusOf(p, project.id, 'done').id;
    const cancelled = statusOf(p, project.id, 'cancelled').id;
    p.tasks.create({ title: 'A', projectId: project.id, statusId: done });
    p.tasks.create({ title: 'B', projectId: project.id, statusId: cancelled });
    const open = p.tasks.create({ title: 'C', projectId: project.id });
    expect(p.projects.progress(project.id)).toEqual({ done: 1, total: 2, ratio: 0.5 });
    expect(p.projects.shouldSuggestCompletion(project.id)).toBe(false);

    p.tasks.update({ id: open.id, statusId: done });
    expect(p.projects.shouldSuggestCompletion(project.id)).toBe(true);
    expect(p.projects.progressFor([project.id]).get(project.id)?.ratio).toBe(1);
  });

  it('excludes trashed tasks from progress', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const t = p.tasks.create({ title: 'A', projectId: project.id });
    p.tasks.create({
      title: 'B',
      projectId: project.id,
      statusId: statusOf(p, project.id, 'done').id,
    });
    p.trash.trashTask(t.id);
    expect(p.projects.progress(project.id)).toEqual({ done: 1, total: 1, ratio: 1 });
  });

  it('moves projects to "no folder" when their folder is deleted', async () => {
    const p = await setupProfile();
    const folder = p.folders.create({ name: 'Work' });
    const project = p.projects.create({ name: 'P', folderId: folder.id });
    p.folders.delete(folder.id);
    expect(p.projects.get(project.id).folderId).toBeNull();
  });
});

describe('StatusService', () => {
  it('adds, renames, and reorders statuses', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const review = p.statuses.add({
      projectId: project.id,
      name: 'Review',
      category: 'in_progress',
    });
    await expectAppError(
      () => p.statuses.add({ projectId: project.id, name: 'review', category: 'todo' }),
      'CONFLICT',
    );
    p.statuses.rename(review.id, 'Code review');
    const ids = p.statuses
      .listForProject(project.id)
      .map((s) => s.id)
      .reverse();
    expect(p.statuses.reorder(project.id, ids).map((s) => s.id)).toEqual(ids);
    await expectAppError(() => p.statuses.reorder(project.id, ids.slice(1)), 'VALIDATION_FAILED');
  });

  it('only allows "to do" or "in progress" statuses as the default', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    await expectAppError(
      () => p.statuses.setDefault(statusOf(p, project.id, 'done').id),
      'VALIDATION_FAILED',
    );
    const inProgress = statusOf(p, project.id, 'in_progress');
    p.statuses.setDefault(inProgress.id);
    expect(
      p.statuses
        .listForProject(project.id)
        .filter((s) => s.isDefault)
        .map((s) => s.id),
    ).toEqual([inProgress.id]);
    expect(p.tasks.create({ title: 'T', projectId: project.id }).statusId).toBe(inProgress.id);
  });

  it('removes an in-use status by reassigning its tasks, including trashed ones', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const doneA = statusOf(p, project.id, 'done');
    const doneB = p.statuses.add({ projectId: project.id, name: 'Shipped', category: 'done' });
    const todo = statusOf(p, project.id, 'todo');
    const live = p.tasks.create({ title: 'Live', projectId: project.id, statusId: doneB.id });
    const trashed = p.tasks.create({ title: 'Trashed', projectId: project.id, statusId: doneB.id });
    p.trash.trashTask(trashed.id);

    expect(p.statuses.remove({ id: doneB.id, replacementStatusId: doneA.id })).toEqual({
      reassignedTasks: 2,
    });
    expect(p.tasks.get(live.id)).toMatchObject({ statusId: doneA.id, statusCategory: 'done' });

    // Reassigning out of "done" clears completed_at (invariant 8).
    const shipped = p.statuses.add({ projectId: project.id, name: 'Shipped', category: 'done' });
    const t = p.tasks.create({ title: 'T', projectId: project.id, statusId: shipped.id });
    expect(t.completedAt).not.toBeNull();
    p.statuses.remove({ id: shipped.id, replacementStatusId: todo.id });
    expect(p.tasks.get(t.id).completedAt).toBeNull();
  });

  it('refuses to remove the default status or the last "done" status', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const todo = statusOf(p, project.id, 'todo');
    const done = statusOf(p, project.id, 'done');
    await expectAppError(
      () => p.statuses.remove({ id: todo.id, replacementStatusId: done.id }),
      'CONFLICT',
    );
    await expectAppError(
      () => p.statuses.remove({ id: done.id, replacementStatusId: todo.id }),
      'CONFLICT',
    );
  });

  it('refuses a replacement from another project', async () => {
    const p = await setupProfile();
    const a = p.projects.create({ name: 'A' });
    const b = p.projects.create({ name: 'B' });
    await expectAppError(
      () =>
        p.statuses.remove({
          id: statusOf(p, a.id, 'in_progress').id,
          replacementStatusId: statusOf(p, b.id, 'todo').id,
        }),
      'VALIDATION_FAILED',
    );
  });
});

describe('FolderService and TagService', () => {
  it('rejects duplicate folder and tag names case-insensitively', async () => {
    const p = await setupProfile();
    p.folders.create({ name: 'Work' });
    await expectAppError(() => p.folders.create({ name: 'WORK' }), 'CONFLICT');
    p.tags.create({ name: 'Bug' });
    await expectAppError(() => p.tags.create({ name: 'bug' }), 'CONFLICT');
  });

  it('orders folders and reorders them', async () => {
    const p = await setupProfile();
    const a = p.folders.create({ name: 'A' });
    const b = p.folders.create({ name: 'B' });
    expect(p.folders.list().map((f) => f.id)).toEqual([a.id, b.id]);
    expect(p.folders.reorder([b.id, a.id]).map((f) => f.id)).toEqual([b.id, a.id]);
  });

  it('sets task and project tags; deleting a tag removes its links', async () => {
    const p = await setupProfile();
    const bug = p.tags.create({ name: 'Bug', color: 'red' });
    const ui = p.tags.create({ name: 'UI' });
    const project = p.projects.create({ name: 'P', tagIds: [ui.id] });
    const task = p.tasks.create({ title: 'T', projectId: project.id, tagIds: [bug.id] });
    p.tags.setTaskTags(task.id, [bug.id, ui.id, bug.id]);
    expect(p.tasks.get(task.id).tagIds).toEqual([bug.id, ui.id].sort());
    p.tags.delete(bug.id);
    expect(p.tasks.get(task.id).tagIds).toEqual([ui.id]);
    expect(p.projects.get(project.id).tagIds).toEqual([ui.id]);
    await expectAppError(() => p.tags.setTaskTags(task.id, [bug.id]), 'NOT_FOUND');
  });
});
