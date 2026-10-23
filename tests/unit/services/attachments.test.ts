import { describe, expect, it } from 'vitest';
import { AttachmentService, MAX_ATTACHMENT_BYTES } from '../../../src/main/services/attachments';
import { runProfileMaintenance } from '../../../src/main/services';
import { nullLogger } from '../../../src/main/platform/logger';
import { expectAppError, setupProfile } from './setup';

/** A real 1×1 PNG. */
const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);
const GIF = new TextEncoder().encode('GIF89a\x01\x00\x01\x00');
const WEBP = new TextEncoder().encode('RIFF\x1a\x00\x00\x00WEBPVP8 ');
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
const TEXT = new TextEncoder().encode('Plain notes');
const fileUrl = (id: string) => `projectforge://file/${id}`;

async function setup(options: { freeBytes?: number } = {}) {
  const p = await setupProfile();
  const note = p.notes.create({ title: 'Trip' });
  const files = new AttachmentService(p.ctx, {
    freeBytes: () => options.freeBytes ?? 10 * 1024 ** 3,
  });
  return { p, note, files };
}

describe('adding attachments (ADR-0017 stage 6)', () => {
  it('stores a file with its name and size, and gives it back unchanged', async () => {
    const { note, files } = await setup();
    const added = files.add({ noteId: note.id, name: 'photo.png', data: PNG });
    expect(added).toMatchObject({
      name: 'photo.png',
      kind: 'image',
      mime: 'image/png',
      size: PNG.length,
    });
    const read = files.read(added.id);
    expect(read.mime).toBe('image/png');
    expect(Buffer.from(read.data).equals(Buffer.from(PNG))).toBe(true);
  });

  it('decides the type from the contents, never the name', async () => {
    const { note, files } = await setup();
    const kinds = [
      files.add({ noteId: note.id, name: 'a.jpg', data: JPEG }),
      files.add({ noteId: note.id, name: 'b.gif', data: GIF }),
      files.add({ noteId: note.id, name: 'c.webp', data: WEBP }),
      // An SVG can carry scripts, so it is never shown as an image.
      files.add({ noteId: note.id, name: 'd.svg', data: SVG }),
      // A name that claims to be an image does not make it one.
      files.add({ noteId: note.id, name: 'fake.png', data: TEXT }),
    ].map((a) => [a.kind, a.mime]);
    expect(kinds).toEqual([
      ['image', 'image/jpeg'],
      ['image', 'image/gif'],
      ['image', 'image/webp'],
      ['file', 'application/octet-stream'],
      ['file', 'application/octet-stream'],
    ]);
  });

  it('only gives files back for display when they are images', async () => {
    const { note, files } = await setup();
    const svg = files.add({ noteId: note.id, name: 'd.svg', data: SVG });
    await expectAppError(() => files.readImage(svg.id), 'VALIDATION_FAILED');
    const png = files.add({ noteId: note.id, name: 'p.png', data: PNG });
    expect(files.readImage(png.id).mime).toBe('image/png');
  });

  it('keeps only the file name, without folders or control characters', async () => {
    const { note, files } = await setup();
    const added = files.add({ noteId: note.id, name: '..\\..\\evil/\u0007report.pdf', data: TEXT });
    expect(added.name).toBe('report.pdf');
  });

  it('refuses files over the size limit, and when the disk is nearly full', async () => {
    const { note, files } = await setup();
    await expectAppError(
      () =>
        files.add({
          noteId: note.id,
          name: 'big.bin',
          data: new Uint8Array(MAX_ATTACHMENT_BYTES + 1),
        }),
      'VALIDATION_FAILED',
    );
    const full = await setup({ freeBytes: 1024 });
    await expectAppError(
      () => full.files.add({ noteId: full.note.id, name: 'a.png', data: PNG }),
      'NOT_ENOUGH_SPACE',
    );
    expect(full.files.info([])).toEqual([]);
  });

  it('refuses attachments to archived or missing notes', async () => {
    const { p, files } = await setup();
    const archived = p.notes.archive(p.notes.create({ title: 'Old' }).id);
    await expectAppError(
      () => files.add({ noteId: archived.id, name: 'a.png', data: PNG }),
      'CONFLICT',
    );
    await expectAppError(
      () => files.add({ noteId: '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a', name: 'a.png', data: PNG }),
      'NOT_FOUND',
    );
  });
});

describe('attachment info', () => {
  it('describes files in the order asked, and marks unknown ones missing', async () => {
    const { note, files } = await setup();
    const a = files.add({ noteId: note.id, name: 'plan.pdf', data: TEXT });
    const missing = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';
    expect(files.info([missing, a.id])).toEqual([
      { id: missing, name: '', kind: 'file', mime: '', size: 0, missing: true },
      expect.objectContaining({ id: a.id, name: 'plan.pdf', missing: false, size: TEXT.length }),
    ]);
  });

  it('marks executable files, which can be saved but not opened', async () => {
    const { note, files } = await setup();
    const exe = files.add({ noteId: note.id, name: 'setup.EXE', data: TEXT });
    const pdf = files.add({ noteId: note.id, name: 'guide.pdf', data: TEXT });
    expect(files.info([exe.id, pdf.id]).map((i) => i.executable)).toEqual([true, false]);
  });
});

describe('cleaning up unused files', () => {
  it('keeps files any note refers to, even in the trash, and removes others after 30 days', async () => {
    const { p, note, files } = await setup();
    const used = files.add({ noteId: note.id, name: 'used.png', data: PNG });
    const trashedUse = files.add({ noteId: note.id, name: 'trashed.png', data: PNG });
    const unused = files.add({ noteId: note.id, name: 'unused.png', data: PNG });
    p.notes.update({ id: note.id, body: `![a](${fileUrl(used.id)})` });
    const other = p.notes.create({ title: 'Other', body: `![b](${fileUrl(trashedUse.id)})` });
    p.trash.trashNote(other.id);

    runProfileMaintenance(p.ctx, nullLogger);
    expect(files.info([used.id, trashedUse.id, unused.id]).map((i) => i.missing)).toEqual([
      false,
      false,
      false,
    ]);
    p.time.advanceDays(31);
    runProfileMaintenance(p.ctx, nullLogger);
    expect(files.info([used.id, trashedUse.id, unused.id]).map((i) => i.missing)).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('gives a file back its full 30 days when a note refers to it again', async () => {
    const { p, note, files } = await setup();
    const file = files.add({ noteId: note.id, name: 'a.png', data: PNG });
    runProfileMaintenance(p.ctx, nullLogger);
    p.time.advanceDays(20);
    p.notes.update({ id: note.id, body: `![a](${fileUrl(file.id)})` });
    runProfileMaintenance(p.ctx, nullLogger);
    p.notes.update({ id: note.id, body: 'Removed again' });
    p.time.advanceDays(20);
    runProfileMaintenance(p.ctx, nullLogger);
    expect(files.info([file.id])[0]!.missing).toBe(false);
  });

  it('keeps a duplicated note’s images when the original is deleted for good', async () => {
    const { p, note, files } = await setup();
    const file = files.add({ noteId: note.id, name: 'a.png', data: PNG });
    p.notes.update({ id: note.id, body: `![a](${fileUrl(file.id)})` });
    p.notes.duplicate(note.id);
    p.db.prepare('DELETE FROM notes WHERE id = ?').run(note.id);
    p.time.advanceDays(31);
    runProfileMaintenance(p.ctx, nullLogger);
    expect(files.info([file.id])[0]!.missing).toBe(false);
  });
});
