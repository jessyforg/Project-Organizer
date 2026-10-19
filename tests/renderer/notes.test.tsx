import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Note } from '../../src/shared/domain';
import { useNavigation } from '../../src/renderer/app/navigation';
import { NoteEditor } from '../../src/renderer/features/notes/NoteEditor';
import { NoteMarkdown } from '../../src/renderer/features/notes/NoteMarkdown';
import { fail, installApi, ok, renderWithApp } from './harness';

const NOW = '2026-03-10T09:00:00.000Z';

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    projectId: 'p1',
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

describe('NoteEditor', () => {
  it('saves automatically after a pause in typing', async () => {
    const note = makeNote();
    const backend = installApi({ 'notes:update': saving(note) });
    renderWithApp(<NoteEditor note={note} />);
    await userEvent.type(screen.getByLabelText('Note text (Markdown)'), 'Hello');
    expect(screen.getByTestId('note-save-state')).toHaveTextContent('Unsaved changes');
    expect(backend.callsTo('notes:update')).toEqual([]);
    await waitFor(() => expect(screen.getByTestId('note-save-state')).toHaveTextContent('Saved'), {
      timeout: 3000,
    });
    expect(backend.callsTo('notes:update')).toEqual([
      { id: note.id, title: 'Plan', body: 'Hello' },
    ]);
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

  it('opens existing notes in preview', () => {
    installApi();
    renderWithApp(<NoteEditor note={makeNote({ body: '## Agenda' })} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Agenda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true');
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
    await userEvent.type(screen.getByLabelText('Note text (Markdown)'), 'Draft');
    await userEvent.click(screen.getByRole('button', { name: 'Go to trash' }));
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('trash'));
    expect(backend.callsTo('notes:update')).toEqual([
      { id: note.id, title: 'Plan', body: 'Draft' },
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
    await userEvent.type(screen.getByLabelText('Note text (Markdown)'), 'Important');
    await userEvent.click(screen.getByRole('button', { name: 'Go to trash' }));
    await screen.findByRole('heading', { name: 'Leave without saving?' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByTestId('route')).toHaveTextContent('dashboard');
    expect(screen.getByLabelText('Note text (Markdown)')).toHaveValue('Important');

    await userEvent.click(screen.getByRole('button', { name: 'Go to trash' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('trash'));
  });
});
