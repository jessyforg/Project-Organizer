import { describe, expect, it } from 'vitest';
import { addDays } from '../../../src/main/domain/dates';
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels';
import { ipcContract } from '../../../src/shared/ipc-contract';
import { setupProfile, statusOf } from './setup';

describe('TaskService.setCompleted', () => {
  it('completes to the first "done" status and reopens to the default status', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'P' });
    const shipped = p.statuses.add({ projectId: project.id, name: 'Shipped', category: 'done' });
    const task = p.tasks.create({ title: 'T', projectId: project.id });

    const done = p.tasks.setCompleted(task.id, true).task;
    expect(done.statusId).toBe(statusOf(p, project.id, 'done').id);
    expect(done.statusId).not.toBe(shipped.id);
    expect(done.completedAt).not.toBeNull();

    const reopened = p.tasks.setCompleted(task.id, false).task;
    expect(reopened.statusId).toBe(statusOf(p, project.id, 'todo').id);
    expect(reopened.completedAt).toBeNull();
  });

  it('does nothing when the task is already in the requested state', async () => {
    const p = await setupProfile();
    const task = p.tasks.create({ title: 'T' });
    expect(p.tasks.setCompleted(task.id, false)).toEqual({
      task: p.tasks.get(task.id),
      notices: [],
    });
  });
});

describe('SettingsService', () => {
  it('defaults to the system theme, saves changes, and ignores invalid stored values', async () => {
    const p = await setupProfile();
    expect(p.settings.get()).toEqual({ theme: 'system' });
    expect(p.settings.update({ theme: 'dark' })).toEqual({ theme: 'dark' });
    p.db.prepare("UPDATE settings SET value_json = '\"neon\"' WHERE key = 'theme'").run();
    expect(p.settings.get()).toEqual({ theme: 'system' });
    p.db.prepare("UPDATE settings SET value_json = 'not json' WHERE key = 'theme'").run();
    expect(p.settings.get()).toEqual({ theme: 'system' });
  });
});

describe('DashboardService', () => {
  it('computes every section and count from data (R16)', async () => {
    const p = await setupProfile();
    const today = p.time.today();
    const project = p.projects.create({ name: 'Active' });
    const archived = p.projects.create({ name: 'Hidden' });
    p.tasks.create({ title: 'Late', projectId: project.id, dueDate: addDays(today, -1) });
    p.tasks.create({ title: 'Now', projectId: project.id, dueDate: today });
    p.tasks.create({ title: 'Soon', projectId: project.id, dueDate: addDays(today, 3) });
    const finished = p.tasks.create({ title: 'Finished', projectId: project.id });
    p.tasks.setCompleted(finished.id, true);
    p.tasks.create({ title: 'Archived task', projectId: archived.id, dueDate: today });
    p.projects.archive(archived.id);

    const d = p.dashboard.get();
    expect(d.today).toBe(today);
    expect(d.overdue.map((t) => t.title)).toEqual(['Late']);
    expect(d.dueToday.map((t) => t.title)).toEqual(['Now']);
    expect(d.upcoming.map((t) => t.title)).toEqual(['Soon']);
    expect(d.recentlyCompleted.map((t) => t.title)).toEqual(['Finished']);
    expect(d.recentlyUpdated[0]?.title).toBe('Finished');
    expect(d.activeProjects.map((x) => x.name)).toEqual(['Active']);
    expect(d.activeProjects[0]?.progress).toEqual({ done: 1, total: 4, ratio: 0.25 });
    expect(d.openTaskCount).toBe(3);
    expect(d.completedThisWeek).toBe(1);
  });
});

describe('IPC contract', () => {
  it('defines a schema for exactly the listed channels', () => {
    expect(Object.keys(ipcContract).sort()).toEqual([...IPC_CHANNELS].sort());
  });
});
