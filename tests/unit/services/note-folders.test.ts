import { describe, expect, it } from 'vitest';
import { countRows } from '../../../src/main/backup/manifest';
import { LIMITS } from '../../../src/shared/schemas';
import { expectAppError, setupProfile } from './setup';

describe('NoteFolderService', () => {
  it('creates folders with unique names, sorted by name, with live note counts', async () => {
    const p = await setupProfile();
    const work = p.noteFolders.create({ name: 'Work' });
    p.noteFolders.create({ name: 'archive' });
    await expectAppError(() => p.noteFolders.create({ name: 'WORK' }), 'CONFLICT');
    p.notes.create({ title: 'A', folderId: work.id });
    const trashed = p.notes.create({ title: 'B', folderId: work.id });
    p.trash.trashNote(trashed.id);
    expect(p.noteFolders.list().map((f) => [f.name, f.noteCount])).toEqual([
      ['archive', 0],
      ['Work', 1],
    ]);
  });

  it('renames folders and keeps names unique', async () => {
    const p = await setupProfile();
    const a = p.noteFolders.create({ name: 'Ideas' });
    p.noteFolders.create({ name: 'Plans' });
    expect(p.noteFolders.rename({ id: a.id, name: 'Drafts' }).name).toBe('Drafts');
    await expectAppError(() => p.noteFolders.rename({ id: a.id, name: 'plans' }), 'CONFLICT');
    await expectAppError(
      () => p.noteFolders.rename({ id: crypto.randomUUID(), name: 'X' }),
      'NOT_FOUND',
    );
  });

  it('deleting a folder keeps its notes, including trashed ones, outside any folder', async () => {
    const p = await setupProfile();
    const folder = p.noteFolders.create({ name: 'Temp' });
    const live = p.notes.create({ title: 'Live', folderId: folder.id });
    const trashed = p.notes.create({ title: 'Trashed', folderId: folder.id });
    const { batchId } = p.trash.trashNote(trashed.id);
    p.noteFolders.delete(folder.id);
    expect(p.notes.get(live.id).folderId).toBeNull();
    p.trash.restore(batchId);
    expect(p.notes.get(trashed.id).folderId).toBeNull();
    expect(p.noteFolders.list()).toEqual([]);
    await expectAppError(() => p.noteFolders.delete(folder.id), 'NOT_FOUND');
  });
});

describe('Note folders in backups', () => {
  it('are counted in the manifest, so restores verify them', async () => {
    const p = await setupProfile();
    p.noteFolders.create({ name: 'Work' });
    expect(countRows(p.db)['note_folders']).toBe(1);
  });
});

describe('Notes in folders', () => {
  it('creates notes in a folder, moves them, and lists by folder or unfiled', async () => {
    const p = await setupProfile();
    const folder = p.noteFolders.create({ name: 'Work' });
    const filed = p.notes.create({ title: 'Filed', folderId: folder.id });
    const loose = p.notes.create({ title: 'Loose' });
    expect(filed.folderId).toBe(folder.id);
    expect(loose.folderId).toBeNull();
    expect(p.notes.list({ folderId: folder.id }).map((n) => n.title)).toEqual(['Filed']);
    expect(p.notes.list({ folderId: null }).map((n) => n.title)).toEqual(['Loose']);
    expect(p.notes.list().map((n) => n.title)).toEqual(['Loose', 'Filed']);

    expect(p.notes.setFolder({ id: loose.id, folderId: folder.id }).folderId).toBe(folder.id);
    expect(p.notes.setFolder({ id: filed.id, folderId: null }).folderId).toBeNull();
    expect(p.notes.list({ folderId: folder.id }).map((n) => n.title)).toEqual(['Loose']);
  });

  it('refuses unknown folders', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'X' });
    await expectAppError(
      () => p.notes.create({ title: 'Y', folderId: crypto.randomUUID() }),
      'NOT_FOUND',
    );
    await expectAppError(
      () => p.notes.setFolder({ id: note.id, folderId: crypto.randomUUID() }),
      'NOT_FOUND',
    );
  });
});

describe('NoteService.duplicate', () => {
  it('copies the body, project, folder, and tags under a "(copy)" title', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Website' });
    const folder = p.noteFolders.create({ name: 'Plans' });
    const tag = p.tags.create({ name: 'Draft' });
    const note = p.notes.create({
      title: 'Launch',
      projectId: project.id,
      folderId: folder.id,
      body: '# Launch\n\nUnique-word-zebra',
      tagIds: [tag.id],
    });
    const copy = p.notes.duplicate(note.id);
    expect(copy).toMatchObject({
      title: 'Launch (copy)',
      body: note.body,
      projectId: project.id,
      folderId: folder.id,
      tagIds: [tag.id],
    });
    expect(copy.id).not.toBe(note.id);
    expect(
      p.search
        .search('zebra')
        .notes.map((n) => n.title)
        .sort(),
    ).toEqual(['Launch', 'Launch (copy)']);
  });

  it('keeps the copy’s title within the length limit', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'x'.repeat(LIMITS.title) });
    const copy = p.notes.duplicate(note.id);
    expect(copy.title).toHaveLength(LIMITS.title);
    expect(copy.title.endsWith(' (copy)')).toBe(true);
  });

  it('refuses trashed notes and notes in archived projects', async () => {
    const p = await setupProfile();
    const trashed = p.notes.create({ title: 'Gone' });
    p.trash.trashNote(trashed.id);
    await expectAppError(() => p.notes.duplicate(trashed.id), 'NOT_FOUND');
    const project = p.projects.create({ name: 'Old' });
    const note = p.notes.create({ title: 'Kept', projectId: project.id });
    p.projects.archive(project.id);
    await expectAppError(() => p.notes.duplicate(note.id), 'CONFLICT');
  });
});

describe('NoteService.import', () => {
  it('creates all notes in one transaction, in the chosen project and folder', async () => {
    const p = await setupProfile();
    const folder = p.noteFolders.create({ name: 'Imported' });
    const created = p.notes.import({
      folderId: folder.id,
      notes: [
        { title: 'One', body: 'First' },
        { title: 'Two', body: 'Second' },
      ],
    });
    expect(created.map((n) => [n.title, n.projectId, n.folderId])).toEqual([
      ['One', p.inboxId, folder.id],
      ['Two', p.inboxId, folder.id],
    ]);
  });

  it('creates nothing when the folder is unknown', async () => {
    const p = await setupProfile();
    await expectAppError(
      () =>
        p.notes.import({
          folderId: crypto.randomUUID(),
          notes: [{ title: 'One', body: 'First' }],
        }),
      'NOT_FOUND',
    );
    expect(p.notes.list()).toEqual([]);
  });
});
