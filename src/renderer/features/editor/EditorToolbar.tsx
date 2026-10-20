import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
  const [focusIndex, setFocusIndex] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const moveFocus = (index: number) => {
    const count = actions.length;
    const next = (index + count) % count;
    setFocusIndex(next);
    buttons.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: focusIndex + 1,
      ArrowLeft: focusIndex - 1,
      Home: 0,
      End: actions.length - 1,
    };
    const target = keys[event.key];
    if (target === undefined) return;
    event.preventDefault();
    moveFocus(target);
  };

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
              ref={(el) => {
                buttons.current[index] = el;
              }}
              type="button"
              className="doc-toolbar__button"
              tabIndex={index === focusIndex ? 0 : -1}
              aria-label={`${action.label} (${action.shortcut})`}
              title={`${action.label} (${action.shortcut})`}
              aria-pressed={toggles ? active : undefined}
              aria-disabled={!available}
              onFocus={() => setFocusIndex(index)}
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
