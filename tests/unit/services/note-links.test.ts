import { describe, expect, it } from 'vitest';
import { appLinkMarkdown } from '../../../src/shared/app-links';
import { runProfileMaintenance } from '../../../src/main/services';
import { nullLogger } from '../../../src/main/platform/logger';
import { expectAppError, setupProfile } from './setup';

const link = (id: string, label: string) => appLinkMarkdown({ kind: 'note', id }, label);
const indexRows = (p: Awaited<ReturnType<typeof setupProfile>>) =>
  p.db
    .prepare('SELECT source_note_id, target_kind, target_id FROM note_links ORDER BY rowid')
    .all();

describe('note link index (ADR-0017 stage 4)', () => {
  it('records the links in a note when it is created and updated', async () => {
    const p = await setupProfile();
    const target = p.notes.create({ title: 'Target' });
    const source = p.notes.create({ title: 'Source', body: `See ${link(target.id, 'Target')}` });
    expect(indexRows(p)).toEqual([
      { source_note_id: source.id, target_kind: 'note', target_id: target.id },
    ]);
    p.notes.update({ id: source.id, body: 'No links any more' });
    expect(indexRows(p)).toEqual([]);
  });

  it('indexes imported and duplicated notes too', async () => {
    const p = await setupProfile();
    const target = p.notes.create({ title: 'Target' });
    const [imported] = p.notes.import({
      notes: [{ title: 'Imported', body: link(target.id, 'Target') }],
    });
    const copy = p.notes.duplicate(imported!.id);
    expect(
      p.notes
        .backlinks(target.id)
        .linked.map((b) => b.noteId)
        .sort(),
    ).toEqual([imported!.id, copy.id].sort());
  });

  it('removes a note’s links when it is deleted for good', async () => {
    const p = await setupProfile();
    const target = p.notes.create({ title: 'Target' });
    const source = p.notes.create({ title: 'Source', body: link(target.id, 'Target') });
    p.db.prepare('DELETE FROM notes WHERE id = ?').run(source.id);
    expect(indexRows(p)).toEqual([]);
  });

  it('builds the index for links written before it existed, when the profile opens', async () => {
    const p = await setupProfile();
    const target = p.notes.create({ title: 'Target' });
    const source = p.notes.create({ title: 'Source', body: link(target.id, 'Target') });
    p.db.prepare('DELETE FROM note_links').run();
    runProfileMaintenance(p.ctx, nullLogger);
    expect(p.notes.backlinks(target.id).linked.map((b) => b.noteId)).toEqual([source.id]);
  });
});

describe('backlinks', () => {
  it('lists linking notes with a snippet, leaving out trashed ones', async () => {
    const p = await setupProfile();
    const target = p.notes.create({ title: 'Roadmap' });
    const one = p.notes.create({
      title: 'Weekly',
      body: `Talked about ${link(target.id, 'Roadmap')} again.`,
    });
    const gone = p.notes.create({ title: 'Gone', body: link(target.id, 'Roadmap') });
    p.trash.trashNote(gone.id);
    const { linked } = p.notes.backlinks(target.id);
    expect(linked).toEqual([
      expect.objectContaining({
        noteId: one.id,
        title: 'Weekly',
        snippet: 'Talked about Roadmap again.',
        archived: false,
      }),
    ]);
  });

  it('lists unlinked mentions of the title in other notes', async () => {
    const p = await setupProfile();
    const target = p.notes.create({ title: 'Roadmap' });
    const mentions = p.notes.create({ title: 'Ideas', body: 'Update the roadmap soon.' });
    p.notes.create({ title: 'Code', body: '`roadmap`' });
    p.notes.create({ title: 'Linked', body: link(target.id, 'Roadmap') });
    p.notes.archive(p.notes.create({ title: 'Archived', body: 'roadmap' }).id);
    expect(p.notes.backlinks(target.id).unlinked).toEqual([
      expect.objectContaining({ noteId: mentions.id, snippet: 'Update the roadmap soon.' }),
    ]);
  });

  it('does not look for mentions of very short or untitled notes', async () => {
    const p = await setupProfile();
    const short = p.notes.create({ title: 'Go' });
    p.notes.create({ title: 'Other', body: 'Go now' });
    expect(p.notes.backlinks(short.id).unlinked).toEqual([]);
  });
});

describe('linking a mention', () => {
  it('turns the first plain mention into a link, keeping its spelling', async () => {
    const p = await setupProfile();
    const target = p.notes.create({ title: 'Roadmap' });
    const source = p.notes.create({
      title: 'Ideas',
      body: 'Update the roadmap, then the Roadmap.',
    });
    const updated = p.notes.linkMention({ sourceId: source.id, targetId: target.id });
    expect(updated.body).toBe(`Update the ${link(target.id, 'roadmap')}, then the Roadmap.`);
    expect(p.notes.backlinks(target.id).linked.map((b) => b.noteId)).toEqual([source.id]);
    expect(p.notes.backlinks(target.id).unlinked).toEqual([]);
  });

  it('refuses when there is no plain mention, or the note is archived', async () => {
    const p = await setupProfile();
    const target = p.notes.create({ title: 'Roadmap' });
    const none = p.notes.create({ title: 'None', body: 'Nothing here' });
    await expectAppError(
      () => p.notes.linkMention({ sourceId: none.id, targetId: target.id }),
      'CONFLICT',
    );
    const archived = p.notes.archive(p.notes.create({ title: 'A', body: 'roadmap' }).id);
    await expectAppError(
      () => p.notes.linkMention({ sourceId: archived.id, targetId: target.id }),
      'CONFLICT',
    );
  });
});
