import { describe, expect, it } from 'vitest';
import { ipcContract } from '../../../src/shared/ipc-contract';
import { expectAppError, setupProfile } from './setup';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const TEXT = new TextEncoder().encode('not an image');
const MISSING = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';

describe('favourites (ADR-0019)', () => {
  it('stars projects and notes in order, once each, and shows the star on them', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Website', color: 'teal' });
    const note = p.notes.create({ title: 'Roadmap' });
    p.favourites.set({ kind: 'note', id: note.id, starred: true });
    p.favourites.set({ kind: 'project', id: project.id, starred: true });
    p.favourites.set({ kind: 'note', id: note.id, starred: true });
    expect(p.favourites.list()).toEqual([
      expect.objectContaining({ kind: 'note', itemId: note.id, title: 'Roadmap', color: null }),
      expect.objectContaining({ kind: 'project', itemId: project.id, color: 'teal' }),
    ]);
    expect(p.projects.get(project.id).favourite).toBe(true);
    expect(p.notes.get(note.id).favourite).toBe(true);
    expect(p.notes.list()[0]!.favourite).toBe(true);

    p.favourites.set({ kind: 'note', id: note.id, starred: false });
    p.favourites.set({ kind: 'note', id: note.id, starred: false });
    expect(p.favourites.list().map((f) => f.title)).toEqual(['Website']);
    expect(p.notes.get(note.id).favourite).toBe(false);
  });

  it('reorders with the complete list only', async () => {
    const p = await setupProfile();
    const a = p.notes.create({ title: 'A' });
    const b = p.notes.create({ title: 'B' });
    const c = p.notes.create({ title: 'C' });
    for (const n of [a, b, c]) p.favourites.set({ kind: 'note', id: n.id, starred: true });
    const [fa, fb, fc] = p.favourites.list().map((f) => f.id) as [string, string, string];
    expect(p.favourites.reorder([fc, fa, fb]).map((f) => f.title)).toEqual(['C', 'A', 'B']);
    await expectAppError(() => p.favourites.reorder([fc, fa]), 'VALIDATION_FAILED');
    await expectAppError(() => p.favourites.reorder([fc, fa, fa]), 'VALIDATION_FAILED');
    await expectAppError(() => p.favourites.reorder([fc, fa, MISSING]), 'NOT_FOUND');
  });

  it('hides trashed items until restored, keeps archived ones with a badge, and forgets deleted ones', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Website' });
    const inProject = p.notes.create({ title: 'Plan', projectId: project.id });
    const note = p.notes.create({ title: 'Loose' });
    const archived = p.notes.create({ title: 'Old' });
    for (const [kind, id] of [
      ['project', project.id],
      ['note', inProject.id],
      ['note', note.id],
      ['note', archived.id],
    ] as const) {
      p.favourites.set({ kind, id, starred: true });
    }
    p.notes.archive(archived.id);
    const { batchId } = p.trash.trashProject(project.id);
    p.trash.trashNote(note.id);
    expect(p.favourites.list()).toEqual([
      expect.objectContaining({ title: 'Old', archived: true }),
    ]);
    // Reordering covers only what is listed.
    expect(p.favourites.reorder([p.favourites.list()[0]!.id])).toHaveLength(1);

    p.trash.restore(batchId);
    expect(p.favourites.list().map((f) => f.title)).toEqual(['Website', 'Plan', 'Old']);

    await expectAppError(
      () => p.favourites.set({ kind: 'note', id: note.id, starred: true }),
      'NOT_FOUND',
    );
    p.trash.empty();
    expect(p.db.prepare('SELECT count(*) AS n FROM favourites').get()).toEqual({ n: 3 });
  });
});

describe('icons and covers (ADR-0019)', () => {
  it('sets and removes built-in icons and cover presets', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Website' });
    const note = p.notes.create({ title: 'Roadmap' });
    p.looks.setIcon({ kind: 'project', id: project.id, value: 'emoji:🚀' });
    p.looks.setIcon({ kind: 'note', id: note.id, value: 'lucide:Lightbulb' });
    p.looks.setCover({ kind: 'note', id: note.id, value: 'preset:ocean' });
    expect(p.projects.get(project.id).icon).toBe('emoji:🚀');
    expect(p.notes.get(note.id)).toMatchObject({ icon: 'lucide:Lightbulb', cover: 'preset:ocean' });
    expect(p.switcher.search({ text: 'roadmap' })[0]).toMatchObject({ icon: 'lucide:Lightbulb' });
    expect(p.favourites.set({ kind: 'note', id: note.id, starred: true })[0]).toMatchObject({
      icon: 'lucide:Lightbulb',
    });

    p.looks.setIcon({ kind: 'note', id: note.id, value: null });
    p.looks.setCover({ kind: 'note', id: note.id, value: null });
    expect(p.notes.get(note.id)).toMatchObject({ icon: null, cover: null });
  });

  it('refuses values outside the built-in lists, here and at the IPC boundary', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'Roadmap' });
    await expectAppError(
      () => p.looks.setIcon({ kind: 'note', id: note.id, value: 'emoji:🦄' }),
      'VALIDATION_FAILED',
    );
    await expectAppError(
      () => p.looks.setCover({ kind: 'note', id: note.id, value: 'preset:neon' }),
      'VALIDATION_FAILED',
    );
    const icon = ipcContract['looks:setIcon'];
    expect(icon.safeParse({ kind: 'note', id: note.id, value: 'lucide:Rocket' }).success).toBe(
      false,
    );
    expect(icon.safeParse({ kind: 'note', id: note.id, value: 'emoji:🚀' }).success).toBe(true);
    expect(icon.safeParse({ kind: 'task', id: note.id, value: null }).success).toBe(false);
    const cover = ipcContract['looks:setCover'];
    expect(cover.safeParse({ kind: 'note', id: note.id, value: 'image:../../x' }).success).toBe(
      false,
    );
    expect(cover.safeParse({ kind: 'note', id: note.id, value: 'preset:dawn' }).success).toBe(true);
  });

  it('keeps archived notes and trashed items unchanged', async () => {
    const p = await setupProfile();
    const note = p.notes.create({ title: 'Old' });
    p.notes.archive(note.id);
    await expectAppError(
      () => p.looks.setIcon({ kind: 'note', id: note.id, value: 'emoji:⭐' }),
      'CONFLICT',
    );
    const project = p.projects.create({ name: 'Archived but editable' });
    p.projects.archive(project.id);
    p.looks.setCover({ kind: 'project', id: project.id, value: 'preset:dusk' });
    p.trash.trashProject(project.id);
    await expectAppError(
      () => p.looks.setCover({ kind: 'project', id: project.id, value: null }),
      'NOT_FOUND',
    );
  });

  it('stores cover images as attachments, images only, and keeps them while in use', async () => {
    const p = await setupProfile();
    const project = p.projects.create({ name: 'Website' });
    const value = p.looks.addCoverImage({
      kind: 'project',
      id: project.id,
      name: 'banner.png',
      data: PNG,
    });
    expect(value).toMatch(/^image:[0-9a-f-]{36}$/);
    expect(p.projects.get(project.id).cover).toBe(value);
    const fileId = value.slice('image:'.length);
    expect(p.attachments.readImage(fileId).mime).toBe('image/png');
    await expectAppError(
      () => p.looks.addCoverImage({ kind: 'project', id: project.id, name: 'a.txt', data: TEXT }),
      'VALIDATION_FAILED',
    );
    await expectAppError(
      () => p.looks.setCover({ kind: 'project', id: project.id, value: `image:${MISSING}` }),
      'NOT_FOUND',
    );

    // In use: never marked unused. Removed as a cover: removed after the retention period.
    p.attachments.cleanUp();
    p.time.advanceDays(40);
    expect(p.attachments.cleanUp()).toBe(0);
    p.looks.setCover({ kind: 'project', id: project.id, value: 'preset:blue' });
    p.attachments.cleanUp();
    p.time.advanceDays(31);
    expect(p.attachments.cleanUp()).toBe(1);
  });
});
