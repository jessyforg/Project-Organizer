import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  BetweenVerticalEnd,
  BetweenVerticalStart,
  TableColumnsSplit,
  TableRowsSplit,
  Trash2,
} from 'lucide-react';
import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus';
import type { EditorState } from '@tiptap/pm/state';
import { useRovingFocus } from './useRovingFocus';

/** The position of the table around the cursor, or null. */
function tableAt(state: EditorState): number | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'table') return $from.before(depth);
  }
  return null;
}

const shouldShow: NonNullable<BubbleMenuProps['shouldShow']> = ({ editor, element, view, state }) =>
  editor.isEditable &&
  (view.hasFocus() || element.contains(document.activeElement)) &&
  tableAt(state) !== null;

interface TableAction {
  id: string;
  label: string;
  icon: typeof Trash2;
  run: (editor: Editor) => void;
  /** Whether the action is possible at the cursor. */
  can: (editor: Editor) => boolean;
  danger?: boolean;
}

const ACTIONS: TableAction[] = [
  {
    id: 'rowBefore',
    label: 'Add row above',
    icon: BetweenHorizontalStart,
    run: (e) => e.chain().focus().addRowBefore().run(),
    // A row above the header would make the header a body row.
    can: (e) => !e.isActive('tableHeader') && e.can().addRowBefore(),
  },
  {
    id: 'rowAfter',
    label: 'Add row below',
    icon: BetweenHorizontalEnd,
    run: (e) => e.chain().focus().addRowAfter().run(),
    can: (e) => e.can().addRowAfter(),
  },
  {
    id: 'columnBefore',
    label: 'Add column left',
    icon: BetweenVerticalStart,
    run: (e) => e.chain().focus().addColumnBefore().run(),
    can: (e) => e.can().addColumnBefore(),
  },
  {
    id: 'columnAfter',
    label: 'Add column right',
    icon: BetweenVerticalEnd,
    run: (e) => e.chain().focus().addColumnAfter().run(),
    can: (e) => e.can().addColumnAfter(),
  },
  {
    id: 'deleteRow',
    label: 'Delete row',
    icon: TableRowsSplit,
    run: (e) => e.chain().focus().deleteRow().run(),
    // Markdown tables always have a header row, so it cannot be deleted on its own.
    can: (e) => !e.isActive('tableHeader') && e.can().deleteRow(),
  },
  {
    id: 'deleteColumn',
    label: 'Delete column',
    icon: TableColumnsSplit,
    run: (e) => e.chain().focus().deleteColumn().run(),
    can: (e) => e.can().deleteColumn(),
  },
  {
    id: 'deleteTable',
    label: 'Delete table',
    icon: Trash2,
    run: (e) => e.chain().focus().deleteTable().run(),
    can: (e) => e.can().deleteTable(),
    danger: true,
  },
];

/**
 * Rows and columns for the table at the cursor (ADR-0017, stage 3): a toolbar below the table
 * while the cursor is in it. Alt+F10 reaches it from the text when the formatting bubble is not
 * showing; Escape goes back.
 */
export function TableMenu({ editor }: { editor: Editor }) {
  const element = useRef<HTMLDivElement>(null);
  const roving = useRovingFocus(ACTIONS.length);
  const available = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      tableAt(e.state) === null ? null : ACTIONS.map((action) => action.can(e)),
  });
  // Created once (see FormattingBubble: new options would be sent as a transaction).
  const [options] = useState(() => ({
    placement: 'bottom-start' as const,
    offset: 6,
    flip: {},
    shift: { padding: 8 },
  }));
  const reference = useMemo(
    () => () => {
      const pos = tableAt(editor.state);
      const dom = pos === null ? null : (editor.view.nodeDOM(pos) as HTMLElement | null);
      return dom ? { getBoundingClientRect: () => dom.getBoundingClientRect() } : null;
    },
    [editor],
  );

  useEffect(() => {
    const body = editor.view.dom;
    const onKeyDown = (event: KeyboardEvent) => {
      // The formatting bubble, when showing, handles Alt+F10 first.
      if (event.defaultPrevented || !event.altKey || event.key !== 'F10') return;
      if (!element.current?.isConnected) return;
      event.preventDefault();
      element.current.querySelector<HTMLElement>('button')?.focus();
    };
    body.addEventListener('keydown', onKeyDown);
    return () => body.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  return (
    <BubbleMenu
      ref={element}
      editor={editor}
      pluginKey="tableMenu"
      shouldShow={shouldShow}
      getReferencedVirtualElement={reference}
      className="bubble table-menu"
      options={options}
    >
      <div
        className="bubble__tools"
        role="toolbar"
        aria-label="Table"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            event.preventDefault();
            editor.view.focus();
            return;
          }
          roving.onKeyDown(event);
        }}
      >
        {ACTIONS.map((action, index) => {
          const enabled = available?.[index] ?? false;
          return (
            <button
              key={action.id}
              {...roving.itemProps(index)}
              type="button"
              className={`bubble__button${action.danger ? ' bubble__button--danger' : ''}`}
              aria-label={action.label}
              title={action.label}
              aria-disabled={!enabled}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (enabled) action.run(editor);
              }}
            >
              <action.icon aria-hidden />
            </button>
          );
        })}
      </div>
    </BubbleMenu>
  );
}
