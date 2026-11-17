import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Milestone } from '../../src/shared/domain';
import { ProjectMilestones } from '../../src/renderer/features/milestones/ProjectMilestones';
import { filtersToQuery, type TaskFilters } from '../../src/renderer/features/tasks/FilterBar';
import { fail, installApi, makeProject, ok, renderWithApp } from './harness';

const BETA = '11111111-1111-4111-8111-111111111111';
const LAUNCH = '22222222-2222-4222-8222-222222222222';

const milestone = (overrides: Partial<Milestone>): Milestone => ({
  id: BETA,
  projectId: 'p1',
  name: 'Beta',
  description: null,
  targetDate: null,
  completedAt: null,
  createdAt: '2026-03-10T09:00:00.000Z',
  updatedAt: '2026-03-10T09:00:00.000Z',
  progress: { done: 0, total: 0, ratio: null },
  favourite: false,
  ...overrides,
});

function setup(list: Milestone[], options: { archived?: boolean } = {}) {
  const backend = installApi({
    'milestones:list': () => ok(list),
    'milestones:create': () => ok(milestone({})),
    'trash:trashMilestone': () => ok({ batchId: '33333333-3333-4333-8333-333333333333' }),
    'trash:restore': () => ok({}),
  });
  const onShowTasks = vi.fn();
  renderWithApp(
    <ProjectMilestones
      project={makeProject({ archivedAt: options.archived ? '2026-03-01T00:00:00.000Z' : null })}
      onShowTasks={onShowTasks}
    />,
  );
  return { backend, onShowTasks };
}

describe('the Milestones section (ADR-0020)', () => {
  it('shows progress, “—” without tasks, and overdue and done labels', async () => {
    setup([
      milestone({ targetDate: '2020-01-01', progress: { done: 1, total: 4, ratio: 0.25 } }),
      milestone({ id: LAUNCH, name: 'Launch', completedAt: '2026-03-01T00:00:00.000Z' }),
    ]);
    const list = await screen.findByRole('list', { name: 'Milestones in Website' });
    const [beta, launch] = within(list).getAllByRole('listitem');
    expect(within(beta!).getByText('Overdue')).toBeTruthy();
    expect(within(beta!).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25');
    expect(within(launch!).getByText('Done')).toBeTruthy();
    expect(within(launch!).getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull();
    expect(within(launch!).getByText('No target date')).toBeTruthy();
  });

  it('creates a milestone, and asks for a name first', async () => {
    const { backend } = setup([]);
    expect(await screen.findByText(/No milestones yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New milestone' }));
    const dialog = screen.getByRole('dialog', { name: 'New milestone' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create milestone' }));
    expect(within(dialog).getByRole('alert').textContent).toBe('Enter a name for the milestone.');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Beta' } });
    fireEvent.change(within(dialog).getByLabelText('Target date'), {
      target: { value: '2026-04-01' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create milestone' }));
    await waitFor(() =>
      expect(backend.callsTo('milestones:create')).toEqual([
        { projectId: 'p1', name: 'Beta', description: null, targetDate: '2026-04-01' },
      ]),
    );
  });

  it('completes, stars, shows tasks, and moves to the trash with undo', async () => {
    const { backend, onShowTasks } = setup([milestone({})]);
    const menu = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Actions for milestone Beta' }));
      return screen.getByRole('menu');
    };
    fireEvent.click(within(await menu()).getByRole('menuitem', { name: 'Mark completed' }));
    await waitFor(() =>
      expect(backend.callsTo('milestones:setCompleted')).toEqual([{ id: BETA, completed: true }]),
    );
    fireEvent.click(within(await menu()).getByRole('menuitem', { name: 'Add to favourites' }));
    await waitFor(() =>
      expect(backend.callsTo('favourites:set')).toEqual([
        { kind: 'milestone', id: BETA, starred: true },
      ]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Beta' }));
    expect(onShowTasks).toHaveBeenCalledWith(BETA);
    fireEvent.click(within(await menu()).getByRole('menuitem', { name: 'Move to trash' }));
    await screen.findByText('“Beta” moved to trash. Its tasks stay in the project.');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(backend.callsTo('trash:restore')).toHaveLength(1));
  });

  it('keeps an archived project’s milestones read-only', async () => {
    setup([milestone({})], { archived: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for milestone Beta' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Show its tasks',
      'Add to favourites',
    ]);
    expect(screen.queryByRole('button', { name: 'New milestone' })).toBeNull();
  });

  it('shows why a change was refused', async () => {
    installApi({
      'milestones:list': () => ok([milestone({})]),
      'milestones:setCompleted': () =>
        fail('Unarchive the project to change its milestones.', 'CONFLICT'),
    });
    renderWithApp(<ProjectMilestones project={makeProject()} onShowTasks={() => undefined} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Actions for milestone Beta' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark completed' }));
    expect(await screen.findByText('Unarchive the project to change its milestones.')).toBeTruthy();
  });
});

describe('the milestone filter (ADR-0020)', () => {
  const base: TaskFilters = {
    text: '',
    categories: [],
    priorities: [],
    due: '',
    tagId: '',
    projectId: '',
    milestone: '',
    sort: 'priority',
  };
  it('asks for a milestone’s tasks, tasks without one, or any', () => {
    expect(filtersToQuery({ ...base, milestone: BETA }).milestoneId).toBe(BETA);
    expect(filtersToQuery({ ...base, milestone: 'none' }).milestoneId).toBeNull();
    expect('milestoneId' in filtersToQuery(base)).toBe(false);
  });
});
