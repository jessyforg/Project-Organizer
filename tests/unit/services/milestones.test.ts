import { describe, expect, it } from 'vitest';
import { expectAppError, setupProfile, statusOf, type TestProfile } from './setup';

function project(p: TestProfile, name = 'Website') {
  return p.projects.create({ name });
}

describe('milestones (ADR-0020)', () => {
  it('lists open milestones by target date, then completed ones, with R13 progress', async () => {
    const p = await setupProfile();
    const site = project(p);
    const launch = p.milestones.create({
      projectId: site.id,
      name: 'Launch',
      targetDate: '2026-04-01',
    });
    const beta = p.milestones.create({
      projectId: site.id,
      name: 'Beta',
      targetDate: '2026-03-20',
    });
    const later = p.milestones.create({ projectId: site.id, name: 'Someday' });
    const done = p.milestones.create({
      projectId: site.id,
      name: 'Kickoff',
      targetDate: '2026-03-01',
    });
    p.milestones.setCompleted(done.id, true);
    expect(p.milestones.list(site.id).map((m) => m.name)).toEqual([
      'Beta',
      'Launch',
      'Someday',
      'Kickoff',
    ]);

    // Leaf counting: a parent with subtasks counts through them; cancelled leaves are left out.
    const parent = p.tasks.create({ title: 'Pages', projectId: site.id, milestoneId: beta.id });
    p.tasks.setCompleted(p.tasks.create({ title: 'Home', parentTaskId: parent.id }).id, true);
    p.tasks.create({ title: 'About', parentTaskId: parent.id });
    const cancelled = p.tasks.create({ title: 'Blog', projectId: site.id, milestoneId: beta.id });
    p.tasks.update({ id: cancelled.id, statusId: statusOf(p, site.id, 'cancelled').id });
    p.tasks.create({ title: 'Elsewhere', projectId: site.id });
    expect(p.milestones.get(beta.id).progress).toEqual({ done: 1, total: 2, ratio: 0.5 });
    // Nothing countable: no ratio ("—"), never 0%.
    expect(p.milestones.get(later.id).progress).toEqual({ done: 0, total: 0, ratio: null });
    expect(p.milestones.get(launch.id).favourite).toBe(false);
  });

  it('completes and reopens without touching its tasks', async () => {
    const p = await setupProfile();
    const site = project(p);
    const m = p.milestones.create({ projectId: site.id, name: 'Beta' });
    const task = p.tasks.create({ title: 'Ship', projectId: site.id, milestoneId: m.id });
    const completed = p.milestones.setCompleted(m.id, true);
    expect(completed.completedAt).not.toBeNull();
    expect(p.tasks.get(task.id).statusCategory).toBe('todo');
    expect(p.milestones.setCompleted(m.id, true).completedAt).toBe(completed.completedAt);
    expect(p.milestones.setCompleted(m.id, false).completedAt).toBeNull();
    const renamed = p.milestones.update({
      id: m.id,
      name: 'Public beta',
      targetDate: '2026-05-01',
    });
    expect(renamed).toMatchObject({
      name: 'Public beta',
      targetDate: '2026-05-01',
      description: null,
    });
  });

  it('lists overdue and upcoming open milestones for the dashboard, and a date range for the calendar', async () => {
    const p = await setupProfile();
    const site = project(p);
    const today = p.time.today();
    const shifted = (days: number) => {
      const d = new Date(`${today}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    p.milestones.create({ projectId: site.id, name: 'Late', targetDate: shifted(-2) });
    p.milestones.create({ projectId: site.id, name: 'Soon', targetDate: shifted(3) });
    p.milestones.create({ projectId: site.id, name: 'Far', targetDate: shifted(30) });
    const finished = p.milestones.create({
      projectId: site.id,
      name: 'Done',
      targetDate: shifted(1),
    });
    p.milestones.setCompleted(finished.id, true);
    const archived = project(p, 'Old');
    p.milestones.create({ projectId: archived.id, name: 'Hidden', targetDate: shifted(1) });
    p.projects.archive(archived.id);

    expect(p.dashboard.get().milestones.map((m) => [m.name, m.projectName])).toEqual([
      ['Late', 'Website'],
      ['Soon', 'Website'],
    ]);
    expect(p.milestones.inRange({ from: shifted(0), to: shifted(31) }).map((m) => m.name)).toEqual([
      'Done',
      'Soon',
      'Far',
    ]);
  });

  it('assigns only top-level tasks to a live milestone of their own project', async () => {
    const p = await setupProfile();
    const site = project(p);
    const other = project(p, 'Other');
    const m = p.milestones.create({ projectId: site.id, name: 'Beta' });
    const foreign = p.milestones.create({ projectId: other.id, name: 'Elsewhere' });
    const task = p.tasks.create({ title: 'Ship', projectId: site.id });
    const sub = p.tasks.create({ title: 'Part', parentTaskId: task.id });

    expect(p.tasks.update({ id: task.id, milestoneId: m.id }).task.milestoneId).toBe(m.id);
    await expectAppError(
      () => p.tasks.update({ id: task.id, milestoneId: foreign.id }),
      'VALIDATION_FAILED',
    );
    await expectAppError(
      () => p.tasks.update({ id: sub.id, milestoneId: m.id }),
      'VALIDATION_FAILED',
    );
    // Updating other fields leaves the milestone alone; null removes it.
    expect(p.tasks.update({ id: task.id, title: 'Ship it' }).task.milestoneId).toBe(m.id);
    expect(p.tasks.update({ id: task.id, milestoneId: null }).task.milestoneId).toBeNull();

    // The database refuses the same, even without the service.
    expect(() =>
      p.db.prepare('UPDATE tasks SET milestone_id = ? WHERE id = ?').run(foreign.id, task.id),
    ).toThrow(/milestone/);
    expect(() =>
      p.db.prepare('UPDATE tasks SET milestone_id = ? WHERE id = ?').run(m.id, sub.id),
    ).toThrow(/milestone/);
  });

  it('clears the milestone when a task moves to another project', async () => {
    const p = await setupProfile();
    const site = project(p);
    const other = project(p, 'Other');
    const m = p.milestones.create({ projectId: site.id, name: 'Beta' });
    const task = p.tasks.create({ title: 'Ship', projectId: site.id, milestoneId: m.id });
    expect(p.tasks.move({ id: task.id, projectId: other.id }).task.milestoneId).toBeNull();
  });

  it('filters a project’s tasks by milestone, subtasks included, or by none', async () => {
    const p = await setupProfile();
    const site = project(p);
    const m = p.milestones.create({ projectId: site.id, name: 'Beta' });
    const parent = p.tasks.create({ title: 'Pages', projectId: site.id, milestoneId: m.id });
    p.tasks.create({ title: 'Home', parentTaskId: parent.id });
    p.tasks.create({ title: 'Loose', projectId: site.id });
    const titles = (milestoneId: string | null) =>
      p.tasks.list({ projectId: site.id, milestoneId, sort: 'created' }).map((t) => t.title);
    // Newest first.
    expect(titles(m.id)).toEqual(['Home', 'Pages']);
    expect(titles(null)).toEqual(['Loose']);
  });

  it('trashes a milestone without its tasks, and restores the links with it', async () => {
    const p = await setupProfile();
    const site = project(p);
    const m = p.milestones.create({ projectId: site.id, name: 'Beta' });
    const task = p.tasks.create({ title: 'Ship', projectId: site.id, milestoneId: m.id });
    p.favourites.set({ kind: 'milestone', id: m.id, starred: true });

    const { batchId } = p.trash.trashMilestone(m.id);
    expect(p.tasks.get(task.id)).toMatchObject({ milestoneId: null, statusCategory: 'todo' });
    expect(p.milestones.list(site.id)).toEqual([]);
    expect(p.favourites.list()).toEqual([]);
    expect(p.trash.list()).toEqual([
      expect.objectContaining({ kind: 'milestone', title: 'Beta', projectName: 'Website' }),
    ]);
    await expectAppError(() => p.tasks.update({ id: task.id, milestoneId: m.id }), 'NOT_FOUND');

    expect(p.trash.restore(batchId)).toMatchObject({ restoredMilestones: 1 });
    expect(p.tasks.get(task.id).milestoneId).toBe(m.id);
    expect(p.favourites.list()).toEqual([
      expect.objectContaining({ kind: 'milestone', itemId: m.id, projectId: site.id }),
    ]);

    // Deleted for good: the task stays, and the link and the star go with the milestone.
    p.trash.trashMilestone(m.id);
    p.trash.empty();
    expect(p.tasks.get(task.id).milestoneId).toBeNull();
    expect(p.db.prepare('SELECT milestone_id FROM tasks WHERE id = ?').get(task.id)).toEqual({
      milestone_id: null,
    });
    expect(p.db.prepare('SELECT count(*) AS n FROM favourites').get()).toEqual({ n: 0 });
  });

  it('goes to the trash with its project, and is restored only after the project', async () => {
    const p = await setupProfile();
    const site = project(p);
    const lone = p.milestones.create({ projectId: site.id, name: 'Lone' });
    const { batchId: loneBatch } = p.trash.trashMilestone(lone.id);
    p.milestones.create({ projectId: site.id, name: 'With project' });
    const { batchId } = p.trash.trashProject(site.id);
    expect(p.trash.list().find((e) => e.kind === 'project')).toMatchObject({ itemCount: 2 });
    await expectAppError(() => p.trash.restore(loneBatch), 'CONFLICT');
    expect(p.trash.restore(batchId)).toMatchObject({ restoredProjects: 1, restoredMilestones: 1 });
    expect(p.milestones.list(site.id).map((m) => m.name)).toEqual(['With project']);
    p.trash.restore(loneBatch);
    expect(p.milestones.list(site.id)).toHaveLength(2);
  });

  it('keeps archived projects’ milestones read-only', async () => {
    const p = await setupProfile();
    const site = project(p);
    const m = p.milestones.create({ projectId: site.id, name: 'Beta' });
    p.projects.archive(site.id);
    await expectAppError(() => p.milestones.update({ id: m.id, name: 'X' }), 'CONFLICT');
    await expectAppError(() => p.milestones.setCompleted(m.id, true), 'CONFLICT');
    await expectAppError(
      () => p.milestones.create({ projectId: site.id, name: 'New' }),
      'CONFLICT',
    );
    await expectAppError(() => p.trash.trashMilestone(m.id), 'CONFLICT');
    expect(p.milestones.list(site.id)).toHaveLength(1);
  });
});
