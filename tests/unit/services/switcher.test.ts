import { describe, expect, it } from 'vitest';
import { RECENT_LIMIT } from '../../../src/main/services/switcher';
import { ipcContract } from '../../../src/shared/ipc-contract';
import { setupProfile } from './setup';

const MISSING = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';

describe('quick switcher search (ADR-0018)', () => {
  it('finds projects, notes, and tasks with their type, project, and folder', async () => {
    const p = await setupProfile();
    const folder = p.folders.create({ name: 'Clients' });
    const project = p.projects.create({ name: 'Website', folderId: folder.id });
    const noteFolder = p.noteFolders.create({ name: 'Meetings' });
    const note = p.notes.create({
      title: 'Website kickoff',
      projectId: project.id,
      folderId: noteFolder.id,
    });
    const task = p.tasks.create({ title: 'Website copy', projectId: project.id });
    const items = p.switcher.search({ text: 'websit' });
    expect(items).toEqual(
      expect.arrayContaining([
        {
          kind: 'project',
          id: project.id,
          title: 'Website',
          projectName: null,
          folderName: 'Clients',
          archived: false,
          completed: false,
        },
        {
          kind: 'note',
          id: note.id,
          title: 'Website kickoff',
          projectName: 'Website',
          folderName: 'Meetings',
          archived: false,
          completed: false,
        },
        {
          kind: 'task',
          id: task.id,
          title: 'Website copy',
          projectName: 'Website',
          folderName: null,
          archived: false,
          completed: false,
        },
      ]),
    );
    expect(items).toHaveLength(3);
  });

  it('ranks titles that start with the text, then titles that contain it, then body matches', async () => {
    const p = await setupProfile();
    p.tasks.create({ title: 'Call about the plan' });
    p.notes.create({ title: 'Ideas', body: 'A plan for spring.' });
    p.tasks.create({ title: 'Plan the launch' });
    p.notes.create({ title: 'Planning notes' });
    const titles = p.switcher.search({ text: 'plan' }).map((item) => item.title);
    // Ties go to the most recently updated item.
    expect(titles).toEqual(['Planning notes', 'Plan the launch', 'Call about the plan', 'Ideas']);
  });

  it('matches several words in any order, and treats % and _ as plain text', async () => {
    const p = await setupProfile();
    p.tasks.create({ title: 'Review the budget draft' });
    p.tasks.create({ title: '100% done' });
    p.tasks.create({ title: '100 things' });
    p.tasks.create({ title: 'abc' });
    p.tasks.create({ title: 'a_c' });
    expect(p.switcher.search({ text: 'draft budget' }).map((i) => i.title)).toEqual([
      'Review the budget draft',
    ]);
    // Full-text search ignores "%", so "100 things" matches the word too, but ranks lower.
    expect(p.switcher.search({ text: '100%' }).map((i) => i.title)).toEqual([
      '100% done',
      '100 things',
    ]);
    // An unescaped "_" would match any character, and so "abc".
    expect(p.switcher.search({ text: 'a_c' }).map((i) => i.title)).toEqual(['a_c']);
    expect(p.switcher.search({ text: '  ' })).toEqual([]);
  });

  it('hides archived items unless asked, and never shows trashed ones', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Old site' });
    p.tasks.create({ title: 'Old site task', projectId: project.id });
    p.notes.create({ title: 'Old site notes', projectId: project.id });
    p.projects.archive(project.id);
    const archivedNote = p.notes.create({ title: 'Old site archived note' });
    p.notes.archive(archivedNote.id);
    const trashed = p.tasks.create({ title: 'Old site trashed' });
    p.trash.trashTask(trashed.id);
    const live = p.projects.create({ name: 'Gone' });
    p.tasks.create({ title: 'Old site in a trashed project', projectId: live.id });
    p.trash.trashProject(live.id);

    expect(p.switcher.search({ text: 'old site' })).toEqual([]);
    const all = p.switcher.search({ text: 'old site', includeArchived: true });
    expect(all.map((i) => i.title).sort()).toEqual([
      'Old site',
      'Old site archived note',
      'Old site notes',
      'Old site task',
    ]);
    expect(all.every((i) => i.archived)).toBe(true);
  });

  it('marks completed tasks', async () => {
    const p = await setupProfile();
    const task = p.tasks.create({ title: 'Ship it' });
    p.tasks.setCompleted(task.id, true);
    expect(p.switcher.search({ text: 'ship' })[0]).toMatchObject({ completed: true });
  });

  it('answers within 100 ms with 5,000 tasks', async () => {
    const p = await setupProfile();
    const insert = p.db.transaction(() => {
      for (let i = 0; i < 5000; i += 1) {
        p.tasks.create({ title: `Task ${i} about invoices and reports`, description: 'Body text' });
      }
    });
    insert();
    p.switcher.search({ text: 'warm up' });
    // Best of three per query, so a pause from another test worker or garbage collection does
    // not count; a slow query (say, a missed index) is slow every time. Typical: 3–40 ms.
    const times: number[] = [];
    for (const text of ['task 4', 'invoices', 'reports 49', 'zzz']) {
      let best = Infinity;
      for (let run = 0; run < 3; run += 1) {
        const start = performance.now();
        const items = p.switcher.search({ text });
        best = Math.min(best, performance.now() - start);
        expect(items.length).toBeLessThanOrEqual(30);
      }
      times.push(best);
    }
    expect(Math.max(...times)).toBeLessThan(100);
  });
});

describe('recent items (ADR-0018)', () => {
  it('keeps the newest distinct items first, up to the limit', async () => {
    const p = await setupProfile();
    const tasks = Array.from({ length: RECENT_LIMIT + 2 }, (_, i) =>
      p.tasks.create({ title: `T${i}` }),
    );
    for (const task of tasks) p.switcher.recordOpened({ kind: 'task', id: task.id });
    p.switcher.recordOpened({ kind: 'task', id: tasks[3]!.id });
    const recent = p.switcher.recent({}).map((i) => i.title);
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent[0]).toBe('T3');
    expect(recent[1]).toBe(`T${RECENT_LIMIT + 1}`);
    expect(new Set(recent).size).toBe(RECENT_LIMIT);
  });

  it('drops trashed and missing items, and hides archived ones unless asked', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Archive me' });
    const note = p.notes.create({ title: 'Keep' });
    const trashed = p.notes.create({ title: 'Trash me' });
    p.switcher.recordOpened({ kind: 'project', id: project.id });
    p.switcher.recordOpened({ kind: 'note', id: note.id });
    p.switcher.recordOpened({ kind: 'note', id: trashed.id });
    p.switcher.recordOpened({ kind: 'task', id: MISSING });
    p.projects.archive(project.id);
    p.trash.trashNote(trashed.id);
    expect(p.switcher.recent({}).map((i) => i.title)).toEqual(['Keep']);
    expect(p.switcher.recent({ includeArchived: true }).map((i) => i.title)).toEqual([
      'Keep',
      'Archive me',
    ]);
  });

  it('ignores a damaged stored list and leaves the other settings alone', async () => {
    const p = await setupProfile();
    p.db
      .prepare(
        "INSERT INTO settings (key, value_json, updated_at) VALUES ('recentItems', '{oops', 'now')",
      )
      .run();
    expect(p.switcher.recent({})).toEqual([]);
    const note = p.notes.create({ title: 'Fresh' });
    p.switcher.recordOpened({ kind: 'note', id: note.id });
    expect(p.switcher.recent({}).map((i) => i.title)).toEqual(['Fresh']);
    expect(p.settings.get().theme).toBe('system');
  });
});

describe('switcher channels', () => {
  it('accept only known kinds, real IDs, and short text', () => {
    const record = ipcContract['switcher:recordOpened'];
    expect(record.safeParse({ kind: 'note', id: MISSING }).success).toBe(true);
    expect(record.safeParse({ kind: 'folder', id: MISSING }).success).toBe(false);
    expect(record.safeParse({ kind: 'note', id: 'x' }).success).toBe(false);
    const search = ipcContract['switcher:search'];
    expect(search.safeParse({ text: 'a'.repeat(201) }).success).toBe(false);
    expect(search.safeParse({ text: 'a', extra: 1 }).success).toBe(false);
  });
});
