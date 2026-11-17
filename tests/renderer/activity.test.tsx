import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ActivityEvent } from '../../src/shared/domain';
import { useNavigation } from '../../src/renderer/app/navigation';
import { Tabs } from '../../src/renderer/components/Tabs';
import { ActivityList } from '../../src/renderer/features/activity/ActivityList';
import { describeActivity } from '../../src/renderer/features/activity/describe';
import { installApi, ok, renderWithApp } from './harness';

const event = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  id: 1,
  at: '2026-03-10T09:00:00.000Z',
  itemKind: 'task',
  itemId: 't1',
  projectId: 'p1',
  title: 'Ship',
  action: 'created',
  field: null,
  oldValue: null,
  newValue: null,
  live: true,
  ...overrides,
});

describe('activity sentences (ADR-0021)', () => {
  const say = (overrides: Partial<ActivityEvent>) =>
    describeActivity(event(overrides), '2026-03-10');
  it('describes each kind of change in plain words', () => {
    expect(say({})).toBe('Created');
    expect(say({ action: 'renamed', oldValue: 'A', newValue: 'B' })).toBe(
      'Renamed from “A” to “B”',
    );
    expect(say({ action: 'changed', field: 'status', oldValue: 'To do', newValue: 'Done' })).toBe(
      'Status changed from To do to Done',
    );
    expect(say({ action: 'changed', field: 'priority', newValue: 'high' })).toBe(
      'Priority set to High',
    );
    expect(say({ action: 'changed', field: 'due_date', oldValue: '2026-04-01' })).toBe(
      'Due date removed (was Apr 1)',
    );
    expect(
      say({ action: 'changed', field: 'milestone', oldValue: 'Beta', newValue: 'Launch' }),
    ).toBe('Milestone changed from Beta to Launch');
    expect(say({ action: 'moved', oldValue: 'Inbox', newValue: 'Website' })).toBe(
      'Moved from Inbox to Website',
    );
    expect(say({ action: 'trashed' })).toBe('Moved to the trash');
    expect(say({ action: 'attachment_removed', oldValue: 'map.png' })).toBe(
      'Removed the file “map.png”',
    );
  });
});

describe('tabs', () => {
  function Host() {
    const [tab, setTab] = useState<'a' | 'b'>('a');
    return (
      <Tabs
        label="Task"
        tabs={[
          { id: 'a', label: 'Details' },
          { id: 'b', label: 'Activity' },
        ]}
        selected={tab}
        onSelect={setTab}
      >
        <p>Panel {tab}</p>
      </Tabs>
    );
  }
  it('moves between tabs with the arrow keys and labels the panel', () => {
    render(<Host />);
    const details = screen.getByRole('tab', { name: 'Details' });
    expect(details.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Details' }).textContent).toBe('Panel a');
    details.focus();
    fireEvent.keyDown(details, { key: 'ArrowRight' });
    const activity = screen.getByRole('tab', { name: 'Activity' });
    expect(document.activeElement).toBe(activity);
    expect(activity.tabIndex).toBe(0);
    expect(details.tabIndex).toBe(-1);
    expect(screen.getByRole('tabpanel', { name: 'Activity' }).textContent).toBe('Panel b');
    fireEvent.keyDown(activity, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(details);
  });
});

const probe = () =>
  JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as {
    route: { name: string; id?: string; milestoneId?: string };
    openTaskId: string | null;
  };

describe('the activity list (ADR-0021)', () => {
  function Probe() {
    const { route, openTaskId } = useNavigation();
    return <output data-testid="probe">{JSON.stringify({ route, openTaskId })}</output>;
  }

  it('names and opens live items, shows gone ones as text, and loads more', async () => {
    const backend = installApi({
      'activity:recent': (payload) =>
        ok(
          Array.from({ length: Number(payload['limit']) === 2 ? 2 : 3 }, (_, i) =>
            event({
              id: i + 1,
              title: i === 1 ? 'Gone' : `Item ${i}`,
              live: i !== 1,
              itemKind: i === 2 ? 'milestone' : 'task',
              itemId: `x${i}`,
            }),
          ),
        ),
    });
    renderWithApp(
      <>
        <Probe />
        <ActivityList
          queryKey="recent"
          load={(limit) => window.api.activity.recent({ limit })}
          label="Recent activity"
          showItem
          pageSize={2}
        />
      </>,
    );
    const list = await screen.findByRole('list', { name: 'Recent activity' });
    expect(within(list).getByText('Gone').tagName).toBe('SPAN');
    fireEvent.click(within(list).getByRole('button', { name: 'Item 0' }));
    expect(probe().openTaskId).toBe('x0');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(backend.callsTo('activity:recent').at(-1)).toEqual({ limit: 4 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Item 2' }));
    expect(probe().route).toEqual({
      name: 'project',
      id: 'p1',
      milestoneId: 'x2',
    });
  });

  it('says when nothing has changed yet', async () => {
    installApi({ 'activity:forItem': () => ok([]) });
    renderWithApp(
      <ActivityList
        queryKey="t"
        load={(limit) => window.api.activity.forItem({ kind: 'task', id: 't1', limit })}
        label="Activity"
      />,
    );
    expect(await screen.findByText('Nothing has changed yet.')).toBeTruthy();
  });
});
