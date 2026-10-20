import { TaskItem, TaskList } from '@tiptap/extension-list';
import type { Editor, Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

/**
 * Editor configuration for documents (ADR-0012), kept apart from the components that show it.
 * `documentExtensions` is the basic set; `noteExtensions` covers the Markdown that notes use
 * (ADR-0013).
 */
export const HEADING_LEVELS = [1, 2, 3] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];

/** Links the operating system may open; the main process checks the same list again. */
export const EXTERNAL_LINK = /^(https?:|mailto:)/i;

export function documentExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [...HEADING_LEVELS] },
      code: false,
      horizontalRule: false,
      link: false,
      strike: false,
      underline: false,
    }),
  ];
}

/**
 * Everything notes need to show their Markdown faithfully: all six heading levels, links (web
 * and mail only, as in the Markdown preview), strikethrough, inline code, dividers, and task
 * lists. Underline stays off because Markdown has no syntax for it. Anything else, such as
 * tables and images, keeps a note in Markdown mode (see markdown.ts).
 */
export function noteExtensions(): Extensions {
  return [
    StarterKit.configure({
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        isAllowedUri: (url) => EXTERNAL_LINK.test(url),
        shouldAutoLink: (url) => EXTERNAL_LINK.test(url) || !url.includes(':'),
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
  ];
}

export type FormatGroup = 'history' | 'heading' | 'inline' | 'block';

/** A toolbar action. `shortcut` is for display; Tiptap's own keymap handles the keys. */
export interface FormatAction {
  id: string;
  label: string;
  shortcut: string;
  group: FormatGroup;
  run: (editor: Editor) => void;
  /** The extension the action needs; the toolbar hides it when the editor lacks it. */
  extension?: string;
  /** Whether the format applies at the cursor; absent for actions that are not toggles. */
  isActive?: (editor: Editor) => boolean;
  isAvailable?: (editor: Editor) => boolean;
}

const heading = (level: HeadingLevel): FormatAction => ({
  id: `heading${level}`,
  label: `Heading ${level}`,
  shortcut: `Ctrl+Alt+${level}`,
  group: 'heading',
  run: (editor) => editor.chain().focus().toggleHeading({ level }).run(),
  isActive: (editor) => editor.isActive('heading', { level }),
});

export const FORMAT_ACTIONS: FormatAction[] = [
  {
    id: 'undo',
    label: 'Undo',
    shortcut: 'Ctrl+Z',
    group: 'history',
    run: (editor) => editor.chain().focus().undo().run(),
    isAvailable: (editor) => editor.can().undo(),
  },
  {
    id: 'redo',
    label: 'Redo',
    shortcut: 'Ctrl+Y',
    group: 'history',
    run: (editor) => editor.chain().focus().redo().run(),
    isAvailable: (editor) => editor.can().redo(),
  },
  ...HEADING_LEVELS.map(heading),
  {
    id: 'bold',
    label: 'Bold',
    shortcut: 'Ctrl+B',
    group: 'inline',
    run: (editor) => editor.chain().focus().toggleBold().run(),
    isActive: (editor) => editor.isActive('bold'),
  },
  {
    id: 'italic',
    label: 'Italic',
    shortcut: 'Ctrl+I',
    group: 'inline',
    run: (editor) => editor.chain().focus().toggleItalic().run(),
    isActive: (editor) => editor.isActive('italic'),
  },
  {
    id: 'strike',
    label: 'Strikethrough',
    shortcut: 'Ctrl+Shift+S',
    group: 'inline',
    extension: 'strike',
    run: (editor) => editor.chain().focus().toggleStrike().run(),
    isActive: (editor) => editor.isActive('strike'),
  },
  {
    id: 'code',
    label: 'Inline code',
    shortcut: 'Ctrl+E',
    group: 'inline',
    extension: 'code',
    run: (editor) => editor.chain().focus().toggleCode().run(),
    isActive: (editor) => editor.isActive('code'),
  },
  {
    id: 'bulletList',
    label: 'Bulleted list',
    shortcut: 'Ctrl+Shift+8',
    group: 'block',
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive('bulletList'),
  },
  {
    id: 'orderedList',
    label: 'Numbered list',
    shortcut: 'Ctrl+Shift+7',
    group: 'block',
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive('orderedList'),
  },
  {
    id: 'taskList',
    label: 'Checklist',
    shortcut: 'Ctrl+Shift+9',
    group: 'block',
    extension: 'taskList',
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
    isActive: (editor) => editor.isActive('taskList'),
  },
  {
    id: 'blockquote',
    label: 'Quote',
    shortcut: 'Ctrl+Shift+B',
    group: 'block',
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
    isActive: (editor) => editor.isActive('blockquote'),
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    shortcut: 'Ctrl+Alt+C',
    group: 'block',
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    isActive: (editor) => editor.isActive('codeBlock'),
  },
];

export interface FormatState {
  active: boolean;
  available: boolean;
}

/** The toolbar actions this editor supports. */
export function actionsFor(editor: Editor): FormatAction[] {
  const loaded = new Set(editor.extensionManager.extensions.map((e) => e.name));
  return FORMAT_ACTIONS.filter((action) => !action.extension || loaded.has(action.extension));
}

/** The toolbar's view of the editor; compared by value so unrelated changes skip re-renders. */
export function formatState(
  editor: Editor,
  actions: FormatAction[] = FORMAT_ACTIONS,
): Record<string, FormatState> {
  return Object.fromEntries(
    actions.map((action) => [
      action.id,
      {
        active: action.isActive?.(editor) ?? false,
        available: action.isAvailable?.(editor) ?? true,
      },
    ]),
  );
}
