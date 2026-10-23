import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import type { AttachmentInfo, Note } from '../../src/shared/domain';
import { noteExtensions } from '../../src/renderer/features/editor/editor-config';
import { createMarkdownCodec } from '../../src/renderer/features/editor/markdown';
import { NoteEditor } from '../../src/renderer/features/notes/NoteEditor';
import { fail, installApi, ok, renderWithApp } from './harness';

const NOW = '2026-03-10T09:00:00.000Z';
const NOTE_ID = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const IMG = '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';
const PDF = '7b8c9d0e-1f2a-4b3c-9d4e-5f6a7b8c9d0e';
const EXE = '8c9d0e1f-2a3b-4c4d-8e5f-6a7b8c9d0e1f';
const GONE = '9d0e1f2a-3b4c-4d5e-9f6a-7b8c9d0e1f2a';
const NEW = '0e1f2a3b-4c5d-4e6f-8a7b-8c9d0e1f2a3b';
const codec = createMarkdownCodec(noteExtensions());
const url = (id: string) => `projectforge://file/${id}`;

const INFO: Record<string, AttachmentInfo> = {
  [IMG]: {
    id: IMG,
    name: 'map.png',
    kind: 'image',
    mime: 'image/png',
    size: 2048,
    missing: false,
    executable: false,
  },
  [PDF]: {
    id: PDF,
    name: 'guide.pdf',
    kind: 'file',
    mime: 'application/octet-stream',
    size: 3 * 1024 * 1024,
    missing: false,
    executable: false,
  },
  [EXE]: {
    id: EXE,
    name: 'setup.exe',
    kind: 'file',
    mime: 'application/octet-stream',
    size: 10,
    missing: false,
    executable: true,
  },
};

const note = (body: string): Note => ({
  id: NOTE_ID,
  projectId: 'p1',
  folderId: null,
  archivedAt: null,
  title: 'Trip',
  body,
  tagIds: [],
  createdAt: NOW,
  updatedAt: NOW,
});

function setup(body: string) {
  const backend = installApi({
    'notes:backlinks': () => ok({ linked: [], unlinked: [] }),
    'attachments:info': (payload) =>
      ok(
        (payload['ids'] as string[]).map(
          (id) => INFO[id] ?? { id, name: '', kind: 'file', mime: '', size: 0, missing: true },
        ),
      ),
    // Like the service: only stored images can be read.
    'attachments:readImage': (payload) =>
      INFO[payload['id'] as string]?.kind === 'image'
        ? ok({ mime: 'image/png', data: new Uint8Array([1, 2, 3]) })
        : fail('File not found.', 'NOT_FOUND'),
    'attachments:add': (payload) =>
      ok({
        id: NEW,
        name: payload['name'] as string,
        kind: 'image',
        mime: 'image/png',
        size: (payload['data'] as Uint8Array).byteLength,
        missing: false,
        executable: false,
      }),
    'attachments:save': () => ok({ saved: true, fileName: 'guide.pdf' }),
    'attachments:open': () => ok(null),
    'notes:update': (payload) => ok({ ...note(body), ...payload }),
  });
  renderWithApp(<NoteEditor note={note(body)} />);
  const editorBody = screen.queryByRole('textbox', { name: 'Note text' });
  const editor = (editorBody as unknown as { editor: Editor } | null)?.editor as Editor;
  return { backend, editor, editorBody: editorBody! };
}

describe('attachments in Markdown', () => {
  it('open as images and file chips, and are saved unchanged', () => {
    const md = `See ![A map \\[1\\]](${url(IMG)}) and [guide.pdf](${url(PDF)}).\n`;
    const opened = codec.fromMarkdown(md);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const inline = opened.content.content?.[0]?.content ?? [];
    expect(inline.map((n) => n.type)).toEqual([
      'text',
      'noteImage',
      'text',
      'fileAttachment',
      'text',
    ]);
    expect(inline[1]?.attrs).toEqual({ id: IMG, alt: 'A map [1]' });
    expect(codec.toMarkdown(opened.content)).toBe(md);
  });

  it('open an image alone on its line, or alone in a quote, in the visual editor', () => {
    for (const md of [
      `![A map](${url(IMG)})\n`,
      `> ![A map](${url(IMG)})\n`,
      // After a paragraph: the image must not be merged into it.
      `Packing list.\n\n![A map](${url(IMG)})\n\nAfter.\n`,
    ]) {
      const opened = codec.fromMarkdown(md);
      expect(opened.ok).toBe(true);
      if (opened.ok) expect(codec.toMarkdown(opened.content)).toBe(md);
    }
  });

  it('keep images on the web, and malformed addresses, in Markdown mode', () => {
    expect(codec.fromMarkdown('![x](https://example.com/x.png)\n').ok).toBe(false);
    expect(codec.fromMarkdown('![x](projectforge://file/not-an-id)\n').ok).toBe(false);
  });
});

describe('images in the editor', () => {
  it('show the stored image with its description, which can be edited', async () => {
    const { editor } = setup(`![A map](${url(IMG)})\n`);
    const image = await screen.findByRole('img', { name: 'A map' });
    await waitFor(() => expect(image.getAttribute('src')).toMatch(/^blob:/));
    const description = screen.getByRole('textbox', { name: 'Image description (alt text)' });
    expect(description).toHaveValue('A map');
    await userEvent.clear(description);
    await userEvent.type(description, 'Route to the coast{Enter}');
    expect(codec.toMarkdown(editor.getJSON())).toBe(`![Route to the coast](${url(IMG)})\n`);
  });

  it('say when an image is no longer stored', async () => {
    setup(`![Old photo](${url(GONE)})\n`);
    expect(await screen.findByText('Image not found: Old photo')).toBeInTheDocument();
  });

  it('are added by pasting a file, into this note', async () => {
    const { editor, editorBody, backend } = setup('Before\n');
    act(() => {
      editor.commands.focus('end');
      editor.view.focus();
    });
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'screenshot.png', {
      type: 'image/png',
    });
    fireEvent.paste(editorBody, {
      clipboardData: { files: [file], types: ['Files'], getData: () => '' },
    });
    await waitFor(() => expect(codec.toMarkdown(editor.getJSON())).toContain(`![](${url(NEW)})`));
    const [added] = backend.callsTo('attachments:add');
    expect(added).toMatchObject({ noteId: NOTE_ID, name: 'screenshot.png' });
    expect(added!['data']).toBeInstanceOf(Uint8Array);
  });
});

describe('file chips', () => {
  it('show the name and size, and open or save a copy', async () => {
    const { backend } = setup(`[guide.pdf](${url(PDF)})\n`);
    const save = await screen.findByRole('button', { name: 'Save a copy of guide.pdf' });
    expect(screen.getByText('3.0 MB')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open guide.pdf' }));
    await userEvent.click(save);
    expect(backend.callsTo('attachments:open')).toEqual([{ id: PDF }]);
    expect(backend.callsTo('attachments:save')).toEqual([{ id: PDF }]);
    expect(await screen.findByText('Saved “guide.pdf”.')).toBeInTheDocument();
  });

  it('offer only “Save a copy” for files that run programs', async () => {
    setup(`[setup.exe](${url(EXE)})\n`);
    expect(await screen.findByRole('button', { name: 'Save a copy of setup.exe' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Open setup.exe' })).toBeNull();
  });
});

describe('attachments in the Markdown preview', () => {
  it('show stored images and file buttons; web images stay unloaded', async () => {
    // The web image keeps this note in Markdown mode, so it opens as the preview.
    setup(
      `![A map](${url(IMG)}) [guide.pdf](${url(PDF)})\n\n![Remote](https://example.com/r.png)\n`,
    );
    const image = await screen.findByRole('img', { name: 'A map' });
    await waitFor(() => expect(image.getAttribute('src')).toMatch(/^blob:/));
    expect(await screen.findByRole('button', { name: 'Save a copy of guide.pdf' })).toBeVisible();
    expect(screen.getByText('[Image not shown: Remote]')).toBeInTheDocument();
  });
});
