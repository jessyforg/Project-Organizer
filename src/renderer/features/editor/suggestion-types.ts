import type { SuggestionProps } from '@tiptap/suggestion';

/**
 * What a suggestion menu (the slash menu, the link and mention pickers) needs while it is open.
 * The editor extension reports it; suggestion-menu.tsx draws it.
 */
export interface SuggestionMenuState<T> {
  items: T[];
  query: string;
  choose: (item: T) => void;
  /** Hands the popup element to the plugin, which positions it at the cursor; returns cleanup. */
  mount: SuggestionProps<T, T>['mount'];
  /** True while items are still being looked up (they are left as they were meanwhile). */
  loading: boolean;
}

export interface SuggestionMenuOptions<T> {
  /** Called with the menu's state when it opens or changes, and null when it closes. */
  onState: (state: SuggestionMenuState<T> | null) => void;
  /** Keys pressed while the menu is open; return true when handled. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

/**
 * The Suggestion plugin's render callbacks for a menu. `immediate` lists items at once while the
 * plugin is still loading, for menus whose items need no waiting (the slash menu).
 */
export function menuRender<T>(
  { onState, onKeyDown }: SuggestionMenuOptions<T>,
  immediate?: (props: SuggestionProps<T, T>) => T[],
) {
  const toState = (props: SuggestionProps<T, T>): SuggestionMenuState<T> => ({
    items: props.loading && immediate ? immediate(props) : props.items,
    query: props.query,
    choose: props.command,
    mount: props.mount,
    loading: props.loading && !immediate,
  });
  return () => ({
    onStart: (props: SuggestionProps<T, T>) => onState(toState(props)),
    onUpdate: (props: SuggestionProps<T, T>) => onState(toState(props)),
    onExit: () => onState(null),
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      // Escape closes the menu (the plugin does that); keep it from also leaving focus mode.
      if (event.key === 'Escape') event.stopPropagation();
      return onKeyDown(event);
    },
  });
}
