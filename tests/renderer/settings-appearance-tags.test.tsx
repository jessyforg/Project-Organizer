import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { Tag } from '../../src/shared/domain';
import type { ProfileSummary } from '../../src/shared/types';
import { SettingsPage } from '../../src/renderer/features/settings/SettingsPage';
import { describeUsage, TagsPanel } from '../../src/renderer/features/settings/TagsPanel';
import { applyPalette, resetPalette } from '../../src/renderer/theme/palettes';
import { installApi, ok, renderWithApp } from './harness';

const NOW = '2026-03-10T09:00:00.000Z';
const TAG: Tag = {
  id: '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b',
  name: 'Urgent',
  color: 'red',
  createdAt: NOW,
  updatedAt: NOW,
};
const PROFILE: ProfileSummary = {
  id: '1f2e3d4c-5b6a-4978-8a6b-5c4d3e2f1a0b',
  displayName: 'Work',
  createdAt: NOW,
  lastOpenedAt: NOW,
};

afterEach(() => {
  const root = document.documentElement;
  root.removeAttribute('style');
  delete root.dataset['accent'];
  delete root.dataset['surface'];
  delete root.dataset['theme'];
});

describe('describeUsage', () => {
  it('says where a tag is used', () => {
    expect(describeUsage({ tasks: 0, projects: 0, notes: 0 })).toBe('Not used');
    expect(describeUsage({ tasks: 1, projects: 0, notes: 0 })).toBe('1 task');
    expect(describeUsage({ tasks: 2, projects: 1, notes: 3 })).toBe(
      '2 tasks, 1 project and 3 notes',
    );
  });
});

describe('Settings → Tags', () => {
  it('lists tags with their use, and deletes one after confirming', async () => {
    const backend = installApi({
      'tags:list': () => ok([TAG]),
      'tags:usage': () => ok({ [TAG.id]: { tasks: 2, projects: 0, notes: 1 } }),
    });
    renderWithApp(<TagsPanel />);
    const list = await screen.findByRole('list', { name: 'Tags' });
    expect(await within(list).findByText('2 tasks and 1 note')).toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: 'Actions for tag Urgent' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete tag' }));
    expect(
      screen.getByText('It is removed from 2 tasks and 1 note. The items are kept.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete tag' }));
    expect(backend.callsTo('tags:delete')).toEqual([{ id: TAG.id }]);
    expect(await screen.findByText('Deleted the tag “Urgent”.')).toBeInTheDocument();
  });

  it('renames and recolours a tag', async () => {
    const backend = installApi({
      'tags:list': () => ok([TAG]),
      'tags:update': (payload) => ok({ ...TAG, ...payload }),
    });
    renderWithApp(<TagsPanel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for tag Urgent' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit tag' }));
    const name = screen.getByLabelText('Tag name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Blocker');
    await userEvent.click(screen.getByRole('radio', { name: 'orange' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save tag' }));
    expect(backend.callsTo('tags:update')).toEqual([
      { id: TAG.id, name: 'Blocker', color: 'orange' },
    ]);
  });
});

describe('Settings → Appearance', () => {
  it('applies and saves a primary and secondary colour', async () => {
    const backend = installApi({
      'settings:update': (patch) =>
        ok({ theme: 'light', accent: 'blue', surface: 'cool', ...patch }),
    });
    renderWithApp(
      <SettingsPage active={PROFILE} profiles={[PROFILE]} onProfilesChanged={async () => {}} />,
    );
    const primary = screen.getByRole('radiogroup', { name: 'Primary colour' });
    expect(within(primary).getByRole('radio', { name: 'Blue' })).toBeChecked();
    await userEvent.click(within(primary).getByRole('radio', { name: 'Teal' }));
    const root = document.documentElement;
    expect(root.dataset['accent']).toBe('teal');
    expect(root.style.getPropertyValue('--accent')).toBe('#0e7068');

    const secondary = screen.getByRole('radiogroup', { name: 'Secondary colour' });
    await userEvent.click(within(secondary).getByRole('radio', { name: 'Warm' }));
    expect(root.dataset['surface']).toBe('warm');
    expect(root.style.getPropertyValue('--bg')).toBe('#f6f4f0');
    await waitFor(() =>
      expect(backend.callsTo('settings:update')).toEqual([{ accent: 'teal' }, { surface: 'warm' }]),
    );
  });

  it('uses the dark palette with the dark theme', async () => {
    installApi();
    renderWithApp(
      <SettingsPage active={PROFILE} profiles={[PROFILE]} onProfilesChanged={async () => {}} />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }));
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ee8aa6');
  });
});

describe('resetPalette', () => {
  it('removes a profile palette, so the stylesheet’s defaults apply again', () => {
    applyPalette('rose', 'warm', 'dark');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--bg')).toBe('#191613');
    resetPalette();
    expect(root.style.getPropertyValue('--bg')).toBe('');
    expect(root.style.getPropertyValue('--focus-ring')).toBe('');
    expect(root.dataset['accent']).toBeUndefined();
  });
});
