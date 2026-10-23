import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Note, NoteFolder } from '../../src/shared/domain';
import { useNavigation } from '../../src/renderer/app/navigation';
import { NoteEditor } from '../../src/renderer/features/notes/NoteEditor';
import { NotesPage } from '../../src/renderer/features/notes/NotesPage';
import { installApi, ok, renderWithApp } from './harness';

const NOW = '2026-03-10T09:00:00.000Z';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    projectId: 'p1',
    folderId: null,
    archivedAt: null,
    title: 'Plan',
    body: 'Ship it\n',
    tagIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const FOLDER: NoteFolder = {
  id: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
  name: 'Work',
  noteCount: 2,
  createdAt: NOW,
  updatedAt: NOW,
};

function RouteProbe() {
  const { route } = useNavigation();
  return <p data-testid="route">{JSON.stringify(route)}</p>;
}

const openMenu = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Note actions' }));
  return screen.getByRole('menu');
};

/** The note and trash actions called, in order (the backlinks panel's reads are not actions). */
const channelsCalled = (backend: ReturnType<typeof installApi>) =>
  backend.calls
    .map((c) => c.channel)
    .filter((c) => (c.startsWith('notes:') || c.startsWith('trash:')) && c !== 'notes:backlinks');

describe('Note actions menu', () => {
  it('offers rename, duplicate, move, archive, copy, export, and trash, in that order', async () => {
    installApi();
    renderWithApp(<NoteEditor note={makeNote()} />);
    const menu = await openMenu();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([
      'Rename',
      'Duplicate',
      'Move to folder…',
      'Archive',
      'Copy as Markdown',
      'Export as Markdown…',
      'Move to trash…',
    ]);
  });

  it('Rename puts the cursor in the title with the text selected', async () => {
    installApi();
    renderWithApp(<NoteEditor note={makeNote()} />);
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Rename' }));
    const title = screen.getByLabelText<HTMLTextAreaElement>('Note title');
    expect(title).toHaveFocus();
    expect([title.selectionStart, title.selectionEnd]).toEqual([0, 'Plan'.length]);
  });

  it('Duplicate saves pending edits first, then opens the copy', async () => {
    const note = makeNote();
    const copy = makeNote({ id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', title: 'Plan (copy)' });
    const backend = installApi({
      'notes:update': (payload) => ok({ ...note, ...payload }),
      'notes:duplicate': () => ok(copy),
    });
    renderWithApp(
      <>
        <RouteProbe />
        <NoteEditor note={note} />
      </>,
    );
    await userEvent.type(screen.getByLabelText('Note title'), ' B');
    await userEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Duplicate' }));
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(copy.id));
    expect(channelsCalled(backend)).toEqual(['notes:update', 'notes:duplicate']);
    expect(await screen.findByText('Created “Plan (copy)”.')).toBeInTheDocument();
  });

  it('Copy as Markdown copies the saved note and says so', async () => {
    const backend = installApi();
    renderWithApp(<NoteEditor note={makeNote()} />);
    await userEvent.click(
      within(await openMenu()).getByRole('menuitem', { name: 'Copy as Markdown' }),
    );
    expect(await screen.findByText('Copied the note as Markdown.')).toBeInTheDocument();
    expect(backend.callsTo('notes:copyMarkdown')).toEqual([{ id: makeNote().id }]);
  });

  it('Export reports the saved file, and stays quiet when cancelled', async () => {
    let saved = true;
    installApi({
      'notes:exportMarkdown': () =>
        ok(saved ? { saved: true, fileName: 'Plan.md' } : { saved: false }),
    });
    renderWithApp(<NoteEditor note={makeNote()} />);
    const exportItem = async () =>
      userEvent.click(
        within(await openMenu()).getByRole('menuitem', { name: 'Export as Markdown…' }),
      );
    await exportItem();
    expect(await screen.findByText('Saved “Plan.md”.')).toBeInTheDocument();
    saved = false;
    await exportItem();
    await waitFor(() => expect(screen.getAllByText(/^Saved “/)).toHaveLength(1));
  });

  it('asks before moving the note to the trash', async () => {
    const backend = installApi({ 'trash:trashNote': () => ok({ batchId: crypto.randomUUID() }) });
    renderWithApp(<NoteEditor note={makeNote()} />);
    await userEvent.click(
      within(await openMenu()).getByRole('menuitem', { name: 'Move to trash…' }),
    );
    expect(screen.getByRole('heading', { name: 'Move “Plan” to the trash?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(backend.callsTo('trash:trashNote')).toEqual([]);

    await userEvent.click(
      within(await openMenu()).getByRole('menuitem', { name: 'Move to trash…' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Move to trash' }));
    await waitFor(() =>
      expect(backend.callsTo('trash:trashNote')).toEqual([{ id: makeNote().id }]),
    );
  });

  it('moves the note into a folder and out again', async () => {
    const note = makeNote();
    const backend = installApi({
      'noteFolders:list': () => ok([FOLDER]),
      'notes:setFolder': (payload) => ok({ ...note, ...payload }),
    });
    renderWithApp(<NoteEditor note={note} />);
    const select = screen.getByLabelText('Folder');
    await screen.findByRole('option', { name: 'Work' });
    await userEvent.selectOptions(select, 'Work');
    await userEvent.selectOptions(select, 'No folder');
    expect(backend.callsTo('notes:setFolder')).toEqual([
      { id: note.id, folderId: FOLDER.id },
      { id: note.id, folderId: null },
    ]);
  });
});

describe('Notes screen: folders', () => {
  it('lists folders with counts and filters the notes by folder', async () => {
    const backend = installApi({ 'noteFolders:list': () => ok([FOLDER]) });
    renderWithApp(<NotesPage noteId={null} />);
    const nav = screen.getByRole('navigation', { name: 'Note folders' });
    const work = await within(nav).findByRole('button', { name: /^Work/ });
    expect(work).toHaveTextContent('2');
    await userEvent.click(work);
    expect(work).toHaveAttribute('aria-current', 'true');
    await waitFor(() =>
      expect(backend.callsTo('notes:list').at(-1)).toMatchObject({ folderId: FOLDER.id }),
    );
    await userEvent.click(within(nav).getByRole('button', { name: 'No folder' }));
    await waitFor(() =>
      expect(backend.callsTo('notes:list').at(-1)).toMatchObject({ folderId: null }),
    );
  });

  it('creates new notes in the folder being viewed', async () => {
    const backend = installApi({
      'noteFolders:list': () => ok([FOLDER]),
      'notes:create': () => ok(makeNote()),
    });
    renderWithApp(<NotesPage noteId={null} />);
    const nav = screen.getByRole('navigation', { name: 'Note folders' });
    await userEvent.click(await within(nav).findByRole('button', { name: /^Work/ }));
    await userEvent.click(screen.getByRole('button', { name: 'New note' }));
    await waitFor(() =>
      expect(backend.callsTo('notes:create')).toEqual([
        { title: 'Untitled note', folderId: FOLDER.id },
      ]),
    );
  });

  it('creates, renames, and deletes folders', async () => {
    const backend = installApi({
      'noteFolders:list': () => ok([FOLDER]),
      'noteFolders:create': () => ok(FOLDER),
      'noteFolders:rename': () => ok(FOLDER),
    });
    renderWithApp(<NotesPage noteId={null} />);
    await userEvent.click(screen.getByRole('button', { name: 'New folder' }));
    await userEvent.type(screen.getByLabelText('Folder name'), 'Ideas');
    await userEvent.click(screen.getByRole('button', { name: 'Create folder' }));
    expect(backend.callsTo('noteFolders:create')).toEqual([{ name: 'Ideas' }]);

    const actions = await screen.findByRole('button', { name: 'Actions for folder Work' });
    await userEvent.click(actions);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename folder' }));
    const name = screen.getByLabelText('Folder name');
    expect(name).toHaveValue('Work');
    await userEvent.clear(name);
    await userEvent.type(name, 'Job');
    await userEvent.click(screen.getByRole('button', { name: 'Rename folder' }));
    expect(backend.callsTo('noteFolders:rename')).toEqual([{ id: FOLDER.id, name: 'Job' }]);

    await userEvent.click(actions);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete folder' }));
    expect(screen.getByText('Its notes are kept and move to “No folder”.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete folder' }));
    expect(backend.callsTo('noteFolders:delete')).toEqual([{ id: FOLDER.id }]);
  });
});

describe('Notes screen: importing Markdown files', () => {
  const md = (name: string, text: string) => new File([text], name, { type: 'text/markdown' });

  function setup() {
    const imported = makeNote({ id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', title: 'Roadmap' });
    const backend = installApi({ 'notes:import': () => ok([imported]) });
    renderWithApp(
      <>
        <RouteProbe />
        <NotesPage noteId={null} />
      </>,
    );
    return { backend, imported };
  }

  it('imports picked files, using a leading heading as the title', async () => {
    const { backend, imported } = setup();
    await userEvent.upload(screen.getByTestId('import-markdown-input'), [
      md('roadmap.md', '# Roadmap\n\n- Folders\n'),
    ]);
    await waitFor(() =>
      expect(backend.callsTo('notes:import')).toEqual([
        { folderId: null, notes: [{ title: 'Roadmap', body: '- Folders\n' }] },
      ]),
    );
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent(imported.id));
    expect(await screen.findByText('Imported 1 note.')).toBeInTheDocument();
  });

  it('explains files it skips', async () => {
    const { backend } = setup();
    const input = screen.getByTestId('import-markdown-input');
    // The picker filters by extension; a drop does not, so the check must hold either way.
    fireEvent.change(input, { target: { files: [md('a.md', 'A'), md('b.txt', 'B')] } });
    expect(
      await screen.findByText(
        'Imported 1 note. Skipped 1: b.txt: Only .md and .markdown files can be imported.',
      ),
    ).toBeInTheDocument();
    expect(backend.callsTo('notes:import')[0]).toMatchObject({
      notes: [{ title: 'a', body: 'A' }],
    });
  });

  it('imports dropped files', async () => {
    const { backend } = setup();
    const area = screen.getByRole('region', { name: 'All notes' }).parentElement!;
    const dataTransfer = { files: [md('drop.md', 'Dropped')], types: ['Files'] };
    fireEvent.dragOver(area, { dataTransfer });
    expect(screen.getByText('Drop Markdown files to import them')).toBeInTheDocument();
    fireEvent.drop(area, { dataTransfer });
    await waitFor(() =>
      expect(backend.callsTo('notes:import')[0]).toMatchObject({
        notes: [{ title: 'drop', body: 'Dropped' }],
      }),
    );
  });

  it('imports pasted files, but not while the user is typing in a field', async () => {
    const { backend } = setup();
    fireEvent.paste(screen.getByLabelText('Search notes'), {
      clipboardData: { files: [md('typed.md', 'X')] },
    });
    fireEvent.paste(document.body, { clipboardData: { files: [md('pasted.md', 'Pasted')] } });
    await waitFor(() =>
      expect(backend.callsTo('notes:import')).toEqual([
        { folderId: null, notes: [{ title: 'pasted', body: 'Pasted' }] },
      ]),
    );
  });
});
