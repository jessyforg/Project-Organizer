import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Note, NoteFolder, NoteSummary } from '../../src/shared/domain';
import { useFocusMode, FocusModeProvider } from '../../src/renderer/app/focus';
import { useNavigation } from '../../src/renderer/app/navigation';
import { AUTOSAVE_MS } from '../../src/renderer/features/notes/NoteEditor';
import { NotesPage } from '../../src/renderer/features/notes/NotesPage';
import { installApi, ok, renderWithApp } from './harness';

const NOW = '2026-03-10T09:00:00.000Z';
const NOTE_ID = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: NOTE_ID,
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

function summary(note: Note): NoteSummary {
  const { body, ...rest } = note;
  return { ...rest, excerpt: body.trim() };
}

const FOLDER: NoteFolder = {
  id: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
  name: 'Work',
  noteCount: 1,
  createdAt: NOW,
  updatedAt: NOW,
};

function Probe() {
  const { route } = useNavigation();
  const { focused } = useFocusMode();
  return (
    <p data-testid="probe">
      {JSON.stringify(route)} focused={String(focused)}
    </p>
  );
}

function renderNotes(noteId: string | null) {
  return renderWithApp(
    <FocusModeProvider>
      <Probe />
      <NotesPage noteId={noteId} />
    </FocusModeProvider>,
  );
}

describe('Notes library', () => {
  it('lists notes full width, without an open note', async () => {
    installApi({ 'notes:list': () => ok([summary(makeNote())]) });
    renderNotes(null);
    const list = await screen.findByRole('list', { name: 'Notes' });
    expect(within(list).getByRole('button', { name: /Plan/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Open note' })).toBeNull();
  });

  it('sorts and shows archived notes on request', async () => {
    const backend = installApi();
    renderNotes(null);
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'Title (A–Z)');
    await waitFor(() =>
      expect(backend.callsTo('notes:list').at(-1)).toMatchObject({ sort: 'title' }),
    );
    const folders = screen.getByRole('navigation', { name: 'Note folders' });
    await userEvent.click(within(folders).getByRole('button', { name: 'Archived' }));
    await waitFor(() =>
      expect(backend.callsTo('notes:list').at(-1)).toMatchObject({ archived: 'only' }),
    );
    expect(await screen.findByText('No archived notes.')).toBeInTheDocument();
  });

  it('opens a note’s actions on right-click, and archives it', async () => {
    const note = makeNote();
    const backend = installApi({
      'notes:list': () => ok([summary(note)]),
      'notes:archive': () => ok({ ...note, archivedAt: NOW }),
    });
    renderNotes(null);
    const row = await screen.findByRole('button', { name: /Plan/ });
    fireEvent.contextMenu(row, { clientX: 40, clientY: 60 });
    const menu = screen.getByRole('menu', { name: 'Actions for note Plan' });
    expect(within(menu).getAllByRole('menuitem')[0]).toHaveFocus();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual([
      'Open',
      'Rename',
      'Duplicate',
      'Move to folder…',
      'Archive',
      'Copy as Markdown',
      'Export as Markdown…',
      'Move to trash…',
    ]);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Archive' }));
    expect(backend.callsTo('notes:archive')).toEqual([{ id: note.id }]);
    expect(await screen.findByText('Archived “Plan”.')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens the same menu with Shift+F10, and Escape returns focus to the row', async () => {
    installApi({ 'notes:list': () => ok([summary(makeNote())]) });
    renderNotes(null);
    const row = await screen.findByRole('button', { name: /Plan/ });
    row.focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.getByRole('menu', { name: 'Actions for note Plan' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(row).toHaveFocus();
  });

  it('renames a note from its menu', async () => {
    const note = makeNote();
    const backend = installApi({
      'notes:list': () => ok([summary(note)]),
      'notes:update': (payload) => ok({ ...note, ...payload }),
    });
    renderNotes(null);
    fireEvent.contextMenu(await screen.findByRole('button', { name: /Plan/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = screen.getByLabelText('Note title');
    await userEvent.clear(field);
    await userEvent.type(field, 'Roadmap');
    await userEvent.click(screen.getByRole('button', { name: 'Rename note' }));
    expect(backend.callsTo('notes:update')).toEqual([{ id: note.id, title: 'Roadmap' }]);
  });

  it('offers rename and delete on a folder’s right-click menu', async () => {
    installApi({ 'noteFolders:list': () => ok([FOLDER]) });
    renderNotes(null);
    const folders = screen.getByRole('navigation', { name: 'Note folders' });
    fireEvent.contextMenu(await within(folders).findByRole('button', { name: /^Work/ }));
    const menu = screen.getByRole('menu', { name: 'Actions for folder Work' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent),
    ).toEqual(['Rename folder', 'Delete folder']);
  });
});

describe('Note view', () => {
  it('shows one note with a way back to the library', async () => {
    installApi({ 'notes:get': () => ok(makeNote()) });
    renderNotes(NOTE_ID);
    expect(await screen.findByLabelText('Note title')).toHaveValue('Plan');
    expect(screen.queryByRole('list', { name: 'Notes' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'All notes' }));
    expect(screen.getByTestId('probe')).toHaveTextContent('"noteId":null');
  });

  it('never shows the previous note while the next one loads', async () => {
    const first = makeNote();
    const second = makeNote({ id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', title: 'Second' });
    let release: () => void = () => undefined;
    installApi({
      'notes:get': ({ id }) =>
        id === first.id
          ? ok(first)
          : new Promise((resolve) => {
              release = () => resolve(ok(second));
            }),
    });
    function Switcher() {
      const [noteId, setNoteId] = useState(first.id);
      return (
        <FocusModeProvider>
          <button type="button" onClick={() => setNoteId(second.id)}>
            Show second
          </button>
          <NotesPage noteId={noteId} />
        </FocusModeProvider>
      );
    }
    renderWithApp(<Switcher />);
    expect(await screen.findByLabelText('Note title')).toHaveValue('Plan');
    await userEvent.click(screen.getByRole('button', { name: 'Show second' }));
    // While the second note loads, no editor shows the first note's text.
    expect(screen.queryByLabelText('Note title')).toBeNull();
    release();
    expect(await screen.findByLabelText('Note title')).toHaveValue('Second');
  });

  it('enters focus mode, hides the note’s details, and leaves it with Escape', async () => {
    installApi({ 'notes:get': () => ok(makeNote()) });
    renderNotes(NOTE_ID);
    await screen.findByLabelText('Note title');
    const focus = screen.getByRole('button', { name: 'Focus' });
    await userEvent.click(focus);
    expect(screen.getByTestId('probe')).toHaveTextContent('focused=true');
    expect(screen.getByRole('button', { name: 'Exit focus' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByLabelText('Project')).toBeNull();
    // Escape from inside the editor, where ProseMirror also handles it.
    await userEvent.click(screen.getByRole('textbox', { name: 'Note text' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('probe')).toHaveTextContent('focused=false');
    await userEvent.keyboard('{Control>}{Shift>}f{/Shift}{/Control}');
    expect(screen.getByTestId('probe')).toHaveTextContent('focused=true');
  });

  it('shows archived notes read-only, with a way to unarchive', async () => {
    // No trailing newline: the editor would write one, so any save would show here.
    const note = makeNote({ archivedAt: NOW, body: 'Ship it' });
    let current = note;
    const backend = installApi({
      'notes:get': () => ok(current),
      'notes:unarchive': () => ok((current = { ...note, archivedAt: null })),
    });
    renderNotes(NOTE_ID);
    expect(await screen.findByText('This note is archived, so it cannot be edited.')).toBeVisible();
    expect(screen.getByLabelText('Note title')).toHaveAttribute('readonly');
    expect(screen.getByRole('textbox', { name: 'Note text' })).toHaveAttribute(
      'contenteditable',
      'false',
    );
    expect(screen.queryByRole('toolbar', { name: 'Formatting' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
    expect(backend.callsTo('notes:unarchive')).toEqual([{ id: note.id }]);
    // Becoming editable is not an edit: nothing is saved.
    expect(await screen.findByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, AUTOSAVE_MS + 300));
    expect(screen.getByTestId('note-save-state')).toHaveTextContent('Saved');
    expect(backend.callsTo('notes:update')).toEqual([]);
  });
});
