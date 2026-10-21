import { Extension, type Editor, type Range } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
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
}

const start = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

/** Runs a list toggle only when the block is not already that list (a toggle would undo it). */
const intoList =
  (type: string, toggle: (chain: ReturnType<typeof start>) => ReturnType<typeof start>) =>
  (editor: Editor, range: Range) => {
    const chain = start(editor, range);
    (editor.isActive(type) ? chain : toggle(chain)).run();
  };

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'paragraph',
    label: 'Text',
    description: 'Plain paragraph',
    keywords: ['paragraph', 'plain', 'normal'],
    extension: 'paragraph',
    run: (editor, range) => start(editor, range).setParagraph().run(),
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
  })),
  {
    id: 'bulletList',
    label: 'Bulleted list',
    description: 'A simple list with bullets',
    keywords: ['ul', 'bullet', 'unordered', 'list'],
    extension: 'bulletList',
    run: intoList('bulletList', (chain) => chain.toggleBulletList()),
  },
  {
    id: 'orderedList',
    label: 'Numbered list',
    description: 'A list with numbers',
    keywords: ['ol', 'ordered', 'number', 'list'],
    extension: 'orderedList',
    run: intoList('orderedList', (chain) => chain.toggleOrderedList()),
  },
  {
    id: 'taskList',
    label: 'Checklist',
    description: 'Items to tick off',
    keywords: ['todo', 'task', 'checkbox', 'check', 'list'],
    extension: 'taskList',
    run: intoList('taskList', (chain) => chain.toggleTaskList()),
  },
  {
    id: 'blockquote',
    label: 'Quote',
    description: 'Set a passage apart',
    keywords: ['blockquote', 'citation'],
    extension: 'blockquote',
    run: (editor, range) => start(editor, range).setBlockquote().run(),
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    description: 'Code in a fixed-width font',
    keywords: ['code', 'pre', 'snippet'],
    extension: 'codeBlock',
    run: (editor, range) => start(editor, range).setCodeBlock().run(),
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'A line between sections',
    keywords: ['hr', 'horizontal', 'rule', 'line', 'separator'],
    extension: 'horizontalRule',
    run: (editor, range) => start(editor, range).setHorizontalRule().run(),
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

/** What the menu needs while it is open. */
export interface SlashMenuState {
  items: SlashCommand[];
  query: string;
  choose: (command: SlashCommand) => void;
  /** Hands the popup element to the plugin, which positions it at the cursor; returns cleanup. */
  mount: SuggestionProps<SlashCommand, SlashCommand>['mount'];
}

export interface SlashCommandsOptions {
  /** Called with the menu's state when it opens or changes, and null when it closes. */
  onState: (state: SlashMenuState | null) => void;
  /** Keys pressed while the menu is open; return true when handled. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const slashCommandsKey = new PluginKey('slashCommands');

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: 'slashCommands',

  addOptions() {
    return { onState: () => {}, onKeyDown: () => false };
  },

  addProseMirrorPlugins() {
    const { onState, onKeyDown } = this.options;
    const itemsFor = (editor: Editor, query: string) =>
      filterSlashCommands(slashCommandsFor(editor), query);
    const toState = (props: SuggestionProps<SlashCommand, SlashCommand>): SlashMenuState => ({
      // The plugin first reports an empty "loading" list, then the items a moment later. Ours
      // need no waiting, so list them at once: no flash of "no results", and an Enter pressed
      // straight away still runs a command.
      items: props.loading ? itemsFor(props.editor, props.query) : props.items,
      query: props.query,
      choose: props.command,
      mount: props.mount,
    });
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
        render: () => ({
          onStart: (props) => onState(toState(props)),
          onUpdate: (props) => onState(toState(props)),
          onExit: () => onState(null),
          onKeyDown: ({ event }) => {
            // Escape closes the menu (the plugin does that); keep it from also leaving focus mode.
            if (event.key === 'Escape') event.stopPropagation();
            return onKeyDown(event);
          },
        }),
      }),
    ];
  },
});
