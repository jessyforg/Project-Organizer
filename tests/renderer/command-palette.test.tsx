import { useState } from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SwitcherItem } from '../../src/shared/domain';
import type { PaletteMode } from '../../src/renderer/app/CommandPalette';
import { useNavigation } from '../../src/renderer/app/navigation';
import { PaletteHost } from '../../src/renderer/app/PaletteHost';
import {
  PaletteRegistryProvider,
  usePaletteActions,
} from '../../src/renderer/app/palette-registry';
import { installApi, ok, renderWithApp } from './harness';

const TASK = '11111111-1111-4111-8111-111111111111';
const NOTE = '22222222-2222-4222-8222-222222222222';

const item = (overrides: Partial<SwitcherItem>): SwitcherItem => ({
  kind: 'task',
  id: TASK,
  title: 'Fix login',
  projectName: 'Website',
  folderName: null,
  archived: false,
  completed: false,
  icon: null,
  ...overrides,
});

function Probe() {
  const { route, openTaskId } = useNavigation();
  return <output data-testid="probe">{JSON.stringify({ route, openTaskId })}</output>;
}

function ScreenActions({ onArchive }: { onArchive: () => void }) {
  usePaletteActions('Note: Roadmap', () => [{ label: 'Archive', onSelect: onArchive }]);
  return null;
}

/** Opens the palette with a button, as the shortcuts do, once the screen has mounted. */
function Host({ onArchive }: { onArchive?: () => void }) {
  const [mode, setMode] = useState<PaletteMode | null>(null);
  return (
    <PaletteRegistryProvider>
      <Probe />
      {onArchive && <ScreenActions onArchive={onArchive} />}
      <button type="button" onClick={() => setMode('actions')}>
        Open palette
      </button>
      <button type="button" onClick={() => setMode('items')}>
        Open switcher
      </button>
      <PaletteHost
        mode={mode}
        setMode={setMode}
        newTask={() => undefined}
        showShortcuts={() => undefined}
        theme="light"
      />
    </PaletteRegistryProvider>
  );
}

function setup(initial: PaletteMode, options: { onArchive?: () => void } = {}) {
  const backend = installApi({
    'switcher:recent': () =>
      ok([item({ kind: 'note', id: NOTE, title: 'Roadmap', folderName: 'Plans' })]),
    'switcher:search': (payload) =>
      ok(
        String(payload['text']).startsWith('fix')
          ? [item({}), item({ kind: 'note', id: NOTE, title: 'Fix notes', archived: true })]
          : [],
      ),
  });
  renderWithApp(<Host {...options} />);
  fireEvent.click(
    screen.getByRole('button', { name: initial === 'actions' ? 'Open palette' : 'Open switcher' }),
  );
  const input = screen.getByRole('combobox');
  const probe = () =>
    JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as {
      route: { name: string; text?: string; noteId?: string; focus?: boolean };
      openTaskId: string | null;
    };
  const type = (text: string) => fireEvent.change(input, { target: { value: text } });
  const key = (k: string, init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(input, { key: k, ...init });
  return { backend, input, probe, type, key };
}

const optionNames = () =>
  screen.getAllByRole('option').map((o) => o.querySelector('.palette__label')?.textContent);

describe('the command palette (ADR-0018)', () => {
  it('opens with ">" for actions, shows shortcuts, and runs the highlighted one', async () => {
    const { input, type, key, probe } = setup('actions');
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    expect(input).toHaveProperty('value', '>');
    const newTask = screen.getByRole('option', { name: /New task/ });
    expect(newTask.getAttribute('aria-keyshortcuts')).toBe('Control+N');
    expect(within(newTask).getByText('Ctrl+N')).toBeTruthy();

    type('>go tr');
    expect(optionNames()).toEqual(['Go to Trash', 'Search everything for “go tr”']);
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]!.id);
    key('Enter');
    await waitFor(() => expect(probe().route.name).toBe('trash'));
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('moves with the arrow keys, wrapping at the ends', () => {
    const { input, type, key } = setup('actions');
    type('>go to');
    const options = screen.getAllByRole('option');
    key('ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe(options.at(-1)!.id);
    key('ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    expect(options.at(-1)!.getAttribute('aria-selected')).toBe('false');
  });

  it('lists the screen’s own actions first and runs them after the palette has closed', async () => {
    const openAtRun: boolean[] = [];
    const onArchive = vi.fn(() => openAtRun.push(document.querySelector('dialog[open]') !== null));
    const { type, key } = setup('actions', { onArchive });
    expect(screen.getAllByRole('group')[0]).toBe(
      screen.getByRole('group', { name: 'Note: Roadmap' }),
    );
    expect(optionNames()[0]).toBe('Archive');
    type('>roadmap arch');
    expect(optionNames()).toEqual(['Archive', 'Search everything for “roadmap arch”']);
    key('Enter');
    await waitFor(() => expect(onArchive).toHaveBeenCalledTimes(1));
    expect(openAtRun).toEqual([false]);
  });

  it('ends with "Search everything", which opens the search page', async () => {
    const { type, probe } = setup('actions');
    type('>quarterly');
    expect(optionNames()).toEqual(['Search everything for “quarterly”']);
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    expect(within(dialog).getByRole('status').textContent).toBe('1 result');
    fireEvent.click(screen.getByRole('option'));
    await waitFor(() => expect(probe().route).toEqual({ name: 'search', text: 'quarterly' }));
  });
});

describe('the quick switcher (ADR-0018)', () => {
  it('shows recently opened items with their type, project, and folder', async () => {
    const { backend } = setup('items');
    const option = await screen.findByRole('option', { name: /Roadmap/ });
    expect(within(option).getByText('Note · Website / Plans')).toBeTruthy();
    expect(backend.callsTo('switcher:recent')).toEqual([{ includeArchived: false }]);
  });

  it('finds items as you type and opens a task’s details', async () => {
    const { backend, type, key, probe } = setup('items');
    await screen.findByRole('option', { name: /Roadmap/ });
    type('fix');
    await screen.findByRole('option', { name: /Fix login/ });
    expect(
      within(screen.getByRole('option', { name: /Fix notes/ })).getByText('Archived'),
    ).toBeTruthy();
    expect(backend.callsTo('switcher:search').at(-1)).toEqual({
      text: 'fix',
      includeArchived: false,
    });
    key('Enter');
    await waitFor(() => expect(probe().openTaskId).toBe(TASK));
  });

  it('opens a note in focus mode with Ctrl+Enter', async () => {
    const { type, key, probe } = setup('items');
    type('fix');
    await screen.findByRole('option', { name: /Fix notes/ });
    key('ArrowDown');
    key('Enter', { ctrlKey: true });
    await waitFor(() =>
      expect(probe().route).toEqual({ name: 'notes', noteId: NOTE, focus: true }),
    );
  });

  it('asks for archived items when "Include archived" is ticked', async () => {
    const { backend } = setup('items');
    await screen.findByRole('option', { name: /Roadmap/ });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include archived' }));
    await waitFor(() =>
      expect(backend.callsTo('switcher:recent').at(-1)).toEqual({ includeArchived: true }),
    );
  });

  it('says when nothing matches, and switches to actions when ">" is typed', async () => {
    const { type } = setup('items');
    type('zzz');
    await screen.findByText('Search everything for “zzz”');
    type('>');
    expect(screen.queryByRole('checkbox', { name: 'Include archived' })).toBeNull();
    expect(screen.getByRole('listbox', { name: 'Actions' })).toBeTruthy();
  });

  it('records opened projects, notes, and task details for the recent list', async () => {
    const { backend, key, probe } = setup('items');
    await screen.findByRole('option', { name: /Roadmap/ });
    key('Enter');
    await waitFor(() => expect(probe().route.noteId).toBe(NOTE));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open palette' }));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(backend.callsTo('switcher:recordOpened')).toEqual([{ kind: 'note', id: NOTE }]),
    );
  });
});
