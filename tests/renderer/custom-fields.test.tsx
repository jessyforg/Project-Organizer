import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CustomField } from '../../src/shared/domain';
import { describeActivity } from '../../src/renderer/features/activity/describe';
import { FieldsDialog } from '../../src/renderer/features/fields/FieldsDialog';
import { TaskFields } from '../../src/renderer/features/fields/TaskFields';
import { TaskTable } from '../../src/renderer/features/tasks/TaskTable';
import { fail, installApi, makeProject, makeTask, ok, renderWithApp, STATUSES } from './harness';

const AREA = '11111111-1111-4111-8111-111111111111';
const FRONT = '22222222-2222-4222-8222-222222222222';
const BACK = '33333333-3333-4333-8333-333333333333';
const ESTIMATE = '44444444-4444-4444-8444-444444444444';

const field = (overrides: Partial<CustomField>): CustomField => ({
  id: AREA,
  projectId: 'p1',
  name: 'Area',
  type: 'select',
  options: [
    { id: FRONT, label: 'Front end' },
    { id: BACK, label: 'Back end' },
  ],
  sortKey: 1024,
  valueCount: 0,
  ...overrides,
});
const FIELDS = [field({}), field({ id: ESTIMATE, name: 'Estimate', type: 'number', options: [] })];

describe('the fields dialog (ADR-0023)', () => {
  it('adds a field with choices, and shows why a type change was refused', async () => {
    const backend = installApi({
      'customFields:list': () => ok(FIELDS),
      'customFields:create': () => ok(FIELDS[0]),
      'customFields:changeType': () =>
        fail(
          '1 value cannot become a number: “about 2” (Write copy). Change or clear it first.',
          'CONFLICT',
        ),
    });
    renderWithApp(
      <FieldsDialog open projectId="p1" projectName="Website" onClose={() => undefined} />,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Custom fields' });
    await within(dialog).findByRole('group', { name: 'Choices of Area' });

    const add = within(dialog).getByRole('heading', { name: 'Add a field' }).parentElement!;
    fireEvent.change(within(add).getByLabelText('Name'), { target: { value: 'Labels' } });
    fireEvent.change(within(add).getByLabelText('Type'), { target: { value: 'multi_select' } });
    fireEvent.change(within(add).getByLabelText('Choices, separated by commas'), {
      target: { value: 'Bug, UX ,' },
    });
    fireEvent.click(within(add).getByRole('button', { name: 'Add field' }));
    await waitFor(() =>
      expect(backend.callsTo('customFields:create')).toEqual([
        { projectId: 'p1', name: 'Labels', type: 'multi_select', options: ['Bug', 'UX'] },
      ]),
    );

    fireEvent.change(within(dialog).getByLabelText('Type of field Area'), {
      target: { value: 'number' },
    });
    expect((await within(dialog).findByRole('alert')).textContent).toContain(
      '“about 2” (Write copy)',
    );
  });

  it('adds and removes choices, keeping the other choices’ IDs', async () => {
    const backend = installApi({
      'customFields:list': () => ok(FIELDS),
      'customFields:update': () => ok(FIELDS[0]),
    });
    renderWithApp(
      <FieldsDialog open projectId="p1" projectName="Website" onClose={() => undefined} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Remove choice Back end' }));
    await waitFor(() =>
      expect(backend.callsTo('customFields:update')[0]).toEqual({
        id: AREA,
        options: [{ id: FRONT, label: 'Front end' }],
      }),
    );
    const input = screen.getByLabelText('New choice for Area');
    fireEvent.change(input, { target: { value: 'Docs' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() =>
      expect(backend.callsTo('customFields:update')[1]?.['options']).toEqual([
        ...FIELDS[0]!.options,
        { label: 'Docs' },
      ]),
    );
  });
});

describe('the Fields section of a task (ADR-0023)', () => {
  it('saves each field from its editor', async () => {
    const backend = installApi({ 'customFields:list': () => ok(FIELDS) });
    renderWithApp(
      <TaskFields
        task={makeTask({ id: 't1', customValues: { [ESTIMATE]: 3 } })}
        projectName="Website"
      />,
    );
    const estimate = await screen.findByLabelText('Estimate');
    expect(estimate).toHaveProperty('value', '3');
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: BACK } });
    fireEvent.change(estimate, { target: { value: '5.5' } });
    fireEvent.blur(estimate);
    await waitFor(() =>
      expect(backend.callsTo('customFields:setValue')).toEqual([
        { taskId: 't1', fieldId: AREA, value: BACK },
        { taskId: 't1', fieldId: ESTIMATE, value: 5.5 },
      ]),
    );
  });
});

describe('custom fields in the table (ADR-0023)', () => {
  const tasks = [
    makeTask({ id: 'a', title: 'Alpha', customValues: { [AREA]: BACK, [ESTIMATE]: 2 } }),
    makeTask({ id: 'b', title: 'Bravo', customValues: { [AREA]: FRONT } }),
    makeTask({ id: 'c', title: 'Charlie' }),
  ];
  function setup() {
    const backend = installApi({
      'statuses:listAll': () => ok(STATUSES),
      'milestones:listAll': () => ok([]),
      'projects:list': () => ok([makeProject()]),
    });
    renderWithApp(<TaskTable view="project" tasks={tasks} label="Tasks" fields={FIELDS} />);
    return backend;
  }
  const titles = () =>
    [...document.querySelectorAll('[data-col="0"]')].map((cell) => cell.textContent);

  it('shows fields as columns that filter, group, and edit', async () => {
    const backend = setup();
    const grid = await screen.findByRole('grid', { name: 'Tasks' });
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(expect.arrayContaining(['Area', 'Estimate']));

    fireEvent.change(screen.getByLabelText('Field filter'), { target: { value: AREA } });
    fireEvent.change(screen.getByLabelText('Value of Area'), { target: { value: FRONT } });
    expect(titles()).toEqual(['Bravo']);
    fireEvent.change(screen.getByLabelText('Field filter'), { target: { value: '' } });

    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: `field:${AREA}` } });
    expect(
      [...document.querySelectorAll('.task-table__group')].map((g) => g.firstChild?.textContent),
    ).toEqual(['Front end', 'Back end', 'No area']);
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'none' } });

    const columns = within(grid)
      .getAllByRole('columnheader')
      .map((h) => h.textContent);
    const estimateCol = columns.indexOf('Estimate');
    const cell = document.querySelector<HTMLElement>(`[data-row="0"][data-col="${estimateCol}"]`)!;
    act(() => cell.focus());
    fireEvent.keyDown(cell, { key: 'Enter' });
    const input = screen.getByRole('spinbutton', { name: 'Estimate of Alpha' });
    fireEvent.change(input, { target: { value: '8' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(backend.callsTo('customFields:setValue')).toEqual([
        { taskId: 'a', fieldId: ESTIMATE, value: 8 },
      ]),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(backend.callsTo('customFields:setValue').at(-1)).toEqual({
        taskId: 'a',
        fieldId: ESTIMATE,
        value: 2,
      }),
    );
  });

  it('describes field changes in the activity log', () => {
    expect(
      describeActivity(
        {
          id: 1,
          at: '2026-03-10T09:00:00.000Z',
          itemKind: 'task',
          itemId: 'a',
          projectId: 'p1',
          title: 'Alpha',
          action: 'changed',
          field: 'custom:Estimate',
          oldValue: '2',
          newValue: '8',
          live: true,
        },
        '2026-03-10',
      ),
    ).toBe('Estimate changed from 2 to 8');
  });
});
