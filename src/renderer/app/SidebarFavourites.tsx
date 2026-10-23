import { useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, NotebookPen, StarOff } from 'lucide-react';
import type { FavouriteItem } from '@shared/domain';
import { Swatch, useContextMenu, type MenuItem } from '../components/ui';
import { ItemIcon } from '../features/looks/ItemIcon';
import { useInvalidate, useQuery } from './data';
import { useNavigation, type Route } from './navigation';
import { useToast } from './toasts';

const routeOf = (f: FavouriteItem): Route =>
  f.kind === 'project' ? { name: 'project', id: f.itemId } : { name: 'notes', noteId: f.itemId };

/**
 * Starred projects and notes at the top of the sidebar (ADR-0019), shown once anything is
 * starred. Reordered by drag and drop, or with Move up and Move down in each row's right-click
 * menu (also Shift+F10).
 */
export function SidebarFavourites() {
  const favourites = useQuery('favourites', () => window.api.favourites.list());
  const { route, navigate } = useNavigation();
  const invalidate = useInvalidate();
  const toast = useToast();
  const context = useContextMenu();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropBefore, setDropBefore] = useState<number | null>(null);
  const list = favourites.data ?? [];
  if (list.length === 0) return null;

  const save = async (ids: string[]) => {
    const result = await window.api.favourites.reorder({ ids });
    invalidate();
    if (!result.ok) toast({ message: result.error.message, tone: 'error' });
  };

  /** Moves the favourite at `from` to sit before index `to` of the current list. */
  const move = (from: number, to: number) => {
    const ids = list.map((f) => f.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to > from ? to - 1 : to, 0, moved!);
    if (ids.some((id, i) => id !== list[i]!.id)) void save(ids);
  };

  const unstar = async (f: FavouriteItem) => {
    const result = await window.api.favourites.set({ kind: f.kind, id: f.itemId, starred: false });
    invalidate();
    if (!result.ok) toast({ message: result.error.message, tone: 'error' });
  };

  const isCurrent = (f: FavouriteItem) =>
    f.kind === 'project'
      ? route.name === 'project' && route.id === f.itemId
      : route.name === 'notes' && route.noteId === f.itemId;

  const menuFor = (f: FavouriteItem, index: number): MenuItem[] => [
    { label: 'Open', icon: ExternalLink, onSelect: () => navigate(routeOf(f)) },
    ...(index > 0
      ? [{ label: 'Move up', icon: ArrowUp, onSelect: () => move(index, index - 1) }]
      : []),
    ...(index < list.length - 1
      ? [{ label: 'Move down', icon: ArrowDown, onSelect: () => move(index, index + 2) }]
      : []),
    {
      label: 'Remove from favourites',
      icon: StarOff,
      separated: true,
      onSelect: () => void unstar(f),
    },
  ];

  return (
    <div className="sidebar__favourites">
      <p className="sidebar__group" id="sidebar-favourites">
        Favourites
      </p>
      <ul
        className="sidebar__favourite-list"
        aria-labelledby="sidebar-favourites"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const from = list.findIndex((f) => f.id === dragging);
          if (from >= 0 && dropBefore !== null) move(from, dropBefore);
          setDragging(null);
          setDropBefore(null);
        }}
      >
        {list.map((f, index) => (
          <li
            key={f.id}
            className={dropBefore === index && dragging ? 'favourite favourite--drop' : 'favourite'}
            onDragOver={(e) => {
              e.preventDefault();
              const box = e.currentTarget.getBoundingClientRect();
              setDropBefore(e.clientY < box.top + box.height / 2 ? index : index + 1);
            }}
          >
            <button
              type="button"
              className="nav__item"
              draggable
              data-dragging={dragging === f.id ? 'true' : undefined}
              title={f.title}
              aria-current={isCurrent(f) ? 'page' : undefined}
              onClick={() => navigate(routeOf(f))}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', f.id);
                setDragging(f.id);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDropBefore(null);
              }}
              {...context.bind(`Actions for favourite ${f.title}`, menuFor(f, index))}
            >
              {f.icon ? (
                <ItemIcon value={f.icon} />
              ) : f.kind === 'project' ? (
                <Swatch color={f.color} />
              ) : (
                <NotebookPen aria-hidden />
              )}
              <span className="nav__label">{f.title}</span>
              {f.archived && <span className="nav__count">Archived</span>}
            </button>
          </li>
        ))}
        {dragging && dropBefore === list.length && (
          <li className="favourite favourite--drop-end" aria-hidden="true" />
        )}
      </ul>
      {context.menu}
    </div>
  );
}
