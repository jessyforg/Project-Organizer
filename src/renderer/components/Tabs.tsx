import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * Tabs (WAI-ARIA tabs pattern, automatic activation): the tab list is one Tab stop, the arrow
 * keys, Home, and End move between tabs and show their panel, and Tab then moves into the panel.
 */
export function Tabs<T extends string>({
  label,
  tabs,
  selected,
  onSelect,
  children,
}: {
  label: string;
  tabs: { id: T; label: string }[];
  selected: T;
  onSelect: (id: T) => void;
  /** The selected tab's panel. */
  children: ReactNode;
}) {
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === selected),
  );
  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onSelect(tabs[next]!.id);
    buttons.current[next]?.focus();
  };
  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${tab.id}`}
            className="tabs__tab"
            aria-selected={tab.id === selected}
            aria-controls={`${id}-panel`}
            tabIndex={tab.id === selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        className="tabs__panel"
        aria-labelledby={`${id}-tab-${selected}`}
      >
        {children}
      </div>
    </div>
  );
}
