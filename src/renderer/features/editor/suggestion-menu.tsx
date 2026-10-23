import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AnyExtension, Editor } from '@tiptap/react';
import type { Type } from 'lucide-react';
import type { SuggestionMenuOptions, SuggestionMenuState } from './suggestion-types';

/** How one item shows in the menu. */
export interface MenuOption {
  key: string;
  label: string;
  description?: string;
  icon?: typeof Type;
  /** A short tag after the label, such as "Archived". */
  badge?: string;
  /** Shown struck through, as a link to something that no longer exists would be. */
  muted?: boolean;
}

export interface MenuView<T> {
  /** The listbox's accessible name. */
  label: string;
  toOption: (item: T) => MenuOption;
  /** Shown when nothing matches. */
  empty: (query: string) => string;
}

interface Snapshot<T> {
  state: SuggestionMenuState<T> | null;
  /** The highlighted item's index. */
  active: number;
}

/**
 * The menu's state lives outside React: the editor's key handler reads it the moment a key is
 * pressed, which may be before React has re-rendered.
 */
function createMenuStore<T>(createExtension: (options: SuggestionMenuOptions<T>) => AnyExtension) {
  let snapshot: Snapshot<T> = { state: null, active: 0 };
  const listeners = new Set<() => void>();
  const set = (next: Snapshot<T>) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const extension = createExtension({
    onState: (state) => set({ state, active: 0 }),
    onKeyDown: (event) => {
      const { state, active } = snapshot;
      const count = state?.items.length ?? 0;
      if (!state) return false;
      // Still looking up items: hold Enter and Tab rather than act on an out-of-date list.
      if (state.loading && (event.key === 'Enter' || event.key === 'Tab')) return true;
      if (count === 0) return false;
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
 * A menu that opens at the cursor while typing (ADR-0016, ADR-0017): the slash menu and the link
 * and mention pickers. Returns the editor extension, created once, and a render function. Focus
 * stays in the editor while it is open, as in a combobox: the arrow keys move the highlighted
 * item and Enter or Tab chooses it.
 */
export function useSuggestionMenu<T>(
  createExtension: (options: SuggestionMenuOptions<T>) => AnyExtension,
  view: MenuView<T>,
) {
  const [store] = useState(() => createMenuStore(createExtension));
  const { state, active } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const render = (editor: Editor | null): ReactNode =>
    editor && state ? (
      <SuggestionMenu
        editor={editor}
        state={state}
        active={active}
        view={view}
        onHover={store.highlight}
      />
    ) : null;
  return { extension: store.extension, render };
}

function SuggestionMenu<T>({
  editor,
  state,
  active,
  view,
  onHover,
}: {
  editor: Editor;
  state: SuggestionMenuState<T>;
  active: number;
  view: MenuView<T>;
  onHover: (index: number) => void;
}) {
  const listId = `${useId()}-menu`;
  const options = state.items.map(view.toOption);
  const optionId = (option: MenuOption) => `${listId}-${option.key}`;
  const [host] = useState(() =>
    Object.assign(document.createElement('div'), { className: 'slash-menu-host' }),
  );
  const current = options[active];

  // The plugin adds the popup to the page and keeps it beside the cursor while it is open.
  const mountOnce = useRef(state.mount);
  useEffect(() => mountOnce.current(host), [host]);

  // Tell assistive technology which item is highlighted, while focus stays in the text.
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
      {options.length > 0 ? (
        // The list scrolls, so it is focusable (WCAG 2.1.1); in practice focus stays in the
        // editor, whose arrow keys move through the list, and Tab chooses.
        <div
          role="listbox"
          id={listId}
          aria-label={view.label}
          aria-busy={state.loading}
          className="slash-menu__list"
          tabIndex={0}
        >
          {options.map((option, index) => (
            <div
              key={option.key}
              id={optionId(option)}
              role="option"
              aria-selected={index === active}
              className={
                option.muted ? 'slash-menu__item slash-menu__item--muted' : 'slash-menu__item'
              }
              onMouseMove={() => index !== active && onHover(index)}
              onClick={() => state.choose(state.items[index]!)}
            >
              {option.icon && (
                <span className="slash-menu__icon" aria-hidden>
                  <option.icon />
                </span>
              )}
              <span className="slash-menu__text">
                <span className="slash-menu__label">
                  {option.label}
                  {option.badge && <span className="label slash-menu__badge">{option.badge}</span>}
                </span>
                {option.description && (
                  <span className="slash-menu__description">{option.description}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p id={listId} className="slash-menu__empty" role="status">
          {state.loading ? 'Searching…' : view.empty(state.query)}
        </p>
      )}
    </div>,
    host,
  );
}
