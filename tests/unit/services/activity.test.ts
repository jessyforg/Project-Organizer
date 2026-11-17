import { describe, expect, it } from 'vitest';
import type { ActivityEvent } from '../../../src/shared/domain';
import { ipcContract } from '../../../src/shared/ipc-contract';
import { expectAppError, setupProfile, statusOf, type TestProfile } from './setup';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const MISSING = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';

/** Oldest first, as [action, field, old, new], for readable expectations. */
const steps = (events: ActivityEvent[]) =>
  [...events].reverse().map((e) => [e.action, e.field, e.oldValue, e.newValue]);

const count = (p: TestProfile) =>
  (p.db.prepare('SELECT count(*) AS n FROM activity_events').get() as { n: number }).n;

describe('the activity log (ADR-0021)', () => {
  it('records a task’s life: created, renamed, changed, moved, trashed, restored', async () => {
    const p = await setupProfile();
    const site = p.projects.create({ name: 'Website' });
    const other = p.projects.create({ name: 'Other' });
    const beta = p.milestones.create({ projectId: site.id, name: 'Beta' });
    const task = p.tasks.create({ title: 'Ship', projectId: site.id });
    p.tasks.update({ id: task.id, title: 'Ship it', priority: 'high', dueDate: '2026-04-01' });
    p.tasks.setCompleted(task.id, true);
    p.tasks.update({ id: task.id, milestoneId: beta.id });
    p.tasks.update({ id: task.id, description: 'Not recorded' });
    p.tasks.move({ id: task.id, projectId: other.id });
    const { batchId } = p.trash.trashTask(task.id);
    p.trash.restore(batchId);

    const done = statusOf(p, site.id, 'done').name;
    expect(steps(p.activity.forItem({ kind: 'task', id: task.id, limit: 50 }))).toEqual([
      ['created', null, null, null],
      ['renamed', null, 'Ship', 'Ship it'],
      ['changed', 'priority', null, 'high'],
      ['changed', 'due_date', null, '2026-04-01'],
      ['changed', 'status', statusOf(p, site.id, 'todo').name, done],
      ['changed', 'milestone', null, 'Beta'],
      ['moved', null, 'Website', 'Other'],
      ['trashed', null, null, null],
      ['restored', null, null, null],
    ]);
    const latest = p.activity.forItem({ kind: 'task', id: task.id, limit: 1 })[0]!;
    expect(latest).toMatchObject({ title: 'Ship it', projectId: other.id, live: true });
  });

  it('records projects and milestones, and a project’s feed includes its items', async () => {
    const p = await setupProfile();
    const folder = p.folders.create({ name: 'Clients' });
    const site = p.projects.create({ name: 'Website' });
    p.projects.update({ id: site.id, name: 'Site', folderId: folder.id, color: 'red' });
    p.projects.setStatus(site.id, 'completed');
    p.projects.setStatus(site.id, 'active');
    p.projects.archive(site.id);
    p.projects.unarchive(site.id);
    const m = p.milestones.create({ projectId: site.id, name: 'Beta' });
    p.milestones.update({ id: m.id, name: 'Beta 2', targetDate: '2026-05-01', description: 'x' });
    p.milestones.setCompleted(m.id, true);
    p.trash.trashMilestone(m.id);

    expect(steps(p.activity.forItem({ kind: 'project', id: site.id, limit: 50 }))).toEqual([
      ['created', null, null, null],
      ['renamed', null, 'Website', 'Site'],
      ['changed', 'folder', null, 'Clients'],
      ['completed', null, null, null],
      ['reopened', null, null, null],
      ['archived', null, null, null],
      ['unarchived', null, null, null],
    ]);
    expect(steps(p.activity.forItem({ kind: 'milestone', id: m.id, limit: 50 }))).toEqual([
      ['created', null, null, null],
      ['renamed', null, 'Beta', 'Beta 2'],
      ['changed', 'target_date', null, '2026-05-01'],
      ['completed', null, null, null],
      ['trashed', null, null, null],
    ]);
    const feed = p.activity.forProject({ projectId: site.id, limit: 50 });
    expect(feed).toHaveLength(12);
    expect(feed[0]).toMatchObject({ itemKind: 'milestone', action: 'trashed', live: false });
  });

  it('records nothing when nothing changes', async () => {
    const p = await setupProfile();
    const site = p.projects.create({ name: 'Website' });
    const task = p.tasks.create({ title: 'Ship', projectId: site.id });
    const note = p.notes.create({ title: 'Plan', projectId: site.id });
    const before = count(p);
    p.tasks.update({ id: task.id, title: 'Ship' });
    p.tasks.setCompleted(task.id, false);
    p.projects.setStatus(site.id, 'active');
    p.projects.unarchive(site.id);
    p.notes.update({ id: note.id, title: 'Plan' });
    p.notes.setFolder({ id: note.id, folderId: null });
    p.notes.unarchive(note.id);
    p.notes.move({ id: note.id, projectId: site.id });
    expect(count(p)).toBe(before);
  });

  it('records nothing for a change that fails, even after its event was written', async () => {
    const p = await setupProfile();
    const before = count(p);
    // The first note is written and recorded, then the second fails: all or nothing.
    await expectAppError(
      () =>
        p.notes.import({
          notes: [
            { title: 'One', body: '' },
            { title: 'Two', body: '' },
          ],
          folderId: MISSING,
        }),
      'NOT_FOUND',
    );
    await expectAppError(() => p.tasks.create({ title: 'Tagged', tagIds: [MISSING] }), 'NOT_FOUND');
    expect(count(p)).toBe(before);
    expect(p.notes.list()).toEqual([]);

    // A change and its event share one transaction: when it rolls back after both were
    // written, neither stays.
    expect(() =>
      p.db.transaction(() => {
        p.tasks.create({ title: 'Rolled back' });
        expect(count(p)).toBe(before + 1);
        throw new Error('later failure');
      })(),
    ).toThrow('later failure');
    expect(count(p)).toBe(before);
    expect(p.tasks.list()).toEqual([]);
  });

  it('merges a note’s renames and edits within 10 minutes, and records files', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'Draft' });
    p.notes.update({ id: note.id, title: 'Draft 2', body: 'a' });
    p.notes.update({ id: note.id, title: 'Plan', body: 'ab' });
    p.time.advanceDays(5 / 1440);
    p.notes.update({ id: note.id, body: 'abc' });
    const file = p.attachments.add({ noteId: note.id, name: 'map.png', data: PNG });
    p.notes.update({ id: note.id, body: `abc ![m](projectforge://file/${file.id})` });
    p.notes.update({ id: note.id, body: 'abc' });
    p.time.advanceDays(11 / 1440);
    p.notes.update({ id: note.id, body: 'abcd' });

    expect(steps(p.activity.forItem({ kind: 'note', id: note.id, limit: 50 }))).toEqual([
      ['created', null, null, null],
      ['renamed', null, 'Draft', 'Plan'],
      ['attachment_added', null, null, 'map.png'],
      ['edited', null, null, null],
      ['attachment_removed', null, 'map.png', null],
      ['edited', null, null, null],
    ]);
  });

  it('marks gone items in the profile-wide feed, and forgets items deleted for good', async () => {
    const p = await setupProfile();
    const site = p.projects.create({ name: 'Website' });
    const task = p.tasks.create({ title: 'Secret', projectId: site.id });
    const keep = p.tasks.create({ title: 'Keep' });
    p.trash.trashTask(task.id);
    expect(p.activity.recent({ limit: 2 }).map((e) => [e.title, e.action, e.live])).toEqual([
      ['Secret', 'trashed', false],
      ['Keep', 'created', true],
    ]);
    p.trash.trashProject(site.id);
    p.trash.empty();
    expect(p.activity.recent({ limit: 50 }).map((e) => e.title)).toEqual(['Keep']);
    expect(p.activity.forItem({ kind: 'task', id: keep.id, limit: 5 })).toHaveLength(1);
  });

  it('keeps events for the retention period only', async () => {
    const p = await setupProfile();
    p.tasks.create({ title: 'Old' });
    p.time.advanceDays(100);
    p.tasks.create({ title: 'New' });
    expect(p.activity.purgeOlderThan(90)).toBe(1);
    expect(p.activity.recent({ limit: 5 }).map((e) => e.title)).toEqual(['New']);
    expect(p.settings.get().activityRetentionDays).toBe(365);
    expect(p.settings.update({ activityRetentionDays: 730 }).activityRetentionDays).toBe(730);
  });

  it('lists one item’s activity within 50 ms among 100,000 events', async () => {
    const p = await setupProfile();
    const insert = p.db.prepare(
      `INSERT INTO activity_events (at, item_kind, item_id, project_id, title, action)
       VALUES (?, 'task', ?, ?, 'Task', 'renamed')`,
    );
    const items = Array.from({ length: 1000 }, () => crypto.randomUUID());
    p.db.transaction(() => {
      for (let i = 0; i < 100_000; i += 1) {
        const at = new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
        insert.run(at, items[i % 1000]!, items[i % 7]!);
      }
    })();
    let best = Infinity;
    for (let run = 0; run < 3; run += 1) {
      const start = performance.now();
      const events = p.activity.forItem({ kind: 'task', id: items[500]!, limit: 50 });
      best = Math.min(best, performance.now() - start);
      expect(events).toHaveLength(50);
    }
    expect(best).toBeLessThan(50);
  }, 60_000);

  it('accepts only known kinds and small limits at the IPC boundary', () => {
    const forItem = ipcContract['activity:forItem'];
    expect(forItem.safeParse({ kind: 'task', id: MISSING, limit: 50 }).success).toBe(true);
    expect(forItem.safeParse({ kind: 'tag', id: MISSING, limit: 50 }).success).toBe(false);
    expect(forItem.safeParse({ kind: 'task', id: MISSING, limit: 501 }).success).toBe(false);
  });
});
