import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import type { Note } from '../../src/shared/domain';
import { FocusModeProvider, useFocusMode } from '../../src/renderer/app/focus';
import { NoteEditor } from '../../src/renderer/features/notes/NoteEditor';
import { outlineFromMarkdown } from '../../src/renderer/features/notes/outline';
import { installApi, ok, renderWithApp } from './harness';

const NOW = '2026-03-10T09:00:00.000Z';
const BODY = '# Plan\n\nIntro\n\n## Goals\n\nShip it\n\n### Risks\n\n#### Too deep\n\n## Dates\n';

function makeNote(body = BODY): Note {
  return {
    id: '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
    projectId: 'p1',
    folderId: null,
    archivedAt: null,
    title: 'Plan',
    body,
    tagIds: [],
    createdAt: NOW,
    updatedAt: NOW,
    icon: null,
    cover: null,
    favourite: false,
  };
}

function FocusToggle() {
  const { focused, setFocused } = useFocusMode();
  return (
    <button type="button" onClick={() => setFocused(!focused)}>
      Toggle focus
    </button>
  );
}

function setup({ outline = false, body = BODY }: { outline?: boolean; body?: string } = {}) {
  const backend = installApi({
    'settings:get': () =>
      ok({ theme: 'system', accent: 'blue', surface: 'cool', noteOutline: outline }),
    'settings:update': (patch) =>
      ok({ theme: 'system', accent: 'blue', surface: 'cool', noteOutline: outline, ...patch }),
  });
  renderWithApp(
    <FocusModeProvider>
      <FocusToggle />
      <NoteEditor note={makeNote(body)} />
    </FocusModeProvider>,
  );
  const panel = () => screen.queryByRole('navigation', { name: 'Outline' });
  const entries = () =>
    within(panel()!)
      .queryAllByRole('button')
      .map((b) => b.textContent);
  const toggle = () => screen.getByRole('button', { name: 'Outline' });
  return { backend, panel, entries, toggle };
}

describe('outlineFromMarkdown', () => {
  it('lists headings 1–3 in order with their offsets, ignoring code and deeper levels', () => {
    const md =
      '# One\n\n```\n# not a heading\n```\n\n## Two *em* `code`\n\n#### Four\n\n### Three\n';
    expect(outlineFromMarkdown(md)).toEqual([
      { level: 1, text: 'One', at: 0 },
      { level: 2, text: 'Two em code', at: md.indexOf('## Two') },
      { level: 3, text: 'Three', at: md.indexOf('### Three') },
    ]);
  });

  it('gives empty headings a visible name', () => {
    expect(outlineFromMarkdown('##\n')).toEqual([{ level: 2, text: 'Untitled heading', at: 0 }]);
  });
});

describe('note outline', () => {
  it('is off by default; the Outline button shows it and remembers the choice', async () => {
    const { panel, entries, toggle, backend } = setup();
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-pressed', 'false'));
    expect(panel()).toBeNull();
    await userEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(entries()).toEqual(['Plan', 'Goals', 'Risks', 'Dates']);
    expect(backend.callsTo('settings:update')).toEqual([{ noteOutline: true }]);
  });

  it('opens already shown when the profile has it on, with levels for indentation', async () => {
    const { panel } = setup({ outline: true });
    const nav = await waitFor(() => {
      expect(panel()).not.toBeNull();
      return panel()!;
    });
    const items = within(nav).getAllByRole('button');
    expect(items.map((b) => b.getAttribute('data-level'))).toEqual(['1', '2', '3', '2']);
  });

  it('jumps to a heading in the visual editor and marks it as the current one', async () => {
    const { panel } = setup({ outline: true });
    await waitFor(() => expect(panel()).not.toBeNull());
    const risks = within(panel()!).getByRole('button', { name: 'Risks' });
    await userEvent.click(risks);
    const body = screen.getByRole('textbox', { name: 'Note text' });
    expect(body).toHaveFocus();
    // The cursor is now in the "Risks" heading.
    expect(window.getSelection()?.anchorNode?.textContent).toBe('Risks');
    await waitFor(() => expect(risks).toHaveAttribute('aria-current', 'location'));
    expect(within(panel()!).getByRole('button', { name: 'Goals' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('follows the text as headings are added', async () => {
    const { panel, entries } = setup({ outline: true, body: 'Just text\n' });
    await waitFor(() => expect(panel()).not.toBeNull());
    expect(within(panel()!).getByText('Add a heading to build an outline.')).toBeInTheDocument();
    // jsdom cannot type into contenteditable; edit through the editor (Tiptap puts it on the
    // element). The end-to-end test types for real.
    const body = screen.getByRole('textbox', { name: 'Note text' });
    const editor = (body as unknown as { editor: Editor }).editor;
    act(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size, {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'New part' }],
      });
    });
    await waitFor(() => expect(entries()).toEqual(['New part']));
  });

  it('in Markdown writing, puts the cursor at the heading', async () => {
    const { panel } = setup({ outline: true });
    await waitFor(() => expect(panel()).not.toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    await userEvent.click(screen.getByRole('button', { name: 'Write' }));
    await userEvent.click(within(panel()!).getByRole('button', { name: 'Dates' }));
    const field = screen.getByLabelText<HTMLTextAreaElement>('Note text (Markdown)');
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(BODY.indexOf('## Dates'));
  });

  it('in the Markdown preview, moves focus to the heading', async () => {
    const { panel } = setup({ outline: true });
    await waitFor(() => expect(panel()).not.toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Markdown' }));
    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await userEvent.click(within(panel()!).getByRole('button', { name: 'Goals' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Goals' })).toHaveFocus();
  });

  it('is hidden in focus mode, where the button shows it without changing the setting', async () => {
    const { panel, toggle, backend } = setup({ outline: true });
    await waitFor(() => expect(panel()).not.toBeNull());
    await userEvent.click(screen.getByRole('button', { name: 'Toggle focus' }));
    expect(panel()).toBeNull();
    await userEvent.click(toggle());
    expect(panel()).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Toggle focus' }));
    expect(panel()).not.toBeNull();
    await act(() => Promise.resolve());
    expect(backend.callsTo('settings:update')).toEqual([]);
  });
});
