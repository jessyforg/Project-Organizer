import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createChannelImpls, type ChannelDeps } from '../../src/main/ipc/channels';
import { buildJsonExport } from '../../src/main/backup/json-export';
import { tempDir } from './helpers';
import { expectAppError, setupProfile } from './services/setup';

const TEXT = new TextEncoder().encode('Quarterly figures');

async function setup() {
  const p = await setupProfile();
  const note = p.notes.create({ title: 'Trip' });
  const saveDir = tempDir();
  const openDir = tempDir();
  const openPath = vi.fn<(file: string) => Promise<string>>(() => Promise.resolve(''));
  // Only what the attachment channels use; the rest is never called here.
  const deps = {
    services: () => p,
    dialogs: {
      saveFile: (name: string) => Promise.resolve(path.join(saveDir, name)),
      openFile: () => Promise.resolve(null),
    },
    files: { tempDir: openDir, openPath },
  } as unknown as ChannelDeps;
  const channels = createChannelImpls(deps);
  return { p, note, channels, saveDir, openDir, openPath };
}

describe('attachment channels (ADR-0017 stage 6)', () => {
  it('saves a copy with the same bytes, through the save dialog', async () => {
    const { p, note, channels, saveDir } = await setup();
    const file = p.attachments.add({ noteId: note.id, name: 'figures.csv', data: TEXT });
    const result = await channels['attachments:save']({ id: file.id });
    expect(result).toEqual({ saved: true, fileName: 'figures.csv' });
    expect(fs.readFileSync(path.join(saveDir, 'figures.csv'))).toEqual(Buffer.from(TEXT));
    expect(fs.readdirSync(saveDir)).toEqual(['figures.csv']);
  });

  it('opens a copy from the app’s own folder with the system’s opener', async () => {
    const { p, note, channels, openDir, openPath } = await setup();
    const file = p.attachments.add({ noteId: note.id, name: 'guide.pdf', data: TEXT });
    await channels['attachments:open']({ id: file.id });
    const copy = path.join(openDir, 'open', file.id, 'guide.pdf');
    expect(openPath).toHaveBeenCalledWith(copy);
    expect(fs.readFileSync(copy)).toEqual(Buffer.from(TEXT));
  });

  it('never opens files that run programs', async () => {
    const { p, note, channels, openPath } = await setup();
    const exe = p.attachments.add({ noteId: note.id, name: 'setup.exe', data: TEXT });
    await expectAppError(() => channels['attachments:open']({ id: exe.id }), 'VALIDATION_FAILED');
    expect(openPath).not.toHaveBeenCalled();
  });
});

describe('attachments in exports', () => {
  it('are in the JSON export as Base64 text', async () => {
    const { p, note } = await setup();
    p.attachments.add({ noteId: note.id, name: 'figures.csv', data: TEXT });
    const exported = buildJsonExport(
      p.db,
      { id: crypto.randomUUID(), name: 'Work' },
      '0.6.0',
      new Date(),
    );
    expect(exported.data['attachments']).toEqual([
      expect.objectContaining({ name: 'figures.csv', data: Buffer.from(TEXT).toString('base64') }),
    ]);
  });
});
