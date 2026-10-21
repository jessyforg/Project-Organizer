import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  SquareCode,
  TextQuote,
  Type,
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { SlashCommands, type SlashCommand, type SlashMenuState } from './slash-commands';

const ICONS: Record<string, typeof Type> = {
  paragraph: Type,
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bulletList: List,
  orderedList: ListOrdered,
  taskList: ListTodo,
  blockquote: TextQuote,
  codeBlock: SquareCode,
  divider: Minus,
};

interface Snapshot {
  state: SlashMenuState | null;
  /** The highlighted command's index. */
  active: number;
}

/**
 * The menu's state lives outside React: the editor's key handler reads it the moment a key is
 * pressed, which may be before React has re-rendered.
 */
function createSlashMenuStore() {
  let snapshot: Snapshot = { state: null, active: 0 };
  const listeners = new Set<() => void>();
  const set = (next: Snapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const extension = SlashCommands.configure({
    onState: (state) => set({ state, active: 0 }),
    onKeyDown: (event) => {
      const { state, active } = snapshot;
      const count = state?.items.length ?? 0;
      if (!state || count === 0) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        set({ state, active: (active + step + count) % count });
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        state.choose(state.items[active]!);
        return true;
      }
      return false;
    },
  });
  return {
    extension,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    highlight: (active: number) => set({ ...snapshot, active }),
  };
}

/**
 * The slash command menu (ADR-0016). Returns the editor extension, created once, and a render
 * function for the menu. Focus stays in the editor while the menu is open, as in a combobox:
 * the arrow keys move the highlighted command and Enter or Tab runs it.
 */
export function useSlashMenu() {
  const [store] = useState(createSlashMenuStore);
  const { state, active } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const render = (editor: Editor | null): ReactNode =>
    editor && state ? (
      <SlashMenu editor={editor} state={state} active={active} onHover={store.highlight} />
    ) : null;
  return { extension: store.extension, render };
}

function SlashMenu({
  editor,
  state,
  active,
  onHover,
}: {
  editor: Editor;
  state: SlashMenuState;
  active: number;
  onHover: (index: number) => void;
}) {
  const listId = `${useId()}-slash`;
  const optionId = (command: SlashCommand) => `${listId}-${command.id}`;
  const [host] = useState(() =>
    Object.assign(document.createElement('div'), { className: 'slash-menu-host' }),
  );
  const { mount, items } = state;
  const current = items[active];

  // The plugin adds the popup to the page and keeps it beside the cursor while it is open.
  const mountOnce = useRef(mount);
  useEffect(() => mountOnce.current(host), [host]);

  // Tell assistive technology which command is highlighted, while focus stays in the text.
  useEffect(() => {
    const body = editor.view.dom;
    body.setAttribute('aria-controls', listId);
    if (current) body.setAttribute('aria-activedescendant', optionId(current));
    else body.removeAttribute('aria-activedescendant');
    document.getElementById(current ? optionId(current) : '')?.scrollIntoView?.({
      block: 'nearest',
    });
  });
  useEffect(
    () => () => {
      editor.view.dom.removeAttribute('aria-controls');
      editor.view.dom.removeAttribute('aria-activedescendant');
    },
    [editor],
  );

  return createPortal(
    // Pressing anywhere in the menu keeps focus (and the cursor) in the editor.
    <div className="slash-menu" onMouseDown={(e) => e.preventDefault()}>
      {items.length > 0 ? (
        // The list scrolls, so it is focusable (WCAG 2.1.1); in practice focus stays in the
        // editor, whose arrow keys move through the list, and Tab runs a command.
        <div
          role="listbox"
          id={listId}
          aria-label="Insert a block"
          className="slash-menu__list"
          tabIndex={0}
        >
          {items.map((command, index) => {
            const Icon = ICONS[command.id] ?? Type;
            return (
              <div
                key={command.id}
                id={optionId(command)}
                role="option"
                aria-selected={index === active}
                className="slash-menu__item"
                onMouseMove={() => index !== active && onHover(index)}
                onClick={() => state.choose(command)}
              >
                <span className="slash-menu__icon" aria-hidden>
                  <Icon />
                </span>
                <span className="slash-menu__text">
                  <span className="slash-menu__label">{command.label}</span>
                  <span className="slash-menu__description">{command.description}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p id={listId} className="slash-menu__empty" role="status">
          No blocks match “{state.query}”
        </p>
      )}
    </div>,
    host,
  );
}
