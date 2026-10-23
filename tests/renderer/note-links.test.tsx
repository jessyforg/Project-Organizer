import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import type { AppLinkInfo, Note, NoteSummary } from '../../src/shared/domain';
import { useNavigation } from '../../src/renderer/app/navigation';
import { noteExtensions } from '../../src/renderer/features/editor/editor-config';
import { createMarkdownCodec } from '../../src/renderer/features/editor/markdown';
import { NoteEditor } from '../../src/renderer/features/notes/NoteEditor';
import { installApi, ok, renderWithApp } from './harness';

const NOW = '2026-03-10T09:00:00.000Z';
const SELF = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const ROADMAP = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const GONE = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';
const NEW = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const codec = createMarkdownCodec(noteExtensions());

function makeNote(body: string): Note {
  return {
    id: SELF,
    projectId: 'p1',
    folderId: 'f1',
    archivedAt: null,
    title: 'Weekly',
    body,
    tagIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function summary(id: string, title: string): NoteSummary {
  return {
    id,
    projectId: 'p1',
    folderId: null,
    archivedAt: null,
    title,
    excerpt: '',
    tagIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const info = (id: string, label: string, missing = false): AppLinkInfo => ({
  kind: 'note',
  id,
  label,
  missing,
  archived: false,
  projectId: 'p1',
});

function RouteProbe() {
  const { route } = useNavigation();
  return <p data-testid="route">{JSON.stringify(route)}</p>;
}

function setup(body: string, extra: Parameters<typeof installApi>[0] = {}) {
  const backend = installApi({
    'links:resolve': (payload) =>
      ok(
        (payload['targets'] as { id: string }[]).map((t) =>
          t.id === ROADMAP ? info(ROADMAP, 'Roadmap 2027') : info(t.id, '', true),
        ),
      ),
    'notes:list': () => ok([summary(SELF, 'Weekly'), summary(ROADMAP, 'Roadmap 2027')]),
    'notes:backlinks': () => ok({ linked: [], unlinked: [] }),
    ...extra,
  });
  renderWithApp(
    <>
      <RouteProbe />
      <NoteEditor note={makeNote(body)} />
    </>,
  );
  // Absent when the note opens in Markdown mode (the preview test).
  const body_ = screen.queryByRole('textbox', { name: 'Note text' })!;
  const editor = (body_ as unknown as { editor: Editor } | null)?.editor as Editor;
  const route = () => JSON.parse(screen.getByTestId('route').textContent ?? '{}') as unknown;
  return { backend, body: body_, editor, route };
}

const linkTo = (id: string, label: string) => `[${label}](projectforge://note/${id})`;

describe('note links in Markdown', () => {
  it('open as link chips and are saved unchanged', () => {
    const md = `See ${linkTo(ROADMAP, 'Road \\[map\\]')} today.\n`;
    const opened = codec.fromMarkdown(md);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.content.content?.[0]?.content?.[1]).toEqual({
      type: 'appLink',
      attrs: { kind: 'note', id: ROADMAP, label: 'Road [map]' },
    });
    expect(codec.toMarkdown(opened.content)).toBe(md);
  });

  it('stay plain code inside code', () => {
    const md = `\`${linkTo(ROADMAP, 'x')}\`\n`;
    const opened = codec.fromMarkdown(md);
    expect(opened.ok && JSON.stringify(opened.content)).not.toContain('appLink');
  });
});

describe('link chips', () => {
  it('show the linked note’s current title and open it; Ctrl+click opens it in focus mode', async () => {
    setup(`See ${linkTo(ROADMAP, 'Roadmap')}.\n`);
    const chip = await screen.findByRole('link', { name: 'Note: Roadmap 2027' });
    await userEvent.click(chip);
    expect(screen.getByTestId('route')).toHaveTextContent(ROADMAP);
    fireEvent.click(chip, { ctrlKey: true });
    await waitFor(() =>
      expect(JSON.parse(screen.getByTestId('route').textContent)).toMatchObject({
        name: 'notes',
        noteId: ROADMAP,
        focus: true,
      }),
    );
  });

  it('show links to missing or trashed notes as broken, and do not open them', async () => {
    const { route } = setup(`See ${linkTo(GONE, 'Old plan')}.\n`);
    const chip = await screen.findByRole('link', { name: 'Note: Old plan (not found)' });
    expect(chip).toHaveAttribute('aria-disabled', 'true');
    expect(chip).toHaveClass('app-link--missing');
    const before = route();
    await userEvent.click(chip);
    expect(route()).toEqual(before);
  });
});

describe('the [[ picker', () => {
  const type = (editor: Editor, text: string) =>
    act(async () => {
      editor.commands.focus('end');
      editor.view.focus();
      editor.commands.insertContent(text);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

  it('lists other notes, and links the chosen one', async () => {
    const { editor, body } = setup('');
    await type(editor, '[[Road');
    const list = await screen.findByRole('listbox', { name: 'Link to a note' });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Roadmap 2027', 'Create note “Road”']),
    );
    fireEvent.keyDown(body, { key: 'Enter' });
    expect(codec.toMarkdown(editor.getJSON())).toBe(`${linkTo(ROADMAP, 'Roadmap 2027')}\n`);
  });

  it('lists notes whose title matches before those that only mention it', async () => {
    const { editor } = setup('', {
      // Newest first, as the search returns them: Ideas only mentions "road" in its body.
      'notes:list': () => ok([summary(GONE, 'Ideas'), summary(ROADMAP, 'Roadmap 2027')]),
    });
    await type(editor, '[[road');
    const list = await screen.findByRole('listbox', { name: 'Link to a note' });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Roadmap 2027', 'Ideas', 'Create note “road”']),
    );
  });

  it('creates a note beside this one and links it', async () => {
    const created: Note = { ...makeNote(''), id: NEW, title: 'New idea' };
    const { editor, body, backend } = setup('', { 'notes:create': () => ok(created) });
    await type(editor, '[[New idea');
    const list = await screen.findByRole('listbox', { name: 'Link to a note' });
    await waitFor(() =>
      expect(within(list).getByRole('option', { name: 'Create note “New idea”' })).toBeVisible(),
    );
    fireEvent.keyDown(body, { key: 'ArrowDown' });
    fireEvent.keyDown(body, { key: 'Enter' });
    await waitFor(() =>
      expect(codec.toMarkdown(editor.getJSON())).toBe(`${linkTo(NEW, 'New idea')}\n`),
    );
    expect(backend.callsTo('notes:create')).toEqual([
      { title: 'New idea', projectId: 'p1', folderId: 'f1' },
    ]);
  });
});

describe('backlinks panel', () => {
  it('lists linking notes and mentions, and links a mention on request', async () => {
    const { backend } = setup('Body\n', {
      'notes:backlinks': () =>
        ok({
          linked: [
            {
              noteId: ROADMAP,
              title: 'Roadmap 2027',
              snippet: 'See Weekly for status',
              archived: false,
              updatedAt: NOW,
            },
          ],
          unlinked: [
            {
              noteId: GONE,
              title: 'Ideas',
              snippet: 'the weekly sync',
              archived: false,
              updatedAt: NOW,
            },
          ],
        }),
      'notes:linkMention': () => ok(makeNote('')),
    });
    const panel = await screen.findByRole('region', { name: /Linked from/ });
    expect(await within(panel).findByText('See Weekly for status')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: /Roadmap 2027/ }));
    expect(screen.getByTestId('route')).toHaveTextContent(ROADMAP);
    await userEvent.click(
      within(panel).getByRole('button', { name: 'Link the mention in “Ideas”' }),
    );
    expect(backend.callsTo('notes:linkMention')).toEqual([{ sourceId: GONE, targetId: SELF }]);
    expect(await screen.findByText('Linked the mention in “Ideas”.')).toBeInTheDocument();
  });
});

describe('links in the Markdown preview', () => {
  it('show current titles, open the note, and mark missing ones', async () => {
    setup(
      `${linkTo(ROADMAP, 'Roadmap')} and ${linkTo(GONE, 'Old')}\n\n| image | ![x](https://e.com/x.png) |\n`,
    );
    // The image keeps this note in Markdown mode (preview shown first).
    const link = await screen.findByRole('button', { name: 'Note: Roadmap 2027' });
    const missing = await screen.findByRole('button', { name: 'Note: Old (not found)' });
    expect(missing).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(link);
    expect(screen.getByTestId('route')).toHaveTextContent(ROADMAP);
  });
});
