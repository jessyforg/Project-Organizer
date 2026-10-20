import type { Editor, Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

/**
 * Editor configuration for documents (ADR-0012), kept apart from the components that show it.
 * Only the formats in the prototype's scope are enabled. Links stay off until they get the
 * same safety rules as note links (ADR-0009).
 */
export const HEADING_LEVELS = [1, 2, 3] as const;
type HeadingLevel = (typeof HEADING_LEVELS)[number];

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

export type FormatGroup = 'history' | 'heading' | 'inline' | 'block';

/** A toolbar action. `shortcut` is for display; Tiptap's own keymap handles the keys. */
export interface FormatAction {
  id: string;
  label: string;
  shortcut: string;
  group: FormatGroup;
  run: (editor: Editor) => void;
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

/** The toolbar's view of the editor; compared by value so unrelated changes skip re-renders. */
export function formatState(editor: Editor): Record<string, FormatState> {
  return Object.fromEntries(
    FORMAT_ACTIONS.map((action) => [
      action.id,
      {
        active: action.isActive?.(editor) ?? false,
        available: action.isAvailable?.(editor) ?? true,
      },
    ]),
  );
}
