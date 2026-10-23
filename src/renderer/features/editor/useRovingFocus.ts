import { useRef, useState, type KeyboardEvent } from 'react';

/**
 * Focus handling for the WAI-ARIA toolbar pattern, shared by the editor's toolbars: the toolbar
 * is one Tab stop, and the arrow keys, Home, and End move between its controls.
 */
export function useRovingFocus(count: number) {
  const [focusIndex, setFocusIndex] = useState(0);
  const items = useRef<(HTMLElement | null)[]>([]);

  const focusAt = (index: number) => {
    const next = (index + count) % count;
    setFocusIndex(next);
    items.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: focusIndex + 1,
      ArrowLeft: focusIndex - 1,
      Home: 0,
      End: count - 1,
    };
    const target = keys[event.key];
    if (target === undefined) return;
    event.preventDefault();
    focusAt(target);
  };

  /** Props for the control at `index`. */
  const itemProps = (index: number) => ({
    ref: (el: HTMLElement | null) => {
      items.current[index] = el;
    },
    tabIndex: index === focusIndex ? 0 : -1,
    onFocus: () => setFocusIndex(index),
  });

  return { onKeyDown, itemProps, focusAt };
}
