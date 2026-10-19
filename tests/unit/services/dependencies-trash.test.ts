import { describe, expect, it } from 'vitest';
import { TRASH_RETENTION_DAYS } from '../../../src/shared/domain';
import { expectAppError, setupProfile } from './setup';

describe('DependencyService (invariant 5)', () => {
  it('rejects self, direct, and indirect cycles', async () => {
    const p = await setupProfile();
    const [a, b, c] = ['A', 'B', 'C'].map((title) => p.tasks.create({ title }));
    await expectAppError(
      () => p.dependencies.add({ taskId: a!.id, dependsOnTaskId: a!.id }),
      'DEPENDENCY_CYCLE',
    );
    p.dependencies.add({ taskId: a!.id, dependsOnTaskId: b!.id });
    await expectAppError(
      () => p.dependencies.add({ taskId: b!.id, dependsOnTaskId: a!.id }),
      'DEPENDENCY_CYCLE',
    );
    p.dependencies.add({ taskId: b!.id, dependsOnTaskId: c!.id });
    await expectAppError(
      () => p.dependencies.add({ taskId: c!.id, dependsOnTaskId: a!.id }),
      'DEPENDENCY_CYCLE',
    );
    // A diamond is not a cycle.
    p.dependencies.add({ taskId: a!.id, dependsOnTaskId: c!.id });
    expect(p.tasks.get(a!.id).prerequisiteIds).toEqual([b!.id, c!.id].sort());
  });

  it('rejects dependencies across projects and on trashed tasks', async () => {
    const p = await setupProfile();
    const other = p.projects.create({ name: 'Other' });
    const a = p.tasks.create({ title: 'A' });
    const b = p.tasks.create({ title: 'B', projectId: other.id });
    await expectAppError(
      () => p.dependencies.add({ taskId: a.id, dependsOnTaskId: b.id }),
      'VALIDATION_FAILED',
    );
    const c = p.tasks.create({ title: 'C' });
    p.trash.trashTask(c.id);
    await expectAppError(
      () => p.dependencies.add({ taskId: a.id, dependsOnTaskId: c.id }),
      'NOT_FOUND',
    );
  });

  it('lists prerequisites (flagging trashed ones) and dependents', async () => {
    const p = await setupProfile();
    const a = p.tasks.create({ title: 'A' });
    const b = p.tasks.create({ title: 'B' });
    p.dependencies.add({ taskId: a.id, dependsOnTaskId: b.id });
    expect(p.dependencies.dependents(b.id).map((t) => t.id)).toEqual([a.id]);
    p.trash.trashTask(b.id);
    expect(p.dependencies.prerequisites(a.id)).toEqual([
      { id: b.id, title: 'B', statusCategory: 'todo', trashed: true },
    ]);
    p.dependencies.remove({ taskId: a.id, dependsOnTaskId: b.id });
    expect(p.dependencies.prerequisites(a.id)).toEqual([]);
  });
});

describe('TrashService', () => {
  it('trashes and restores a parent with its subtasks together (invariant 9)', async () => {
    const p = await setupProfile();
    const parent = p.tasks.create({ title: 'Parent' });
    const child = p.tasks.create({ title: 'Child', parentTaskId: parent.id });
    expect(p.trash.previewTaskTrash(parent.id).subtaskCount).toBe(1);
    const { batchId } = p.trash.trashTask(parent.id);
    expect(p.tasks.list().map((t) => t.id)).toEqual([]);
    expect(p.trash.list()).toEqual([
      expect.objectContaining({
        batchId,
        kind: 'task',
        title: 'Parent',
        projectName: 'Inbox',
        itemCount: 2,
      }),
    ]);

    expect(p.trash.restore(batchId)).toEqual({
      restoredProjects: 0,
      restoredTasks: 2,
      restoredNotes: 0,
      unresolvedDependencies: [],
    });
    expect(p.tasks.get(child.id).parentTaskId).toBe(parent.id);
    expect(p.trash.list()).toEqual([]);
  });

  it('warns about dependents before trashing', async () => {
    const p = await setupProfile();
    const prereq = p.tasks.create({ title: 'Prereq' });
    const sub = p.tasks.create({ title: 'Sub', parentTaskId: prereq.id });
    const dependent = p.tasks.create({ title: 'Dependent' });
    p.dependencies.add({ taskId: dependent.id, dependsOnTaskId: sub.id });
    expect(p.trash.previewTaskTrash(prereq.id).dependents.map((d) => d.id)).toEqual([dependent.id]);
  });

  it('refuses to restore a task whose project or parent is still in the trash', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const parent = p.tasks.create({ title: 'Parent', projectId: project.id });
    const child = p.tasks.create({ title: 'Child', parentTaskId: parent.id });
    const childBatch = p.trash.trashTask(child.id).batchId;
    const parentBatch = p.trash.trashTask(parent.id).batchId;
    await expectAppError(() => p.trash.restore(childBatch), 'CONFLICT');

    const projectBatch = p.trash.trashProject(project.id).batchId;
    await expectAppError(() => p.trash.restore(parentBatch), 'CONFLICT');

    expect(p.trash.restore(projectBatch).restoredProjects).toBe(1);
    p.trash.restore(parentBatch);
    p.trash.restore(childBatch);
    expect(p.tasks.get(child.id).parentTaskId).toBe(parent.id);
  });

  it('restores a project with its tasks unchanged; earlier-trashed tasks stay in the trash', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const kept = p.tasks.create({ title: 'Kept', projectId: project.id });
    const earlier = p.tasks.create({ title: 'Earlier', projectId: project.id });
    p.trash.trashTask(earlier.id);
    const { batchId } = p.trash.trashProject(project.id);
    expect(p.trash.list().find((e) => e.batchId === batchId)).toMatchObject({
      kind: 'project',
      itemCount: 2,
    });
    expect(p.trash.restore(batchId)).toEqual({
      restoredProjects: 1,
      restoredTasks: 1,
      restoredNotes: 0,
      unresolvedDependencies: [],
    });
    expect(p.tasks.get(kept.id).title).toBe('Kept');
    await expectAppError(() => p.tasks.get(earlier.id), 'NOT_FOUND');
  });

  it('reports dependencies on still-trashed prerequisites as unresolved (invariant 10)', async () => {
    const p = await setupProfile();
    const a = p.tasks.create({ title: 'A' });
    const b = p.tasks.create({ title: 'B' });
    p.dependencies.add({ taskId: a.id, dependsOnTaskId: b.id });
    const batchA = p.trash.trashTask(a.id).batchId;
    p.trash.trashTask(b.id);
    expect(p.trash.restore(batchA).unresolvedDependencies).toEqual([
      { taskId: a.id, prerequisiteId: b.id },
    ]);
  });

  it('never recreates permanently deleted records; their links are removed (invariant 10)', async () => {
    const p = await setupProfile();
    const a = p.tasks.create({ title: 'A' });
    const b = p.tasks.create({ title: 'B' });
    p.dependencies.add({ taskId: a.id, dependsOnTaskId: b.id });
    const batchA = p.trash.trashTask(a.id).batchId;
    const batchB = p.trash.trashTask(b.id).batchId;
    p.trash.deletePermanently(batchB);
    expect(p.trash.restore(batchA).unresolvedDependencies).toEqual([]);
    expect(p.tasks.get(a.id).prerequisiteIds).toEqual([]);
    await expectAppError(() => p.trash.restore(batchB), 'NOT_FOUND');
    await expectAppError(() => p.tasks.get(b.id), 'NOT_FOUND');
  });

  it('purges only batches older than 30 days, using the clock (R14)', async () => {
    const p = await setupProfile();
    const old = p.tasks.create({ title: 'Old' });
    const project = p.projects.create({ name: 'Old project' });
    p.tasks.create({ title: 'In project', projectId: project.id });
    p.trash.trashTask(old.id);
    p.trash.trashProject(project.id);
    p.time.advanceDays(TRASH_RETENTION_DAYS - 1);
    const recent = p.tasks.create({ title: 'Recent' });
    p.trash.trashTask(recent.id);

    expect(p.trash.purgeExpired()).toBe(0);
    p.time.advanceDays(2);
    expect(p.trash.purgeExpired()).toBe(2);
    expect(p.trash.list().map((e) => e.title)).toEqual(['Recent']);
    expect(
      p.db
        .prepare('SELECT count(*) AS n FROM project_statuses WHERE project_id = ?')
        .get(project.id),
    ).toEqual({
      n: 0,
    });
  });

  it('empties the trash and protects the Inbox', async () => {
    const p = await setupProfile();
    p.trash.trashTask(p.tasks.create({ title: 'A' }).id);
    p.trash.trashProject(p.projects.create({ name: 'P' }).id);
    expect(p.trash.empty()).toBe(2);
    expect(p.trash.list()).toEqual([]);
    await expectAppError(() => p.trash.trashProject(p.inboxId), 'VALIDATION_FAILED');
  });

  it('reports purge dates 30 days after deletion', async () => {
    const p = await setupProfile();
    p.trash.trashTask(p.tasks.create({ title: 'A' }).id);
    const [entry] = p.trash.list();
    expect(Date.parse(entry!.purgeAfter) - Date.parse(entry!.deletedAt)).toBe(
      TRASH_RETENTION_DAYS * 86_400_000,
    );
  });
});
