import { useEffect, useId, useState, type ComponentType, type KeyboardEvent } from 'react';
import { CircleCheck, FolderKanban, NotebookPen, Search, SquareCheck } from 'lucide-react';
import type { SwitcherItem } from '@shared/domain';
import { Dialog } from '../components/ui';

export type PaletteMode = 'actions' | 'items';

/** One thing the palette can do: an action, an item to open, or the search page. */
export interface PaletteOption {
  key: string;
  label: string;
  group: string;
  icon?: ComponentType<{ 'aria-hidden'?: boolean }>;
  /** A second line, such as an item's type and project. */
  meta?: string;
  badge?: string;
  shortcut?: string;
  danger?: boolean;
  /** Runs after the palette has closed; `ctrl` is true for Ctrl+Enter. */
  run: (options: { ctrl: boolean }) => void;
}

/**
 * Every typed word must appear in the option's name or group, ignoring case. Names that start
 * with the text come first; otherwise the order is kept.
 */
export function filterOptions(options: PaletteOption[], query: string): PaletteOption[] {
  const text = query.trim().toLowerCase();
  if (!text) return options;
  const terms = text.split(/\s+/);
  const matched = options.filter((option) => {
    const haystack = `${option.label} ${option.group}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  const starts = (option: PaletteOption) => option.label.toLowerCase().startsWith(text);
  return [...matched.filter(starts), ...matched.filter((option) => !starts(option))];
}

const KIND: Record<
  SwitcherItem['kind'],
  { label: string; icon: NonNullable<PaletteOption['icon']> }
> = {
  project: { label: 'Project', icon: FolderKanban },
  note: { label: 'Note', icon: NotebookPen },
  task: { label: 'Task', icon: SquareCheck },
};

/** Shows an item's type, then its project and folder. */
export function itemOption(
  item: SwitcherItem,
  group: string,
  open: (item: SwitcherItem, ctrl: boolean) => void,
): PaletteOption {
  const place = [item.projectName, item.folderName].filter(Boolean).join(' / ');
  const badge = item.archived ? 'Archived' : item.completed ? 'Done' : undefined;
  return {
    key: `${item.kind}:${item.id}`,
    label: item.title,
    group,
    icon: item.kind === 'task' && item.completed ? CircleCheck : KIND[item.kind].icon,
    meta: place ? `${KIND[item.kind].label} · ${place}` : KIND[item.kind].label,
    ...(badge ? { badge } : {}),
    run: ({ ctrl }) => open(item, ctrl),
  };
}

interface PaletteProps {
  /** The palette is open in this mode, or closed. */
  mode: PaletteMode | null;
  onClose: () => void;
  /** Called with what to run once the palette has closed. */
  onChoose: (run: () => void) => void;
  /** Read when the palette opens. */
  actions: () => PaletteOption[];
  openItem: (item: SwitcherItem, ctrl: boolean) => void;
  search: (text: string) => void;
}

/**
 * The command palette and quick switcher in one dialog (ADR-0018). Text starting with ">"
 * filters actions; other text finds projects, notes, and tasks. Ctrl+K opens it with ">" typed,
 * Ctrl+O without.
 */
export function CommandPalette({ mode, onClose, ...rest }: PaletteProps) {
  return (
    <Dialog open={mode !== null} onClose={onClose} label="Command palette" className="palette">
      {mode && <PaletteBody mode={mode} {...rest} />}
    </Dialog>
  );
}

function PaletteBody({
  mode,
  onChoose,
  actions,
  openItem,
  search,
}: Omit<PaletteProps, 'mode' | 'onClose'> & { mode: PaletteMode }) {
  const id = useId();
  const [text, setText] = useState(mode === 'actions' ? '>' : '');
  const [active, setActive] = useState(0);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [allActions] = useState(actions);
  const [found, setFound] = useState<{ items: SwitcherItem[]; error: string | null } | null>(null);

  const inActions = text.startsWith('>');
  const query = (inActions ? text.slice(1) : text).trim();

  // Items are looked up as the text changes; an answer to older text is ignored.
  useEffect(() => {
    if (inActions) return;
    let cancelled = false;
    const request = query
      ? window.api.switcher.search({ text: query, includeArchived })
      : window.api.switcher.recent({ includeArchived });
    void request.then((result) => {
      if (cancelled) return;
      setFound(
        result.ok
          ? { items: result.data, error: null }
          : { items: [], error: result.error.message },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [inActions, query, includeArchived]);

  const matches: PaletteOption[] = inActions
    ? filterOptions(allActions, query)
    : (found?.items ?? []).map((item) =>
        itemOption(item, query ? 'Projects, notes, and tasks' : 'Recently opened', openItem),
      );
  if (query) {
    matches.push({
      key: 'search',
      label: `Search everything for “${query}”`,
      group: 'Search',
      icon: Search,
      run: () => search(query),
    });
  }
  // Shown in groups; the highlight follows the order on screen.
  const groups = groupOptions(matches);
  const options = groups.flatMap((group) => group.options);
  const current = Math.min(active, options.length - 1);
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    document.getElementById(`${id}-option-${current}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [id, current]);

  const choose = (option: PaletteOption | undefined, ctrl: boolean) => {
    if (option) onChoose(() => option.run({ ctrl }));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(options[current], event.ctrlKey);
    }
  };

  const loading = !inActions && found === null;
  const empty = loading
    ? 'Searching…'
    : found?.error
      ? `Could not search. ${found.error}`
      : inActions
        ? 'No actions match.'
        : 'Nothing opened yet. Type a name to find a project, note, or task.';
  const listId = `${id}-list`;

  return (
    <div className="palette__body">
      <div className="palette__field">
        <Search aria-hidden />
        <input
          className="palette__input"
          role="combobox"
          aria-label="Type > for actions, or a name to open"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={options.length > 0 ? optionId(current) : undefined}
          placeholder="Type a name, or > for actions"
          autoFocus
          spellCheck={false}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {!inActions && (
        <label className="palette__archived">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          Include archived
        </label>
      )}
      {/* The list scrolls, so it is focusable too (WCAG 2.1.1); its keys match the text box's. */}
      <div
        id={listId}
        role="listbox"
        aria-label={inActions ? 'Actions' : 'Projects, notes, and tasks'}
        aria-busy={loading}
        className="palette__list"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {groups.map((group, groupIndex) => {
          const headingId = `${id}-group-${groupIndex}`;
          return (
            <div key={group.label} role="group" aria-labelledby={headingId}>
              <div id={headingId} role="presentation" className="palette__group">
                {group.label}
              </div>
              {group.options.map((option, offset) => {
                const at = group.start + offset;
                const Icon = option.icon;
                return (
                  <div
                    key={option.key}
                    id={optionId(at)}
                    role="option"
                    aria-selected={at === current}
                    aria-keyshortcuts={option.shortcut?.replace(/Ctrl/g, 'Control')}
                    className={
                      option.danger ? 'palette__option palette__option--danger' : 'palette__option'
                    }
                    // Keep focus in the text box when choosing with the mouse.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseMove={() => at !== current && setActive(at)}
                    onClick={(e) => choose(option, e.ctrlKey)}
                  >
                    {Icon && (
                      <span className="palette__icon" aria-hidden>
                        <Icon />
                      </span>
                    )}
                    <span className="palette__text">
                      <span className="palette__label">
                        {option.label}
                        {option.badge && (
                          <span className="label palette__badge">{option.badge}</span>
                        )}
                      </span>
                      {option.meta && <span className="palette__meta">{option.meta}</span>}
                    </span>
                    {option.shortcut && <kbd className="palette__kbd">{option.shortcut}</kbd>}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {options.length === 0 && <p className="palette__empty">{empty}</p>}
      <p className="visually-hidden" role="status">
        {loading ? '' : options.length === 1 ? '1 result' : `${options.length} results`}
      </p>
      <p className="palette__hint" aria-hidden="true">
        <span>
          <kbd>↑</kbd> <kbd>↓</kbd> move
        </span>
        <span>
          <kbd>Enter</kbd> {inActions ? 'run' : 'open'}
        </span>
        {!inActions && (
          <span>
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> note in focus mode
          </span>
        )}
        <span>
          <kbd>Esc</kbd> close
        </span>
        <span className="palette__mode">
          {inActions ? 'Delete > to find items' : 'Type > for actions'}
        </span>
      </p>
    </div>
  );
}

/** Options in groups, in order of each group's first option; `start` is its first index. */
function groupOptions(
  options: PaletteOption[],
): { label: string; options: PaletteOption[]; start: number }[] {
  const groups = new Map<string, PaletteOption[]>();
  for (const option of options) {
    const list = groups.get(option.group) ?? [];
    list.push(option);
    groups.set(option.group, list);
  }
  let start = 0;
  return [...groups].map(([label, list]) => {
    const group = { label, options: list, start };
    start += list.length;
    return group;
  });
}
