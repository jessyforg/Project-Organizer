import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import type { Note } from '../../src/shared/domain';
import { useNavigation } from '../../src/renderer/app/navigation';
import { AUTOSAVE_MS, NoteEditor } from '../../src/renderer/features/notes/NoteEditor';
import { NoteMarkdown } from '../../src/renderer/features/notes/NoteMarkdown';
import { fail, installApi, ok, renderWithApp } from './harness';

const NOW = '2026-03-10T09:00:00.000Z';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    projectId: 'p1',
    folderId: null,
    archivedAt: null,
    title: 'Plan',
    body: '',
    tagIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

/** Echoes `notes:update` like the real service does. */
function saving(note: Note) {
  return (payload: Record<string, unknown>) => ok({ ...note, ...payload });
}

function RouteProbe() {
  const { route, navigate } = useNavigation();
  return (
    <>
      <p data-testid="route">{route.name}</p>
      <button type="button" onClick={() => navigate({ name: 'trash' })}>
        Go to trash
      </button>
    </>
  );
}

describe('NoteMarkdown (safe preview)', () => {
  it('renders Markdown with GitHub extensions', () => {
    installApi();
    const { container } = renderWithApp(
      <NoteMarkdown text={'# Heading\n\n~~old~~ **bold**\n\n| a | b |\n|---|---|\n| 1 | 2 |'} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Heading' })).toBeInTheDocument();
    expect(container.querySelector('del')).toHaveTextContent('old');
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows task-list items as named, read-only checkboxes', () => {
    installApi();
    renderWithApp(<NoteMarkdown text={'- [x] Booked\n- [ ] Paid'} />);
    expect(screen.getByRole('checkbox', { name: 'Checked item' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Unchecked item' })).toBeDisabled();
  });

  it('shows raw HTML as text and never creates its elements', () => {
    installApi();
    const html = '<script>window.hacked = true</script>\n\n<img src="x" onerror="alert(1)">';
    const { container } = renderWithApp(<NoteMarkdown text={html} />);
    expect(container.querySelector('script, img, [onerror]')).toBeNull();
    expect(container).toHaveTextContent('<script>window.hacked = true</script>');
    expect((window as unknown as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it('never loads images and only links web and mail addresses', () => {
    installApi();
    const { container } = renderWithApp(
      <NoteMarkdown
        text={
          '![Tracking pixel](https://example.com/p.gif) [site](https://example.com) ' +
          '[mail](mailto:a@example.com) [bad](javascript:alert(1)) [local](file:///C:/x)'
        }
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('[Image not shown: Tracking pixel]')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      'https://example.com',
      'mailto:a@example.com',
    ]);
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByText('bad').closest('a')).toBeNull();
    expect(screen.getByText('local').closest('a')).toBeNull();
  });
});

/** The visual editor's body, and a way to drive it as a user's typing would. */
function visualBody() {
  const body = screen.getByRole('textbox', { name: 'Note text' });
  const editor = (body as HTMLElement & { editor: Editor }).editor;
  return {
    body,
    /** Types at the end of the document, through the editor's own input handling. */
    type: (text: string) => act(() => void editor.chain().focus('end').insertContent(text).run()),
    editor,
  };
}

/** Waits past the autosave pause. */
const pastAutosave = () => new Promise((resolve) => setTimeout(resolve, AUTOSAVE_MS + 300));

describe('NoteEditor', () => {
  it('saves visual edits as Markdown after a pause in typing', async () => {
    const note = makeNote();
    const backend = installApi({ 'notes:update': saving(note) });
    renderWithApp(<NoteEditor note={note} />);
    expect(screen.getByRole('button', { name: 'Visual' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.type(visualBody().body, 'Hello');
    expect(screen.getByTestId('note-save-state')).toHaveTextContent('Unsaved changes');
    expect(backend.callsTo('notes:update')).toEqual([]);
    await waitFor(() => expect(screen.getByTestId('note-save-state')).toHaveTextContent('Saved'), {
      timeout: 3000,
    });
    expect(backend.callsTo('notes:update')).toEqual([
      { id: note.id, title: 'Plan', body: 'Hello\n' },
    ]);
  });

  it('saves toolbar formatting as Markdown', async () => {
    const note = makeNote({ body: 'Ship it\n' });
    const backend = installApi({ 'notes:update': saving(note) });
    renderWithApp(<NoteEditor note={note} />);
    const { editor } = visualBody();
    act(() => void editor.commands.selectAll());
    await userEvent.click(screen.getByRole('button', { name: /^Bold/ }));
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(() =>
      expect(backend.callsTo('notes:update')).toEqual([
        { id: note.id, title: 'Plan', body: '**Ship it**\n' },
      ]),
    );
  });

  it('saves a blank title as "Untitled note"', async () => {
    const note = makeNote();
    const backend = installApi({ 'notes:update': saving(note) });
    renderWithApp(<NoteEditor note={note} />);
    await userEvent.clear(screen.getByLabelText('Note title'));
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(() =>
      expect(backend.callsTo('notes:update')).toEqual([
        { id: note.id, title: 'Untitled note', body: '' },
      ]),
    );
  });

  it('opens existing notes in the visual editor without rewriting them', async () => {
    // "*" bullets would be written back as "-"; opening alone must not save that.
    const note = makeNote({ body: '## Agenda\n\n* first\n* second\n' });
    const backend = installApi({ 'notes:update': saving(note) });
    renderWithApp(<NoteEditor note={note} />);
    const { body } = visualBody();
    expect(within(body).getByRole('heading', { level: 2, name: 'Agenda' })).toBeInTheDocument();
    expect(within(body).getAllByRole('listitem')).toHaveLength(2);
    await pastAutosave();
    expect(backend.callsTo('notes:update')).toEqual([]);
    expect(screen.getByTestId('note-save-state')).toHaveTextContent('Saved');
  });

  it('keeps notes the visual editor cannot show in Markdown mode, unchanged', async () => {
    // Images are shown only from stage 6 of 0.6.0; until then they keep a note in Markdown.
    const image = '![Diagram](https://example.com/d.png)\n';
    const note = makeNote({ body: image });
    const backend = installApi({ 'notes:update': saving(note) });
    renderWithApp(<NoteEditor note={note} />);
    expect(screen.getByText(/so it opens as Markdown/)).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Markdown' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('[Image not shown: Diagram]')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Visual' }));
    expect(screen.getByRole('button', { name: 'Markdown' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('textbox', { name: 'Note text' })).toBeNull();
    await pastAutosave();
    expect(backend.callsTo('notes:update')).toEqual([]);
  });

  it('carries text across when switching between Visual and Markdown', async () => {
    const note = makeNote({ body: 'First\n' });
    const backend = installApi({ 'notes:update': saving(note) });
    renderWithApp(<NoteEditor note={note} />);
    visualBody().type(' line');

    await userEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    const source = screen.getByLabelText('Note text (Markdown)');
    expect(source).toHaveValue('First line\n');
    await userEvent.type(source, '{End}- item');

    await userEvent.click(screen.getByRole('button', { name: 'Visual' }));
    const { body } = visualBody();
    expect(body).toHaveTextContent('First line');
    expect(within(body).getByRole('listitem')).toHaveTextContent('item');
    await waitFor(() => expect(screen.getByTestId('note-save-state')).toHaveTextContent('Saved'), {
      timeout: 3000,
    });
    expect(backend.callsTo('notes:update').at(-1)).toEqual({
      id: note.id,
      title: 'Plan',
      body: 'First line\n- item',
    });
  });

  it('shows links the app will not open as inert', () => {
    installApi();
    const note = makeNote({
      body: '[site](https://example.com) [bad](javascript:alert(1)) [local](file:///C:/x)\n',
    });
    renderWithApp(<NoteEditor note={note} />);
    const { body } = visualBody();
    const hrefs = Array.from(body.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://example.com', '', '']);
  });

  it('saves before leaving the screen', async () => {
    const note = makeNote();
    const backend = installApi({ 'notes:update': saving(note) });
    renderWithApp(
      <>
        <RouteProbe />
        <NoteEditor note={note} />
      </>,
    );
    visualBody().type('Draft');
    await userEvent.click(screen.getByRole('button', { name: 'Go to trash' }));
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('trash'));
    expect(backend.callsTo('notes:update')).toEqual([
      { id: note.id, title: 'Plan', body: 'Draft\n' },
    ]);
  });

  it('asks before discarding changes that could not be saved', async () => {
    const note = makeNote();
    installApi({ 'notes:update': () => fail('Disk is full.', 'IO_ERROR') });
    renderWithApp(
      <>
        <RouteProbe />
        <NoteEditor note={note} />
      </>,
    );
    visualBody().type('Important');
    await userEvent.click(screen.getByRole('button', { name: 'Go to trash' }));
    await screen.findByRole('heading', { name: 'Leave without saving?' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('route')).toHaveTextContent('dashboard');
    expect(visualBody().body).toHaveTextContent('Important');

    await userEvent.click(screen.getByRole('button', { name: 'Go to trash' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('trash'));
  });
});
