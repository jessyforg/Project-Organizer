import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '../../src/shared/domain';
import { noteExtensions } from '../../src/renderer/features/editor/editor-config';
import { createMarkdownCodec } from '../../src/renderer/features/editor/markdown';
import { NoteEditor } from '../../src/renderer/features/notes/NoteEditor';
import { installApi, ok, renderWithApp } from './harness';

const NEW = '0e1f2a3b-4c5d-4e6f-8a7b-8c9d0e1f2a3b';
const codec = createMarkdownCodec(noteExtensions());

const note: Note = {
  id: '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  projectId: 'p1',
  folderId: null,
  archivedAt: null,
  title: 'Trip',
  body: '',
  tagIds: [],
  createdAt: '2026-03-10T09:00:00.000Z',
  updatedAt: '2026-03-10T09:00:00.000Z',
};

/** The system file picker: answers with `files` when it is opened. */
function fakePicker(files: File[]) {
  return vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement,
  ) {
    if (this.type !== 'file') return;
    Object.defineProperty(this, 'files', { value: files });
    this.dispatchEvent(new Event('change'));
  });
}

afterEach(() => vi.restoreAllMocks());

function setup() {
  const backend = installApi({
    'notes:backlinks': () => ok({ linked: [], unlinked: [] }),
    'attachments:add': (payload) =>
      ok({
        id: NEW,
        name: payload['name'] as string,
        kind: 'file',
        mime: 'application/octet-stream',
        size: 4,
        missing: false,
        executable: false,
      }),
    'attachments:info': (payload) => ok((payload['ids'] as string[]).map(() => null)),
  });
  renderWithApp(<NoteEditor note={note} />);
  const body = screen.getByRole('textbox', { name: 'Note text' });
  const editor = (body as unknown as { editor: Editor }).editor;
  act(() => {
    editor.commands.setTextSelection(1);
    editor.view.focus();
  });
  const slash = async (query: string) => {
    await act(async () => {
      editor.commands.insertContent(`/${query}`);
      await Promise.resolve();
    });
    fireEvent.keyDown(body, { key: 'Enter' });
  };
  return { backend, body, editor, slash };
}

describe('the /file and /image prompt (the file window opens from a click)', () => {
  it('shows a prompt instead of opening the file window straight away', async () => {
    const picker = fakePicker([]);
    const { slash } = setup();
    await slash('file');
    expect(screen.getByRole('button', { name: 'Choose a file…' })).toBeInTheDocument();
    expect(screen.getByText('or paste or drop one here')).toBeInTheDocument();
    expect(picker).not.toHaveBeenCalled();
  });

  it('opens the file window when “Choose” is clicked, and adds the chosen file there', async () => {
    const file = new File(['plan'], 'plan.txt');
    fakePicker([file]);
    const { slash, editor, backend } = setup();
    await slash('file');
    await userEvent.click(screen.getByRole('button', { name: 'Choose a file…' }));
    await waitFor(() =>
      expect(codec.toMarkdown(editor.getJSON())).toContain(
        `[plan.txt](projectforge://file/${NEW})`,
      ),
    );
    expect(backend.callsTo('attachments:add')[0]).toMatchObject({ name: 'plan.txt' });
    expect(screen.queryByRole('button', { name: 'Choose a file…' })).toBeNull();
  });

  it('opens the file window with Enter too, for keyboard users', async () => {
    const picker = fakePicker([]);
    const { slash, body } = setup();
    await slash('image');
    expect(screen.getByRole('button', { name: 'Choose an image…' })).toBeInTheDocument();
    fireEvent.keyDown(body, { key: 'Enter' });
    expect(picker).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape or Cancel, without leaving focus mode', async () => {
    fakePicker([]);
    const { slash, body } = setup();
    await slash('file');
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    fireEvent.keyDown(body, { key: 'Escape' });
    window.removeEventListener('keydown', onWindowKey);
    expect(screen.queryByRole('button', { name: 'Choose a file…' })).toBeNull();
    expect(onWindowKey).not.toHaveBeenCalled();
    await slash('file');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel adding a file' }));
    expect(screen.queryByRole('button', { name: 'Choose a file…' })).toBeNull();
  });

  it('goes away when you keep typing instead', async () => {
    fakePicker([]);
    const { slash, editor } = setup();
    await slash('file');
    act(() => void editor.commands.insertContent('Never mind'));
    expect(screen.queryByRole('button', { name: 'Choose a file…' })).toBeNull();
  });
});
