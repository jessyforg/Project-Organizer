import { Extension, type Editor, type Range } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { menuRender, type SuggestionMenuOptions } from './suggestion-types';
import { promptForFiles } from './attachments';
import { HEADING_LEVELS } from './editor-config';

/**
 * Slash commands (ADR-0016): typing "/" at the start of a line or after a space opens a list of
 * blocks to insert; more letters filter it. The list itself is drawn by SlashMenu.tsx.
 */
export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  /** Other words that find the command, such as "h1" or "todo". */
  keywords: string[];
  /** The extension the command needs; editors without it leave the command out. */
  extension: string;
  /** Turns the current block into this one; `range` is the typed "/query", removed first. */
  run: (editor: Editor, range: Range) => void;
  /** Whether the block at the cursor is already this kind (shown by the formatting bubble). */
  isActive: (editor: Editor) => boolean;
  /** Inserts something new rather than turning the block into it, so "Turn into" leaves it out. */
  insertOnly?: boolean;
}

const start = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

/** Runs a list toggle only when the block is not already that list (a toggle would undo it). */
const intoList =
  (type: string, toggle: (chain: ReturnType<typeof start>) => ReturnType<typeof start>) =>
  (editor: Editor, range: Range) => {
    const chain = start(editor, range);
    (editor.isActive(type) ? chain : toggle(chain)).run();
  };

const CALLOUTS = [
  {
    kind: 'note',
    label: 'Callout',
    description: 'A highlighted note',
    keywords: ['note', 'info', 'alert', 'admonition', 'callout'],
  },
  {
    kind: 'tip',
    label: 'Tip callout',
    description: 'A helpful hint',
    keywords: ['tip', 'hint', 'success', 'callout'],
  },
  {
    kind: 'warning',
    label: 'Warning callout',
    description: 'Something to watch out for',
    keywords: ['warning', 'caution', 'danger', 'alert', 'callout'],
  },
] as const;

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'paragraph',
    label: 'Text',
    description: 'Plain paragraph',
    keywords: ['paragraph', 'plain', 'normal'],
    extension: 'paragraph',
    run: (editor, range) => start(editor, range).setParagraph().run(),
    // Text is what a block is when it is none of the others (a paragraph inside a list is
    // still a list item).
    isActive: (editor) =>
      editor.isActive('paragraph') &&
      !['bulletList', 'orderedList', 'taskList', 'blockquote'].some((t) => editor.isActive(t)),
  },
  ...HEADING_LEVELS.map((level): SlashCommand => ({
    id: `heading${level}`,
    label: `Heading ${level}`,
    description: ['Large section heading', 'Medium section heading', 'Small section heading'][
      level - 1
    ]!,
    keywords: [`h${level}`, 'heading', 'title'],
    extension: 'heading',
    run: (editor, range) => start(editor, range).setHeading({ level }).run(),
    isActive: (editor) => editor.isActive('heading', { level }),
  })),
  {
    id: 'bulletList',
    label: 'Bulleted list',
    description: 'A simple list with bullets',
    keywords: ['ul', 'bullet', 'unordered', 'list'],
    extension: 'bulletList',
    isActive: (editor) => editor.isActive('bulletList'),
    run: intoList('bulletList', (chain) => chain.toggleBulletList()),
  },
  {
    id: 'orderedList',
    label: 'Numbered list',
    description: 'A list with numbers',
    keywords: ['ol', 'ordered', 'number', 'list'],
    extension: 'orderedList',
    isActive: (editor) => editor.isActive('orderedList'),
    run: intoList('orderedList', (chain) => chain.toggleOrderedList()),
  },
  {
    id: 'taskList',
    label: 'Checklist',
    description: 'Items to tick off',
    keywords: ['todo', 'task', 'checkbox', 'check', 'list'],
    extension: 'taskList',
    isActive: (editor) => editor.isActive('taskList'),
    run: intoList('taskList', (chain) => chain.toggleTaskList()),
  },
  {
    id: 'blockquote',
    label: 'Quote',
    description: 'Set a passage apart',
    keywords: ['blockquote', 'citation'],
    extension: 'blockquote',
    run: (editor, range) => start(editor, range).setBlockquote().run(),
    isActive: (editor) => editor.isActive('blockquote'),
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    description: 'Code in a fixed-width font',
    keywords: ['code', 'pre', 'snippet'],
    extension: 'codeBlock',
    run: (editor, range) => start(editor, range).setCodeBlock().run(),
    isActive: (editor) => editor.isActive('codeBlock'),
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'A line between sections',
    keywords: ['hr', 'horizontal', 'rule', 'line', 'separator'],
    extension: 'horizontalRule',
    run: (editor, range) => start(editor, range).setHorizontalRule().run(),
    isActive: () => false,
    insertOnly: true,
  },
  ...CALLOUTS.map(({ kind, label, description, keywords }): SlashCommand => ({
    id: `callout-${kind}`,
    label,
    description,
    keywords: [...keywords],
    extension: 'callout',
    // Inside a callout, change its kind; elsewhere, wrap the block in a new one.
    run: (editor, range) => {
      const chain = start(editor, range);
      (editor.isActive('callout')
        ? chain.updateAttributes('callout', { kind })
        : chain.wrapIn('callout', { kind })
      ).run();
    },
    isActive: (editor) => editor.isActive('callout', { kind }),
  })),
  {
    id: 'toggle',
    label: 'Toggle',
    description: 'Details hidden until opened',
    keywords: ['collapse', 'collapsible', 'details', 'accordion', 'fold'],
    extension: 'toggle',
    run: (editor, range) => {
      const blockStart = editor.state.doc.resolve(range.from).before();
      start(editor, range)
        .insertContent({
          type: 'toggle',
          attrs: { open: true },
          content: [{ type: 'toggleSummary' }, { type: 'paragraph' }],
        })
        .run();
      // Put the cursor in the new toggle's title.
      let summary: number | null = null;
      editor.state.doc.nodesBetween(blockStart, editor.state.doc.content.size, (node, pos) => {
        if (summary !== null) return false;
        if (node.type.name === 'toggleSummary') summary = pos + 1;
        return true;
      });
      if (summary !== null) editor.commands.setTextSelection(summary);
    },
    isActive: (editor) => editor.isActive('toggle'),
    insertOnly: true,
  },
  {
    id: 'image',
    label: 'Image',
    description: 'A picture from your computer',
    keywords: ['picture', 'photo', 'png', 'jpg', 'screenshot'],
    extension: 'attachmentInput',
    run: (editor, range) => promptForFiles(editor, range.from, range.to, 'image'),
    isActive: () => false,
    insertOnly: true,
  },
  {
    id: 'file',
    label: 'File',
    description: 'Attach any file to the note',
    keywords: ['attachment', 'attach', 'upload', 'pdf', 'document'],
    extension: 'attachmentInput',
    run: (editor, range) => promptForFiles(editor, range.from, range.to, 'file'),
    isActive: () => false,
    insertOnly: true,
  },
  {
    id: 'table',
    label: 'Table',
    description: 'Rows and columns with a header',
    keywords: ['grid', 'columns', 'rows', 'spreadsheet'],
    extension: 'table',
    run: (editor, range) =>
      start(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    isActive: (editor) => editor.isActive('table'),
    insertOnly: true,
  },
];

/** The commands this editor supports. */
export function slashCommandsFor(editor: Editor): SlashCommand[] {
  const loaded = new Set(editor.extensionManager.extensions.map((e) => e.name));
  return SLASH_COMMANDS.filter((command) => loaded.has(command.extension));
}

/**
 * Commands whose label or keywords contain the query, ignoring case. Those whose label starts
 * with it come first, so "/h" lists the headings before Divider (keyword "hr").
 */
export function filterSlashCommands(commands: SlashCommand[], query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  const matches = commands.filter((c) =>
    [c.label, ...c.keywords].some((word) => word.toLowerCase().includes(q)),
  );
  const leading = (c: SlashCommand) => (c.label.toLowerCase().startsWith(q) ? 0 : 1);
  return matches.sort((a, b) => leading(a) - leading(b));
}

export const slashCommandsKey = new PluginKey('slashCommands');

export const SlashCommands = Extension.create<SuggestionMenuOptions<SlashCommand>>({
  name: 'slashCommands',

  addOptions() {
    return { onState: () => {}, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const itemsFor = (editor: Editor, query: string) =>
      filterSlashCommands(slashCommandsFor(editor), query);
    return [
      Suggestion<SlashCommand, SlashCommand>({
        editor: this.editor,
        pluginKey: slashCommandsKey,
        char: '/',
        decorationClass: 'slash-query',
        // A "/" typed inside code, or in a read-only note, is just text.
        allow: ({ editor, state, range }) =>
          editor.isEditable && !state.doc.resolve(range.from).parent.type.spec.code,
        items: ({ editor, query }) => itemsFor(editor, query),
        command: ({ editor, range, props }) => props.run(editor, range),
        // The plugin first reports an empty "loading" list, then the items a moment later. Ours
        // need no waiting, so they are listed at once: no flash of "no results", and an Enter
        // pressed straight away still runs a command.
        render: menuRender(this.options, (props) => itemsFor(props.editor, props.query)),
      }),
    ];
  },
});
