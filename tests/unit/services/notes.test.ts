import { describe, expect, it } from 'vitest';
import { TRASH_RETENTION_DAYS } from '../../../src/shared/domain';
import { markdownExcerpt } from '../../../src/main/services/rows';
import { expectAppError, setupProfile } from './setup';

describe('NoteService', () => {
  it('creates notes in the Inbox by default and in a chosen project', async () => {
    const p = await setupProfile();
    const loose = p.notes.create({ title: 'Ideas' });
    expect(loose).toMatchObject({ projectId: p.inboxId, title: 'Ideas', body: '', tagIds: [] });
    const project = p.projects.create({ name: 'Website' });
    const tag = p.tags.create({ name: 'Draft' });
    const note = p.notes.create({
      title: 'Plan',
      projectId: project.id,
      body: '# Plan\n\nShip it.',
      tagIds: [tag.id, tag.id],
    });
    expect(p.notes.get(note.id)).toMatchObject({
      projectId: project.id,
      body: '# Plan\n\nShip it.',
      tagIds: [tag.id],
    });
  });

  it('refuses archived, trashed, and unknown projects and unknown tags', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Old' });
    p.projects.archive(project.id);
    await expectAppError(() => p.notes.create({ title: 'X', projectId: project.id }), 'CONFLICT');
    const gone = p.projects.create({ name: 'Gone' });
    p.trash.trashProject(gone.id);
    await expectAppError(() => p.notes.create({ title: 'X', projectId: gone.id }), 'NOT_FOUND');
    await expectAppError(
      () => p.notes.create({ title: 'X', tagIds: [crypto.randomUUID()] }),
      'NOT_FOUND',
    );
    expect(p.notes.list({ includeArchived: true })).toEqual([]);
  });

  it('saves title and body, and keeps the timestamp when nothing changed', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'Draft', body: 'one' });
    const saved = p.notes.update({ id: note.id, body: 'two' });
    expect(saved.body).toBe('two');
    expect(saved.title).toBe('Draft');
    expect(saved.updatedAt > note.updatedAt).toBe(true);
    expect(p.notes.update({ id: note.id, title: 'Draft', body: 'two' }).updatedAt).toBe(
      saved.updatedAt,
    );
    p.trash.trashNote(note.id);
    await expectAppError(() => p.notes.update({ id: note.id, body: 'x' }), 'NOT_FOUND');
  });

  it('moves notes between open projects only', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'Loose' });
    const target = p.projects.create({ name: 'Target' });
    expect(p.notes.move({ id: note.id, projectId: target.id }).projectId).toBe(target.id);
    const archived = p.projects.create({ name: 'Archived' });
    p.projects.archive(archived.id);
    await expectAppError(() => p.notes.move({ id: note.id, projectId: archived.id }), 'CONFLICT');
  });

  it('lists newest first, filters by project, tag, and text, and hides archived projects', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Garden' });
    const tag = p.tags.create({ name: 'Seeds' });
    const a = p.notes.create({
      title: 'Tomatoes',
      projectId: project.id,
      body: 'Plant in **May**',
    });
    const b = p.notes.create({ title: 'Shopping', body: 'Buy compost' });
    p.tags.setNoteTags(b.id, [tag.id]);
    expect(p.notes.list().map((n) => n.id)).toEqual([b.id, a.id]);
    expect(p.notes.list({ projectId: project.id }).map((n) => n.title)).toEqual(['Tomatoes']);
    expect(p.notes.list({ tagIds: [tag.id] }).map((n) => n.title)).toEqual(['Shopping']);
    // Body text is searchable, with prefix matching and diacritics folded.
    expect(p.notes.list({ text: 'compo' }).map((n) => n.title)).toEqual(['Shopping']);
    expect(p.notes.list({ text: 'máy' }).map((n) => n.title)).toEqual(['Tomatoes']);
    expect(p.notes.list({ text: '"OR*' })).toEqual([]);
    expect(p.notes.list()[1]!.excerpt).toBe('Plant in May');

    p.projects.archive(project.id);
    expect(p.notes.list().map((n) => n.title)).toEqual(['Shopping']);
    expect(p.notes.list({ includeArchived: true })).toHaveLength(2);
  });

  it('keeps search in step with edits and deletions', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'Recipe', body: 'flour' });
    p.notes.update({ id: note.id, body: 'sugar' });
    expect(p.search.search('flour').notes).toEqual([]);
    expect(p.search.search('sugar').notes.map((n) => n.id)).toEqual([note.id]);
    p.trash.trashNote(note.id);
    expect(p.search.search('sugar').notes).toEqual([]);
    p.trash.empty();
    expect(p.db.prepare('SELECT count(*) AS n FROM notes_fts').get()).toEqual({ n: 0 });
  });

  it('removes a deleted tag from notes', async () => {
    const p = await setupProfile();
    const tag = p.tags.create({ name: 'Temp' });
    const note = p.notes.create({ title: 'Tagged', tagIds: [tag.id] });
    p.tags.delete(tag.id);
    expect(p.notes.get(note.id).tagIds).toEqual([]);
  });
});

describe('Notes in the trash', () => {
  it('trashes, restores, and permanently deletes a single note', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'Scratch' });
    const { batchId } = p.trash.trashNote(note.id);
    await expectAppError(() => p.notes.get(note.id), 'NOT_FOUND');
    await expectAppError(() => p.trash.trashNote(note.id), 'NOT_FOUND');
    expect(p.trash.list()).toEqual([
      expect.objectContaining({ batchId, kind: 'note', title: 'Scratch', projectName: 'Inbox' }),
    ]);
    expect(p.trash.restore(batchId)).toEqual({
      restoredProjects: 0,
      restoredTasks: 0,
      restoredNotes: 1,
      unresolvedDependencies: [],
    });
    expect(p.notes.get(note.id).title).toBe('Scratch');

    const again = p.trash.trashNote(note.id);
    p.trash.deletePermanently(again.batchId);
    expect(p.db.prepare('SELECT count(*) AS n FROM notes').get()).toEqual({ n: 0 });
  });

  it('moves a project’s notes to the trash with it and restores them together', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Website' });
    p.tasks.create({ title: 'Task', projectId: project.id });
    const note = p.notes.create({ title: 'Spec', projectId: project.id });
    const { batchId } = p.trash.trashProject(project.id);
    expect(p.notes.list({ includeArchived: true })).toEqual([]);
    expect(p.trash.list()).toEqual([expect.objectContaining({ kind: 'project', itemCount: 3 })]);
    expect(p.trash.restore(batchId)).toMatchObject({ restoredTasks: 1, restoredNotes: 1 });
    expect(p.notes.get(note.id).projectId).toBe(project.id);
  });

  it('asks for the project to be restored first when both are in the trash', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Website' });
    const note = p.notes.create({ title: 'Spec', projectId: project.id });
    const noteBatch = p.trash.trashNote(note.id).batchId;
    const projectBatch = p.trash.trashProject(project.id).batchId;
    await expectAppError(() => p.trash.restore(noteBatch), 'CONFLICT');
    p.trash.restore(projectBatch);
    expect(p.trash.restore(noteBatch).restoredNotes).toBe(1);
  });

  it('purges notes 30 days after they were trashed', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'Old' });
    p.trash.trashNote(note.id);
    p.time.advanceDays(TRASH_RETENTION_DAYS - 1);
    expect(p.trash.purgeExpired()).toBe(0);
    p.time.advanceDays(2);
    expect(p.trash.purgeExpired()).toBe(1);
    expect(p.trash.list()).toEqual([]);
  });
});

describe('markdownExcerpt', () => {
  it('turns Markdown into one line of plain text', () => {
    expect(
      markdownExcerpt('# Title\n\n- [x] **Done** item\n> quote with [a link](https://x.y)'),
    ).toBe('Title Done item quote with a link');
    expect(markdownExcerpt('```js\ncode()\n```')).toBe('code()');
    expect(markdownExcerpt('| A | B |\n|---|:--:|\n| 1 | 2 |\n\n---\n<b>x</b>')).toBe('A B 1 2 x');
    expect(markdownExcerpt('word '.repeat(100))).toHaveLength(160);
  });
});
