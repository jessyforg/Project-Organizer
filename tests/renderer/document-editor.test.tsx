import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor, JSONContent } from '@tiptap/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DocumentEditor } from '../../src/renderer/features/editor/DocumentEditor';

const INITIAL: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
};

function Harness({
  onChange,
  onReady,
}: {
  onChange?: (content: JSONContent) => void;
  onReady?: (editor: Editor) => void;
}) {
  const [title, setTitle] = useState('Draft');
  return (
    <DocumentEditor
      title={title}
      onTitleChange={setTitle}
      initialContent={INITIAL}
      onChange={onChange}
      onReady={onReady}
    />
  );
}

function setup() {
  const onChange = vi.fn<(content: JSONContent) => void>();
  let editor: Editor | null = null;
  const view = render(<Harness onChange={onChange} onReady={(e) => (editor = e)} />);
  const body = screen.getByRole('textbox', { name: 'Document body' });
  const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
  /** Selects all body text, as a user would before applying a format. */
  const selectAll = () => act(() => void editor!.commands.selectAll());
  /** Puts the cursor inside the first block's text. */
  const cursorInFirstBlock = () => act(() => void editor!.commands.setTextSelection(2));
  const lastChange = () => onChange.mock.calls.at(-1)?.[0];
  return {
    view,
    body,
    toolbar,
    selectAll,
    cursorInFirstBlock,
    lastChange,
    onChange,
    getEditor: () => editor!,
  };
}

describe('DocumentEditor', () => {
  it('shows the initial content and a separate title field', () => {
    const { body } = setup();
    expect(body).toHaveTextContent('Hello world');
    expect(screen.getByRole('textbox', { name: 'Document title' })).toHaveValue('Draft');
    expect(body).not.toContainElement(screen.getByRole('textbox', { name: 'Document title' }));
  });

  it('applies bold from the toolbar and reports structured JSON', async () => {
    const { toolbar, selectAll, lastChange } = setup();
    selectAll();
    const bold = within(toolbar).getByRole('button', { name: /^Bold/ });
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(bold);
    expect(bold).toHaveAttribute('aria-pressed', 'true');
    expect(lastChange()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world', marks: [{ type: 'bold' }] }],
        },
      ],
    });
  });

  it('turns a paragraph into a heading, a list, a quote, and a code block', async () => {
    const { toolbar, cursorInFirstBlock, lastChange } = setup();
    const press = async (name: RegExp) =>
      userEvent.click(within(toolbar).getByRole('button', { name }));
    const firstBlock = () => lastChange()?.content?.[0];

    cursorInFirstBlock();
    await press(/^Heading 2/);
    expect(firstBlock()).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    await press(/^Heading 2/);
    expect(firstBlock()).toMatchObject({ type: 'paragraph' });

    await press(/^Bulleted list/);
    expect(firstBlock()).toMatchObject({ type: 'bulletList' });
    await press(/^Numbered list/);
    expect(firstBlock()).toMatchObject({ type: 'orderedList' });
    await press(/^Numbered list/);

    await press(/^Quote/);
    expect(firstBlock()).toMatchObject({ type: 'blockquote' });
    await press(/^Quote/);

    await press(/^Code block/);
    expect(firstBlock()).toMatchObject({ type: 'codeBlock' });
  });

  it('is one tab stop, with arrow keys moving between buttons', async () => {
    const { toolbar } = setup();
    const buttons = within(toolbar).getAllByRole('button');
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);

    act(() => buttons[0]!.focus());
    await userEvent.keyboard('{ArrowRight}');
    expect(buttons[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(buttons.at(-1)).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(buttons[0]).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(buttons.at(-1)).toHaveFocus();
  });

  it('marks undo unavailable until there is something to undo', async () => {
    const { toolbar, selectAll } = setup();
    const undo = within(toolbar).getByRole('button', { name: /^Undo/ });
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    selectAll();
    await userEvent.click(within(toolbar).getByRole('button', { name: /^Italic/ }));
    expect(undo).toHaveAttribute('aria-disabled', 'false');
    await userEvent.click(undo);
    expect(undo).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the title outside the body and reports title edits', async () => {
    setup();
    const title = screen.getByRole('textbox', { name: 'Document title' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Release notes');
    expect(title).toHaveValue('Release notes');
  });

  it('destroys the editor when it unmounts', async () => {
    const { view, getEditor } = setup();
    const editor = getEditor();
    expect(editor.isDestroyed).toBe(false);
    view.unmount();
    // Tiptap waits a tick before destroying, so a Strict Mode remount can reuse the editor.
    await vi.waitFor(() => expect(editor.isDestroyed).toBe(true));
  });
});
