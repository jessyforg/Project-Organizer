import { describe, expect, it } from 'vitest';
import { expectAppError, setupProfile } from './setup';

describe('Archiving notes', () => {
  it('hides archived notes from lists and folder counts, and shows them on request', async () => {
    const p = await setupProfile();
    const folder = p.noteFolders.create({ name: 'Work' });
    const kept = p.notes.create({ title: 'Kept', folderId: folder.id });
    const old = p.notes.create({ title: 'Old', folderId: folder.id });
    const archived = p.notes.archive(old.id);
    expect(archived.archivedAt).not.toBeNull();
    expect(p.notes.list().map((n) => n.title)).toEqual(['Kept']);
    expect(p.notes.list({ archived: 'only' }).map((n) => n.title)).toEqual(['Old']);
    expect(p.notes.list({ archived: 'include' }).map((n) => n.title)).toEqual(['Old', 'Kept']);
    expect(p.noteFolders.list()[0]!.noteCount).toBe(1);
    expect(p.notes.unarchive(old.id).archivedAt).toBeNull();
    expect(
      p.notes
        .list()
        .map((n) => n.title)
        .sort(),
    ).toEqual(['Kept', 'Old']);
    expect(kept.archivedAt).toBeNull();
  });

  it('keeps archived notes read-only until they are unarchived', async () => {
    const p = await setupProfile();
    const note = p.notes.archive(p.notes.create({ title: 'Plan', body: 'A' }).id);
    await expectAppError(() => p.notes.update({ id: note.id, body: 'B' }), 'CONFLICT');
    p.notes.unarchive(note.id);
    expect(p.notes.update({ id: note.id, body: 'B' }).body).toBe('B');
  });

  it('finds archived notes in global search', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'Retro', body: 'kangaroo' });
    p.notes.archive(note.id);
    const found = p.search.search('kangaroo').notes;
    expect(found.map((n) => n.title)).toEqual(['Retro']);
    expect(found[0]!.archivedAt).not.toBeNull();
  });

  it('archiving twice, or unarchiving a live note, changes nothing', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'Plan' });
    const first = p.notes.archive(note.id);
    expect(p.notes.archive(note.id).archivedAt).toBe(first.archivedAt);
    const live = p.notes.unarchive(note.id);
    expect(p.notes.unarchive(note.id).updatedAt).toBe(live.updatedAt);
  });
});

describe('Sorting notes', () => {
  it('sorts by last update (default), creation, or title', async () => {
    const p = await setupProfile();
    const b = p.notes.create({ title: 'banana' });
    p.notes.create({ title: 'Apple' });
    p.notes.update({ id: b.id, body: 'edited' });
    expect(p.notes.list().map((n) => n.title)).toEqual(['banana', 'Apple']);
    expect(p.notes.list({ sort: 'created' }).map((n) => n.title)).toEqual(['Apple', 'banana']);
    expect(p.notes.list({ sort: 'title' }).map((n) => n.title)).toEqual(['Apple', 'banana']);
  });
});

describe('Tag usage', () => {
  it('counts live tasks, projects, and notes per tag', async () => {
    const p = await setupProfile();
    const tag = p.tags.create({ name: 'Urgent' });
    const unused = p.tags.create({ name: 'Unused' });
    const project = p.projects.create({ name: 'Site', tagIds: [tag.id] });
    p.tasks.create({ title: 'A', projectId: project.id, tagIds: [tag.id] });
    const gone = p.tasks.create({ title: 'B', projectId: project.id, tagIds: [tag.id] });
    p.trash.trashTask(gone.id);
    p.notes.create({ title: 'N', tagIds: [tag.id] });
    expect(p.tags.usage()).toEqual({
      [tag.id]: { tasks: 1, projects: 1, notes: 1 },
      [unused.id]: { tasks: 0, projects: 0, notes: 0 },
    });
  });

  it('deleting a tag removes it from items and keeps the items', async () => {
    const p = await setupProfile();
    const tag = p.tags.create({ name: 'Old' });
    const note = p.notes.create({ title: 'N', tagIds: [tag.id] });
    p.tags.delete(tag.id);
    expect(p.notes.get(note.id).tagIds).toEqual([]);
    expect(p.tags.list()).toEqual([]);
  });
});

describe('Appearance settings', () => {
  it('defaults to the blue accent and cool surfaces, and saves choices', async () => {
    const p = await setupProfile();
    expect(p.settings.get()).toEqual({
      theme: 'system',
      accent: 'blue',
      surface: 'cool',
      noteOutline: false,
    });
    expect(p.settings.update({ accent: 'teal', surface: 'warm' })).toEqual({
      theme: 'system',
      accent: 'teal',
      surface: 'warm',
      noteOutline: false,
    });
  });

  it('falls back to defaults for unknown stored values', async () => {
    const p = await setupProfile();
    p.db
      .prepare(
        "INSERT INTO settings (key, value_json, updated_at) VALUES ('accent', '\"neon\"', 'x')",
      )
      .run();
    expect(p.settings.get().accent).toBe('blue');
  });

  it('remembers whether notes show their outline (ADR-0017), off by default', async () => {
    const p = await setupProfile();
    expect(p.settings.update({ noteOutline: true }).noteOutline).toBe(true);
    expect(p.settings.get().noteOutline).toBe(true);
    p.db.prepare("UPDATE settings SET value_json = '\"yes\"' WHERE key = 'noteOutline'").run();
    expect(p.settings.get().noteOutline).toBe(false);
  });
});
