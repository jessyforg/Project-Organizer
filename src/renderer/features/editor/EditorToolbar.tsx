import { Fragment, useMemo } from 'react';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  ListTodo,
  Redo2,
  SquareCode,
  Strikethrough,
  TextQuote,
  Undo2,
} from 'lucide-react';
import { useEditorState, type Editor } from '@tiptap/react';
import { actionsFor, formatState } from './editor-config';
import { useRovingFocus } from './useRovingFocus';

const ICONS: Record<string, typeof Bold> = {
  undo: Undo2,
  redo: Redo2,
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bold: Bold,
  italic: Italic,
  strike: Strikethrough,
  code: Code,
  bulletList: List,
  orderedList: ListOrdered,
  taskList: ListTodo,
  blockquote: TextQuote,
  codeBlock: SquareCode,
};

/**
 * Formatting buttons for a DocumentEditor. Follows the WAI-ARIA toolbar pattern: the toolbar is
 * one Tab stop and the arrow keys move between buttons. Unavailable buttons stay focusable
 * (aria-disabled) so keyboard users can still find them.
 */
export function EditorToolbar({ editor, controls }: { editor: Editor; controls: string }) {
  const actions = useMemo(() => actionsFor(editor), [editor]);
  const state = useEditorState({ editor, selector: ({ editor: e }) => formatState(e, actions) });
  const { onKeyDown, itemProps } = useRovingFocus(actions.length);

  return (
    <div
      className="doc-toolbar"
      role="toolbar"
      aria-label="Formatting"
      aria-controls={controls}
      onKeyDown={onKeyDown}
    >
      {actions.map((action, index) => {
        const Icon = ICONS[action.id] ?? Bold;
        const { active, available } = state[action.id] ?? { active: false, available: true };
        const toggles = action.isActive !== undefined;
        const newGroup = index > 0 && actions[index - 1]!.group !== action.group;
        return (
          <Fragment key={action.id}>
            {newGroup && <span className="doc-toolbar__divider" aria-hidden="true" />}
            <button
              {...itemProps(index)}
              type="button"
              className="doc-toolbar__button"
              aria-label={`${action.label} (${action.shortcut})`}
              title={`${action.label} (${action.shortcut})`}
              aria-pressed={toggles ? active : undefined}
              aria-disabled={!available}
              // Keep the editor's selection: a mouse press would otherwise move focus first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (available) action.run(editor);
              }}
            >
              <Icon aria-hidden />
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
