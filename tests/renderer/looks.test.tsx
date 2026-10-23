import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FavouriteItem } from '../../src/shared/domain';
import { SidebarFavourites } from '../../src/renderer/app/SidebarFavourites';
import { LooksRow } from '../../src/renderer/features/looks/LooksRow';
import { useLooks, type LooksTarget } from '../../src/renderer/features/looks/useLooks';
import { fail, installApi, ok, renderWithApp } from './harness';

const NOTE = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';

const target = (overrides: Partial<LooksTarget> = {}): LooksTarget => ({
  kind: 'note',
  id: NOTE,
  title: 'Roadmap',
  favourite: false,
  icon: null,
  cover: null,
  editable: true,
  ...overrides,
});

function Host({ item }: { item: LooksTarget }) {
  const looks = useLooks();
  return (
    <>
      {looks.itemsFor(item).map((menuItem) => (
        <button key={menuItem.label} type="button" onClick={menuItem.onSelect}>
          {menuItem.label}
        </button>
      ))}
      {looks.dialogs}
    </>
  );
}

describe('the icon picker (ADR-0019)', () => {
  it('moves through the grid with the arrow keys and saves the chosen icon', async () => {
    const backend = installApi();
    renderWithApp(<Host item={target()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add icon…' }));
    const grid = screen.getByRole('group', { name: 'Icons' });
    const icons = within(grid).getAllByRole('button');
    expect(icons).toHaveLength(60);
    expect(icons.filter((b) => b.tabIndex === 0)).toEqual([icons[0]]);
    act(() => icons[0]!.focus());
    fireEvent.keyDown(icons[0]!, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(icons[1]);
    fireEvent.keyDown(icons[1]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(icons[11]);
    fireEvent.keyDown(icons[11]!, { key: 'End' });
    expect(document.activeElement).toBe(icons[59]);
    fireEvent.click(within(grid).getByRole('button', { name: 'Rocket' }));
    await waitFor(() =>
      expect(backend.callsTo('looks:setIcon')).toEqual([
        { kind: 'note', id: NOTE, value: 'emoji:🚀' },
      ]),
    );
    expect(screen.queryByRole('group', { name: 'Icons' })).toBeNull();
  });

  it('starts on the current icon and can remove it', async () => {
    const backend = installApi();
    renderWithApp(<Host item={target({ icon: 'lucide:Lightbulb' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change icon…' }));
    const current = screen.getByRole('button', { name: 'Light bulb' });
    expect(current.getAttribute('aria-pressed')).toBe('true');
    expect(current.tabIndex).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Remove icon' }));
    await waitFor(() =>
      expect(backend.callsTo('looks:setIcon')).toEqual([{ kind: 'note', id: NOTE, value: null }]),
    );
  });
});

describe('the cover picker (ADR-0019)', () => {
  it('saves a preset', async () => {
    const backend = installApi();
    renderWithApp(<Host item={target({ kind: 'project', id: PROJECT })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add cover…' }));
    const presets = within(screen.getByRole('group', { name: 'Colours and gradients' }));
    expect(presets.getAllByRole('button')).toHaveLength(16);
    fireEvent.click(presets.getByRole('button', { name: 'Ocean gradient' }));
    await waitFor(() =>
      expect(backend.callsTo('looks:setCover')).toEqual([
        { kind: 'project', id: PROJECT, value: 'preset:ocean' },
      ]),
    );
  });

  it('uploads an image, and keeps the picker open with the reason when it is refused', async () => {
    let refuse = true;
    const backend = installApi({
      'looks:addCoverImage': () =>
        refuse ? fail('Choose a PNG, JPEG, GIF, or WebP image.') : ok('image:x'),
    });
    renderWithApp(<Host item={target()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add cover…' }));
    const input = screen.getByTestId('cover-image-input');
    const file = new File([new Uint8Array([1, 2, 3])], 'banner.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Choose a PNG, JPEG, GIF, or WebP image.',
    );
    expect(backend.callsTo('looks:addCoverImage')[0]).toMatchObject({
      kind: 'note',
      id: NOTE,
      name: 'banner.png',
    });
    refuse = false;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Colours and gradients' })).toBeNull(),
    );
  });
});

describe('stars (ADR-0019)', () => {
  it('adds and removes a star, with undo', async () => {
    const backend = installApi();
    renderWithApp(<Host item={target()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to favourites' }));
    await screen.findByText('Added “Roadmap” to favourites.');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(backend.callsTo('favourites:set')).toEqual([
        { kind: 'note', id: NOTE, starred: true },
        { kind: 'note', id: NOTE, starred: false },
      ]),
    );
  });

  it('offers only the star on read-only (archived) notes', () => {
    installApi();
    renderWithApp(<Host item={target({ editable: false, favourite: true })} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Remove from favourites',
    ]);
  });
});

const fav = (overrides: Partial<FavouriteItem>): FavouriteItem => ({
  id: crypto.randomUUID(),
  kind: 'note',
  itemId: NOTE,
  title: 'Roadmap',
  icon: null,
  color: null,
  archived: false,
  ...overrides,
});

describe('the sidebar favourites (ADR-0019)', () => {
  it('is hidden until something is starred', async () => {
    const backend = installApi({ 'favourites:list': () => ok([]) });
    renderWithApp(<SidebarFavourites />);
    await waitFor(() => expect(backend.callsTo('favourites:list')).toHaveLength(1));
    expect(screen.queryByText('Favourites')).toBeNull();
  });

  it('lists favourites with badges and reorders and removes them from the keyboard menu', async () => {
    const a = fav({ title: 'Roadmap', icon: 'emoji:🚀' });
    const b = fav({
      kind: 'project',
      itemId: PROJECT,
      title: 'Website',
      color: 'teal',
      archived: true,
    });
    const backend = installApi({ 'favourites:list': () => ok([a, b]) });
    renderWithApp(<SidebarFavourites />);
    const list = await screen.findByRole('list', { name: 'Favourites' });
    const rows = within(list).getAllByRole('button');
    expect(rows.map((r) => r.textContent)).toEqual(['🚀Roadmap', 'WebsiteArchived']);

    fireEvent.keyDown(rows[0]!, { key: 'F10', shiftKey: true });
    const menu = screen.getByRole('menu', { name: 'Actions for favourite Roadmap' });
    expect(within(menu).queryByRole('menuitem', { name: 'Move up' })).toBeNull();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move down' }));
    await waitFor(() =>
      expect(backend.callsTo('favourites:reorder')).toEqual([{ ids: [b.id, a.id] }]),
    );

    fireEvent.keyDown(rows[1]!, { key: 'F10', shiftKey: true });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from favourites' }));
    await waitFor(() =>
      expect(backend.callsTo('favourites:set')).toEqual([
        { kind: 'project', id: PROJECT, starred: false },
      ]),
    );
  });
});

describe('the looks row (ADR-0019)', () => {
  it('shows the icon as a button that changes it, and Add buttons, when editable', () => {
    installApi();
    let opened = '';
    renderWithApp(
      <LooksRow
        target={target({ icon: 'emoji:🚀' })}
        onIcon={() => (opened = 'icon')}
        onCover={() => (opened = 'cover')}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Change icon (Rocket)' }));
    expect(opened).toBe('icon');
    fireEvent.click(screen.getByRole('button', { name: 'Add cover' }));
    expect(opened).toBe('cover');
    expect(screen.queryByRole('button', { name: 'Add icon' })).toBeNull();
  });

  it('shows only the icon on read-only items', () => {
    installApi();
    renderWithApp(
      <LooksRow
        target={target({ icon: 'emoji:🚀', editable: false })}
        onIcon={() => undefined}
        onCover={() => undefined}
      />,
    );
    expect(screen.queryAllByRole('button')).toEqual([]);
    expect(screen.getByText('🚀')).toBeTruthy();
  });
});
