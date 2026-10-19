import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TaskBoard } from '../../src/renderer/features/board/TaskBoard';
import { installApi, makeProject, makeTask, ok, renderWithApp, STATUSES } from './harness';

const A = makeTask({ id: '00000000-0000-4000-8000-00000000000a', title: 'Alpha' });
const B = makeTask({ id: '00000000-0000-4000-8000-00000000000b', title: 'Beta' });
const C = makeTask({
  id: '00000000-0000-4000-8000-00000000000c',
  title: 'Gamma',
  statusId: 's-doing',
  statusCategory: 'in_progress',
  subtaskCount: 2,
  completedSubtaskCount: 1,
});

function setup() {
  const backend = installApi({
    'tasks:list': () => ok([A, B, C]),
    'tasks:moveOnBoard': () => ok({ task: A, notices: [] }),
  });
  renderWithApp(<TaskBoard project={makeProject()} statuses={STATUSES} />);
  return backend;
}

const column = (name: RegExp) => screen.getByRole('region', { name });

describe('TaskBoard (L1.1)', () => {
  it('shows one column per workflow status with its cards in order', async () => {
    setup();
    await screen.findByText('Alpha');
    const todo = column(/^To do/);
    expect(
      within(todo)
        .getAllByRole('listitem')
        .map((li) => within(li).getAllByRole('button')[0]!.textContent),
    ).toEqual(['Alpha', 'Beta']);
    expect(within(column(/^Doing/)).getByText(/1\/2/)).toBeInTheDocument();
    expect(within(column(/^Done/)).getByText('No tasks.')).toBeInTheDocument();
  });

  it('moves a card with the keyboard-friendly Move dialog', async () => {
    const backend = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Move Beta' }));
    const dialog = screen.getByRole('dialog', { name: 'Move Beta' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Column'), 's-doing');
    // In the target column, "At the top" means before Gamma.
    await userEvent.selectOptions(within(dialog).getByLabelText('Position'), 'At the top');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect(backend.callsTo('tasks:moveOnBoard')).toEqual([
      { id: B.id, statusId: 's-doing', beforeTaskId: C.id },
    ]);
  });

  it('does nothing when the Move dialog keeps the card where it is', async () => {
    const backend = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Move Alpha' }));
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(backend.callsTo('tasks:moveOnBoard')).toEqual([]);
  });

  it('moves a card by drag and drop onto another column', async () => {
    const backend = setup();
    const card = (await screen.findByText('Alpha')).closest('li')!;
    const done = column(/^Done/);
    fireEvent.dragStart(card, { dataTransfer: { setData: () => undefined } });
    fireEvent.dragOver(done);
    fireEvent.drop(done);
    await screen.findByText('Alpha');
    expect(backend.callsTo('tasks:moveOnBoard')).toEqual([
      { id: A.id, statusId: 's-done', beforeTaskId: null },
    ]);
  });
});
