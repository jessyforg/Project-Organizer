import { useState, type ReactNode } from 'react';
import { Image, Smile, Star, StarOff } from 'lucide-react';
import { useInvalidate } from '../../app/data';
import { useToast } from '../../app/toasts';
import type { MenuItem } from '../../components/ui';
import { CoverPicker, IconPicker } from './Pickers';

/** A project or note whose star, icon, and cover can be changed (ADR-0019). */
export interface LooksTarget {
  kind: 'project' | 'note';
  id: string;
  title: string;
  favourite: boolean;
  icon: string | null;
  cover: string | null;
  /** False for archived notes, which are read-only: only the star can change. */
  editable: boolean;
}

/**
 * Favourites, icons, and covers for one or more items: menu items for ⋯ menus, right-click
 * menus, and the palette, and the pickers they open. Render `dialogs` once beside the menus.
 */
export function useLooks() {
  const invalidate = useInvalidate();
  const toast = useToast();
  const [icon, setIcon] = useState<LooksTarget | null>(null);
  const [cover, setCover] = useState<LooksTarget | null>(null);

  const failed = (message: string) => toast({ message, tone: 'error' });

  const setFavourite = async (target: LooksTarget, starred: boolean) => {
    const result = await window.api.favourites.set({ kind: target.kind, id: target.id, starred });
    invalidate();
    if (!result.ok) return failed(result.error.message);
    toast({
      message: starred
        ? `Added “${target.title}” to favourites.`
        : `Removed “${target.title}” from favourites.`,
      actions: [{ label: 'Undo', run: () => setFavourite(target, !starred) }],
    });
  };

  const favouriteItem = (target: LooksTarget): MenuItem =>
    target.favourite
      ? {
          label: 'Remove from favourites',
          icon: StarOff,
          onSelect: () => void setFavourite(target, false),
        }
      : { label: 'Add to favourites', icon: Star, onSelect: () => void setFavourite(target, true) };

  /** The star, then the icon and cover when the item can be edited. */
  const itemsFor = (target: LooksTarget): MenuItem[] => [
    favouriteItem(target),
    ...(target.editable
      ? [
          {
            label: target.icon ? 'Change icon…' : 'Add icon…',
            icon: Smile,
            onSelect: () => setIcon(target),
          },
          {
            label: target.cover ? 'Change cover…' : 'Add cover…',
            icon: Image,
            onSelect: () => setCover(target),
          },
        ]
      : []),
  ];

  const save = async (change: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    const result = await change();
    invalidate();
    if (!result.ok) failed(result.error?.message ?? 'The change was not saved.');
  };

  const dialogs: ReactNode = (
    <>
      <IconPicker
        target={icon && { title: icon.title, current: icon.icon }}
        onClose={() => setIcon(null)}
        onChoose={(value) => {
          const target = icon!;
          setIcon(null);
          void save(() => window.api.looks.setIcon({ kind: target.kind, id: target.id, value }));
        }}
      />
      <CoverPicker
        target={cover && { title: cover.title, current: cover.cover }}
        onClose={() => setCover(null)}
        onChoose={(value) => {
          const target = cover!;
          setCover(null);
          void save(() => window.api.looks.setCover({ kind: target.kind, id: target.id, value }));
        }}
        onUpload={async (file) => {
          const target = cover!;
          const result = await window.api.looks.addCoverImage({
            kind: target.kind,
            id: target.id,
            name: file.name,
            data: new Uint8Array(await file.arrayBuffer()),
          });
          if (!result.ok) return result.error.message;
          invalidate();
          setCover(null);
          return null;
        }}
      />
    </>
  );

  return {
    itemsFor,
    favouriteItem,
    editIcon: (target: LooksTarget) => setIcon(target),
    editCover: (target: LooksTarget) => setCover(target),
    dialogs,
  };
}
