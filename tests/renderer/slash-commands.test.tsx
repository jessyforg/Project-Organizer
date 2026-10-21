import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor, Extensions, JSONContent } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../../src/renderer/features/editor/DocumentEditor';
import {
  documentExtensions,
  noteExtensions,
} from '../../src/renderer/features/editor/editor-config';
import {
  filterSlashCommands,
  SLASH_COMMANDS,
} from '../../src/renderer/features/editor/slash-commands';

const EMPTY: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function setup({
  extensions = noteExtensions(),
  content = EMPTY,
  slashCommands,
}: { extensions?: Extensions; content?: JSONContent; slashCommands?: boolean } = {}) {
  const onChange = vi.fn<(content: JSONContent) => void>();
  let editor: Editor | null = null;
  render(
    <DocumentEditor
      initialContent={content}
      extensions={extensions}
      onChange={onChange}
      onReady={(e) => (editor = e)}
      {...(slashCommands === undefined ? {} : { slashCommands })}
    />,
  );
  const body = screen.getByRole('textbox', { name: 'Document body' });
  // Tiptap's focus command waits for the next frame; focus now so the first key press lands.
  act(() => {
    editor!.commands.setTextSelection(editor!.state.doc.content.size);
    editor!.view.focus();
  });
  expect(body).toHaveFocus();
  /** Types text at the cursor, as the editor sees typing. */
  // The plugin loads its items asynchronously, so the menu appears a moment after typing.
  const type = (text: string) =>
    act(async () => {
      editor!.commands.insertContent(text);
      await Promise.resolve();
    });
  const menu = () => screen.queryByRole('listbox', { name: 'Insert a block' });
  const options = () => within(menu()!).getAllByRole('option');
  return { body, type, menu, options, getEditor: () => editor!, onChange };
}

describe('filterSlashCommands', () => {
  const labels = (query: string) => filterSlashCommands(SLASH_COMMANDS, query).map((c) => c.label);

  it('lists every command for an empty query', () => {
    expect(labels('')).toHaveLength(SLASH_COMMANDS.length);
  });

  it('matches labels and keywords, ignoring case', () => {
    expect(labels('H2')).toEqual(['Heading 2']);
    expect(labels('todo')).toEqual(['Checklist']);
    expect(labels('hr')).toEqual(['Divider']);
  });

  it('puts commands whose label starts with the query first', () => {
    expect(labels('h').slice(0, 3)).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
    expect(labels('list')).toEqual(['Bulleted list', 'Numbered list', 'Checklist']);
  });

  it('finds nothing for unknown words', () => {
    expect(labels('zebra')).toEqual([]);
  });
});

describe('slash command menu', () => {
  it('opens when "/" is typed on an empty line, with the first command highlighted', async () => {
    const { body, type, menu, options } = setup();
    expect(menu()).toBeNull();
    await type('/');
    expect(menu()).toBeInTheDocument();
    expect(options().map((o) => o.textContent)).toContain('Heading 1Large section heading');
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    expect(body).toHaveAttribute('aria-controls', menu()!.id);
    expect(body).toHaveAttribute('aria-activedescendant', options()[0]!.id);
  });

  it('runs a command typed and chosen at once, before the plugin has finished loading', () => {
    const { body, getEditor } = setup();
    // No waiting between typing and Enter (the menu is not even positioned yet).
    act(() => void getEditor().commands.insertContent('/h3'));
    expect(screen.queryByRole('status', { hidden: true })).toBeNull();
    fireEvent.keyDown(body, { key: 'Enter' });
    expect(getEditor().isActive('heading', { level: 3 })).toBe(true);
    expect(getEditor().getText()).not.toContain('/h3');
  });

  it('filters as you type and runs the highlighted command with Enter', async () => {
    const { type, menu, options, getEditor } = setup();
    await type('/h2');
    expect(options().map((o) => o.textContent)).toEqual(['Heading 2Medium section heading']);
    await userEvent.keyboard('{Enter}');
    expect(menu()).toBeNull();
    await type('Plan');
    // (The editor keeps an empty paragraph after a final heading, so there is room to type.)
    expect(getEditor().getJSON().content?.[0]).toEqual({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Plan' }],
    });
  });

  it('moves the highlight with the arrow keys, wrapping at the ends, and runs it with Tab', async () => {
    const { body, type, options, getEditor } = setup();
    await type('/list');
    await userEvent.keyboard('{ArrowDown}');
    expect(options()[1]).toHaveAttribute('aria-selected', 'true');
    expect(body).toHaveAttribute('aria-activedescendant', options()[1]!.id);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{ArrowUp}');
    expect(options()[2]).toHaveTextContent('Checklist');
    expect(options()[2]).toHaveAttribute('aria-selected', 'true');
    await userEvent.keyboard('{Tab}');
    expect(getEditor().isActive('taskList')).toBe(true);
    expect(getEditor().getText()).not.toContain('/');
  });

  it('runs a command when it is clicked, keeping the text before it', async () => {
    const { type, options, getEditor } = setup({
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] }],
      },
    });
    await type(' /div');
    await userEvent.click(options()[0]!);
    expect(
      getEditor()
        .getJSON()
        .content?.map((n) => n.type),
    ).toContain('horizontalRule');
    expect(getEditor().getText()).toContain('Intro');
    expect(getEditor().getText()).not.toContain('/div');
  });

  it('closes on Escape, keeps the typed text, and does not pass Escape on to the page', async () => {
    const { body, type, menu, getEditor } = setup();
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    await type('/quo');
    await userEvent.keyboard('{Escape}');
    window.removeEventListener('keydown', onWindowKey);
    expect(menu()).toBeNull();
    expect(onWindowKey).not.toHaveBeenCalled();
    expect(getEditor().getText()).toBe('/quo');
    expect(body).not.toHaveAttribute('aria-controls');
    expect(body).not.toHaveAttribute('aria-activedescendant');
  });

  it('says when nothing matches, and Enter then starts a new line as usual', async () => {
    const { type, menu, getEditor } = setup();
    await type('/zebra');
    expect(menu()).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('No blocks match “zebra”');
    await userEvent.keyboard('{Enter}');
    expect(getEditor().getJSON().content).toHaveLength(2);
  });

  it('stays closed for a "/" inside a word or a code block', async () => {
    const { type, menu, getEditor } = setup();
    await type('and/or');
    expect(menu()).toBeNull();
    act(() => void getEditor().chain().setCodeBlock().run());
    await type(' /');
    expect(menu()).toBeNull();
  });

  it('leaves out commands the editor cannot show', async () => {
    const { type, options } = setup({ extensions: documentExtensions() });
    await type('/');
    const labels = options().map((o) => o.querySelector('.slash-menu__label')?.textContent);
    expect(labels).toContain('Quote');
    expect(labels).not.toContain('Checklist');
    expect(labels).not.toContain('Divider');
  });

  it('can be turned off', async () => {
    const { type, menu } = setup({ slashCommands: false });
    await type('/');
    expect(menu()).toBeNull();
  });

  it('keeps a list when the same list is chosen again', async () => {
    const { type, getEditor } = setup();
    await type('/bul');
    await userEvent.keyboard('{Enter}');
    expect(getEditor().isActive('bulletList')).toBe(true);
    // Choosing the same list again keeps it rather than toggling it off.
    await type('/bul');
    await userEvent.keyboard('{Enter}');
    expect(getEditor().isActive('bulletList')).toBe(true);
  });
});
