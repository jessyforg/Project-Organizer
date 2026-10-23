import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor, Extensions, JSONContent } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../../src/renderer/features/editor/DocumentEditor';
import {
  documentExtensions,
  noteExtensions,
} from '../../src/renderer/features/editor/editor-config';
import { createMarkdownCodec } from '../../src/renderer/features/editor/markdown';

const TEXT: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello brave world' }] }],
};
/** "brave" in TEXT: the paragraph starts at 1, so its characters are 7–11. */
const BRAVE = { from: 7, to: 12 };
const codec = createMarkdownCodec(noteExtensions());
/** Longer than the bubble's own show/hide delay, so a bubble that would appear has appeared. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 400)));

function setup({
  extensions = noteExtensions(),
  content = TEXT,
  editable,
}: { extensions?: Extensions; content?: JSONContent; editable?: boolean } = {}) {
  let editor: Editor | null = null;
  const view = render(
    <DocumentEditor
      initialContent={content}
      extensions={extensions}
      onReady={(e) => (editor = e)}
      {...(editable === undefined ? {} : { editable })}
    />,
  );
  const body = screen.getByRole('textbox', { name: 'Document body' });
  const get = () => editor!;
  /** Selects a range and focuses the text, as dragging over it would. */
  const select = (range: { from: number; to: number }) =>
    act(() => {
      get().commands.setTextSelection(range);
      get().view.focus();
    });
  const bubble = () => screen.findByRole('toolbar', { name: 'Selection formatting' });
  const markdown = () => codec.toMarkdown(get().getJSON());
  return { view, body, get, select, bubble, markdown };
}

describe('formatting bubble', () => {
  it('appears over selected text and not for a plain cursor', async () => {
    const { select, bubble } = setup();
    select({ from: 3, to: 3 });
    await settle();
    expect(screen.queryByRole('toolbar', { name: 'Selection formatting' })).toBeNull();
    select(BRAVE);
    const toolbar = await bubble();
    const names = within(toolbar)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual([
      'Turn into: Text',
      'Bold (Ctrl+B)',
      'Italic (Ctrl+I)',
      'Strikethrough (Ctrl+Shift+S)',
      'Inline code (Ctrl+E)',
      'Link',
    ]);
  });

  it.each([
    ['Bold (Ctrl+B)', 'Hello **brave** world\n'],
    ['Italic (Ctrl+I)', 'Hello *brave* world\n'],
    ['Strikethrough (Ctrl+Shift+S)', 'Hello ~~brave~~ world\n'],
    ['Inline code (Ctrl+E)', 'Hello `brave` world\n'],
  ])('%s formats the selection and saves as Markdown', async (name, expected) => {
    const { select, bubble, markdown } = setup();
    select(BRAVE);
    const button = within(await bubble()).getByRole('button', { name });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(markdown()).toBe(expected);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('turns the block into another kind, showing the current kind on its button', async () => {
    const { select, bubble, get, markdown } = setup();
    select(BRAVE);
    await userEvent.click(within(await bubble()).getByRole('button', { name: 'Turn into: Text' }));
    const menu = screen.getByRole('menu', { name: 'Turn into' });
    const items = within(menu)
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(items).toContain('Heading 2');
    expect(items).not.toContain('Divider');
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Heading 2' }));
    expect(get().isActive('heading', { level: 2 })).toBe(true);
    expect(markdown()).toBe('## Hello brave world\n');
    select(BRAVE);
    expect(
      await within(await bubble()).findByRole('button', { name: 'Turn into: Heading 2' }),
    ).toBeInTheDocument();
  });

  it('adds a web link, adding https:// when it is left out, and can remove it', async () => {
    const { select, bubble, markdown } = setup();
    select(BRAVE);
    await userEvent.click(within(await bubble()).getByRole('button', { name: 'Link' }));
    const field = screen.getByRole('textbox', { name: 'Link address' });
    expect(field).toHaveFocus();
    await userEvent.type(field, 'example.com{Enter}');
    expect(markdown()).toBe('Hello [brave](https://example.com) world\n');

    select(BRAVE);
    await userEvent.click(within(await bubble()).getByRole('button', { name: 'Edit link' }));
    expect(screen.getByRole('textbox', { name: 'Link address' })).toHaveValue(
      'https://example.com',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove link' }));
    expect(markdown()).toBe('Hello brave world\n');
  });

  it('accepts email addresses and refuses other kinds of link', async () => {
    const { select, bubble, markdown } = setup();
    select(BRAVE);
    await userEvent.click(within(await bubble()).getByRole('button', { name: 'Link' }));
    const field = screen.getByRole('textbox', { name: 'Link address' });
    await userEvent.type(field, 'javascript:alert(1){Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Use a web address (https://…) or an email address.',
    );
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(markdown()).toBe('Hello brave world\n');
    await userEvent.clear(field);
    await userEvent.type(field, 'me@example.com{Enter}');
    expect(markdown()).toBe('Hello [brave](mailto:me@example.com) world\n');
  });

  it('Escape in the link field cancels and returns to the text', async () => {
    const { select, bubble, body, markdown } = setup();
    select(BRAVE);
    await userEvent.click(within(await bubble()).getByRole('button', { name: 'Link' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Link address' }), 'example.com');
    await userEvent.keyboard('{Escape}');
    expect(body).toHaveFocus();
    expect(markdown()).toBe('Hello brave world\n');
  });

  it('Alt+F10 moves into the bubble; arrows move along it; Escape goes back to the text', async () => {
    const { select, bubble, body } = setup();
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    select(BRAVE);
    const toolbar = await bubble();
    await userEvent.keyboard('{Alt>}{F10}{/Alt}');
    expect(within(toolbar).getByRole('button', { name: 'Turn into: Text' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(within(toolbar).getByRole('button', { name: 'Bold (Ctrl+B)' })).toHaveFocus();
    onWindowKey.mockClear();
    await userEvent.keyboard('{Escape}');
    expect(body).toHaveFocus();
    // Escape stops here, so it does not also leave focus mode.
    expect(onWindowKey).not.toHaveBeenCalled();
    window.removeEventListener('keydown', onWindowKey);
  });

  it('stays away in read-only notes and inside code blocks', async () => {
    const readOnly = setup({ editable: false });
    readOnly.select(BRAVE);
    await settle();
    expect(screen.queryByRole('toolbar', { name: 'Selection formatting' })).toBeNull();
    readOnly.view.unmount();

    const code = setup({
      content: {
        type: 'doc',
        content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'const brave = 1' }] }],
      },
    });
    code.select({ from: 7, to: 12 });
    await settle();
    expect(screen.queryByRole('toolbar', { name: 'Selection formatting' })).toBeNull();
  });

  it('does not change the document when the editor re-renders (an opened note stays saved)', async () => {
    // A note ending in a list: any transaction lets the editor add a trailing paragraph,
    // which would count as an edit and mark the note unsaved.
    const content: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
            },
          ],
        },
      ],
    };
    const onEdit = vi.fn();
    // A new element each time, so React really re-renders (an identical one is skipped).
    const editor = () => (
      <DocumentEditor initialContent={content} extensions={noteExtensions()} onEdit={onEdit} />
    );
    const view = render(editor());
    view.rerender(editor());
    view.rerender(editor());
    await settle();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('leaves out what the editor cannot do', async () => {
    const { select, bubble } = setup({ extensions: documentExtensions() });
    select(BRAVE);
    const names = within(await bubble())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['Turn into: Text', 'Bold (Ctrl+B)', 'Italic (Ctrl+I)']);
  });
});
