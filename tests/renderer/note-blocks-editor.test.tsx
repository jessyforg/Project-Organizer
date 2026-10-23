import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor, JSONContent } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import { DocumentEditor } from '../../src/renderer/features/editor/DocumentEditor';
import { noteExtensions } from '../../src/renderer/features/editor/editor-config';
import { createMarkdownCodec } from '../../src/renderer/features/editor/markdown';

const codec = createMarkdownCodec(noteExtensions());
/** The first table in the editor's document. */
const tableOf = (editor: Editor): JSONContent | undefined =>
  (editor.getJSON().content as JSONContent[] | undefined)?.find((n) => n.type === 'table');
const EMPTY: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function setup(content: JSONContent = EMPTY) {
  let editor: Editor | null = null;
  render(
    <DocumentEditor
      initialContent={content}
      extensions={noteExtensions()}
      onReady={(e) => (editor = e)}
    />,
  );
  const body = screen.getByRole('textbox', { name: 'Document body' });
  const get = () => editor!;
  act(() => {
    get().commands.setTextSelection(get().state.doc.content.size - 1);
    get().view.focus();
  });
  const type = (text: string) =>
    act(async () => {
      get().commands.insertContent(text);
      await Promise.resolve();
    });
  /** Runs a slash command the way a user does: type it, then Enter. */
  const slash = async (query: string) => {
    await type(`/${query}`);
    fireEvent.keyDown(body, { key: 'Enter' });
  };
  const markdown = () => codec.toMarkdown(get().getJSON());
  return { body, get, type, slash, markdown };
}

describe('callout blocks', () => {
  it('are inserted from the slash menu and saved as GitHub alerts', async () => {
    const { slash, type, markdown, get } = setup();
    await slash('callout');
    expect(get().isActive('callout', { kind: 'note' })).toBe(true);
    await type('Remember this');
    expect(markdown()).toBe('> [!NOTE]\n> Remember this\n');
    expect(screen.getByRole('note', { name: 'Note' })).toHaveTextContent('Remember this');
  });

  it('change kind, rather than nesting, when chosen inside a callout', async () => {
    const { slash, type, markdown, body } = setup();
    await slash('tip');
    await type('Hint');
    // On a new line inside the callout ("/" right after a word does not open the menu).
    fireEvent.keyDown(body, { key: 'Enter' });
    await slash('warning');
    expect(markdown()).toBe('> [!WARNING]\n> Hint\n');
  });
});

describe('toggle blocks', () => {
  it('start open with the cursor in the title; Enter moves into the body', async () => {
    const { slash, type, markdown, body } = setup();
    await slash('toggle');
    await type('More');
    fireEvent.keyDown(body, { key: 'Enter' });
    await type('Hidden part');
    expect(markdown()).toBe(
      '<details open>\n<summary>More</summary>\n\nHidden part\n\n</details>\n',
    );
  });

  it('open and close with their button or Ctrl+Enter, and the state is saved', async () => {
    const { slash, type, markdown, body } = setup();
    await slash('toggle');
    await type('More');
    const button = screen.getByRole('button', { name: 'Collapse More' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(button);
    expect(screen.getByRole('button', { name: 'Expand More' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(markdown()).toMatch(/^<details>\n<summary>More<\/summary>/);
    fireEvent.keyDown(body, { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('button', { name: 'Collapse More' })).toBeInTheDocument();
  });
});

describe('leaving a block', () => {
  it.each(['toggle', 'callout'])(
    'Enter on an empty last line leaves a %s, so the next block follows it',
    async (block) => {
      const { slash, type, body, get, markdown } = setup();
      await slash(block);
      await type('Title');
      fireEvent.keyDown(body, { key: 'Enter' });
      if (block === 'toggle') await type('Inside');
      fireEvent.keyDown(body, { key: 'Enter' });
      fireEvent.keyDown(body, { key: 'Enter' });
      expect(get().state.selection.$from.depth).toBe(1);
      await type('After');
      expect(markdown().trimEnd().endsWith('\n\nAfter')).toBe(true);
    },
  );

  it('writes no stray blank lines around a table inside a toggle or callout', async () => {
    const { slash, type, body, markdown } = setup();
    await slash('toggle');
    await type('T');
    fireEvent.keyDown(body, { key: 'Enter' });
    await slash('table');
    expect(markdown()).not.toMatch(/\n\n\n/);
  });
});

describe('table blocks', () => {
  it('insert a 3×3 table with a header row and show the table toolbar', async () => {
    const { slash, get } = setup();
    await slash('table');
    const table = tableOf(get());
    expect(table?.content).toHaveLength(3);
    expect(table?.content?.[0]?.content?.map((c) => c.type)).toEqual([
      'tableHeader',
      'tableHeader',
      'tableHeader',
    ]);
    const toolbar = await screen.findByRole('toolbar', { name: 'Table' });
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Add row above',
      'Add row below',
      'Add column left',
      'Add column right',
      'Delete row',
      'Delete column',
      'Delete table',
    ]);
  });

  it('keep the header row: it cannot be deleted or have rows added above it', async () => {
    const { slash } = setup();
    await slash('table');
    const toolbar = await screen.findByRole('toolbar', { name: 'Table' });
    expect(within(toolbar).getByRole('button', { name: 'Delete row' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(within(toolbar).getByRole('button', { name: 'Add row above' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('add rows and columns from the toolbar and save as a GitHub table', async () => {
    const { slash, type, get, markdown } = setup();
    await slash('table');
    await type('Name');
    const toolbar = await screen.findByRole('toolbar', { name: 'Table' });
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Add row below' }));
    await userEvent.click(within(toolbar).getByRole('button', { name: 'Add column right' }));
    const table = tableOf(get());
    expect(table?.content).toHaveLength(4);
    expect(table?.content?.[0]?.content).toHaveLength(4);
    expect(markdown().split('\n')[0]).toMatch(/^\| Name +\| +\| +\| +\|$/);
  });

  it('keep each cell to one line: Enter and Shift+Enter add nothing', async () => {
    const { slash, type, get, body } = setup();
    await slash('table');
    await type('One');
    const before = JSON.stringify(get().getJSON());
    fireEvent.keyDown(body, { key: 'Enter' });
    fireEvent.keyDown(body, { key: 'Enter', shiftKey: true });
    expect(JSON.stringify(get().getJSON())).toBe(before);
  });
});

describe('Turn into', () => {
  it('offers callouts but not toggles or tables (which are inserted, not converted)', async () => {
    const { get } = setup({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello brave world' }] }],
    });
    act(() => {
      get().commands.setTextSelection({ from: 7, to: 12 });
      get().view.focus();
    });
    const bubble = await screen.findByRole('toolbar', { name: 'Selection formatting' });
    await userEvent.click(within(bubble).getByRole('button', { name: 'Turn into: Text' }));
    const items = within(screen.getByRole('menu', { name: 'Turn into' }))
      .getAllByRole('menuitem')
      .map((i) => i.textContent);
    expect(items).toEqual(expect.arrayContaining(['Callout', 'Tip callout', 'Warning callout']));
    expect(items).not.toContain('Toggle');
    expect(items).not.toContain('Table');
  });
});
