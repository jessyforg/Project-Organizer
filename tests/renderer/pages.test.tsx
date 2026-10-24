import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { applyTheme } from '../../src/renderer/app/Shell';
import { DashboardPage } from '../../src/renderer/features/dashboard/DashboardPage';
import { TrashPage } from '../../src/renderer/features/trash/TrashPage';
import { describeDue, describeProgress } from '../../src/renderer/lib/format';
import { installApi, ok, renderWithApp } from './harness';

const entry = {
  batchId: 'b1',
  kind: 'task' as const,
  title: 'Old task',
  projectName: 'Inbox',
  itemCount: 1,
  deletedAt: '2026-03-01T10:00:00.000Z',
  purgeAfter: '2026-03-31T10:00:00.000Z',
};

describe('TrashPage', () => {
  it('shows an empty state', async () => {
    installApi();
    renderWithApp(<TrashPage />);
    expect(await screen.findByText('The trash is empty.')).toBeInTheDocument();
  });

  it('restores and reports dependencies that still point into the trash', async () => {
    const backend = installApi({
      'trash:list': () => ok([entry]),
      'trash:restore': () =>
        ok({
          restoredProjects: 0,
          restoredTasks: 1,
          restoredNotes: 0,
          unresolvedDependencies: [{ taskId: 'a', prerequisiteId: 'b' }],
        }),
    });
    renderWithApp(<TrashPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(backend.callsTo('trash:restore')).toEqual([{ batchId: 'b1' }]);
    expect(await screen.findByText(/1 dependency still point/)).toBeInTheDocument();
  });

  it('deletes permanently only after confirmation', async () => {
    const backend = installApi({ 'trash:list': () => ok([entry]) });
    renderWithApp(<TrashPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('This cannot be undone.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(backend.callsTo('trash:deletePermanently')).toEqual([]);
  });
});

describe('DashboardPage', () => {
  it('shows real counts and an empty state when nothing is scheduled', async () => {
    installApi({
      'dashboard:get': () =>
        ok({
          today: '2026-03-10',
          overdue: [],
          dueToday: [],
          upcoming: [],
          recentlyCompleted: [],
          activeProjects: [],
          milestones: [],
          openTaskCount: 1,
          completedThisWeek: 0,
        }),
      'activity:recent': () =>
        ok([
          {
            id: 1,
            at: '2026-03-10T09:00:00.000Z',
            itemKind: 'task',
            itemId: 't1',
            projectId: 'p1',
            title: 'Touched',
            action: 'renamed',
            field: null,
            oldValue: 'Old',
            newValue: 'Touched',
            live: true,
          },
        ]),
    });
    renderWithApp(<DashboardPage />);
    expect(await screen.findByText(/1 open task · 0 completed/)).toBeInTheDocument();
    expect(screen.getByText('Nothing is due in the next week.')).toBeInTheDocument();
    expect(screen.getByText('No active projects.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Touched' })).toBeInTheDocument();
    expect(screen.getByText('Renamed from “Old” to “Touched”')).toBeInTheDocument();
  });
});

describe('formatting', () => {
  it('describes due dates relative to today; closed tasks are never overdue', () => {
    expect(describeDue('2026-03-09', '2026-03-10', 'todo')).toMatchObject({ state: 'overdue' });
    expect(describeDue('2026-03-10', '2026-03-10', 'in_progress')).toEqual({
      label: 'Today',
      state: 'today',
    });
    expect(describeDue('2026-03-11', '2026-03-10', 'todo')).toEqual({
      label: 'Tomorrow',
      state: 'soon',
    });
    expect(describeDue('2026-03-09', '2026-03-10', 'done')).toMatchObject({ state: 'closed' });
  });

  it('describes undefined progress without a misleading percentage', () => {
    expect(describeProgress({ done: 0, total: 0, ratio: null })).toBe('No tasks to count yet');
  });

  it('applies and clears the theme on the document', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.dataset['theme']).toBeUndefined();
  });
});
