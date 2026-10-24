import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Task, TaskTableColumn } from '../../src/shared/domain';
import { TaskTable } from '../../src/renderer/features/tasks/TaskTable';
import {
  normalizeLayout,
  sortTasks,
  tableRows,
  type Lookups,
} from '../../src/renderer/features/tasks/table-model';
import { installApi, makeProject, makeTask, ok, renderWithApp, STATUSES } from './harness';

const lookups: Lookups = {
  statuses: new Map(STATUSES.map((s) => [s.id, s])),
  milestones: new Map(),
  projects: new Map([['p1', makeProject()]]),
  tags: new Map(),
  today: '2026-03-10',
};

describe('the table model (ADR-0022)', () => {
  it('repairs saved layouts: unknown and repeated columns go, Title is shown and first', () => {
    const saved: TaskTableColumn[] = [
      { id: 'priority', width: 9999, hidden: false },
      { id: 'title', width: 200, hidden: true },
      { id: 'nonsense', width: 100, hidden: false },
      { id: 'priority', width: 100, hidden: true },
    ];
    const layout = normalizeLayout('project', saved);
    expect(layout[0]).toEqual({ id: 'title', width: 200, hidden: false });
    expect(layout[1]).toEqual({ id: 'priority', width: 800, hidden: false });
    expect(layout.map((c) => c.id)).not.toContain('nonsense');
    expect(layout.map((c) => c.id)).not.toContain('project');
    expect(normalizeLayout('myTasks', undefined).map((c) => c.id)).toContain('project');
  });

  it('sorts with empty cells last in both directions, and priority from urgent to low', () => {
    const tasks = [
      makeTask({ id: 'a', title: 'A', priority: 'low', dueDate: null }),
      makeTask({ id: 'b', title: 'B', priority: null, dueDate: '2026-03-01' }),
      makeTask({ id: 'c', title: 'C', priority: 'urgent', dueDate: '2026-04-01' }),
    ];
    const ids = (column: 'priority' | 'dueDate', direction: 'ascending' | 'descending') =>
      sortTasks(tasks, { column, direction }, lookups).map((t) => t.id);
    expect(ids('priority', 'ascending')).toEqual(['c', 'a', 'b']);
    expect(ids('priority', 'descending')).toEqual(['a', 'c', 'b']);
    expect(ids('dueDate', 'descending')).toEqual(['c', 'b', 'a']);
  });

  it('groups with a header row per group, in the column’s order', () => {
    const rows = tableRows(
      [
        makeTask({ title: 'Low', priority: 'low' }),
        makeTask({ title: 'None', priority: null }),
        makeTask({ title: 'High', priority: 'high' }),
      ],
      'priority',
      lookups,
    );
    expect(
      rows.map((r) => (r.kind === 'group' ? `# ${r.label} ${r.count}` : r.task.title)),
    ).toEqual(['# High 1', 'High', '# Low 1', 'Low', '# No priority 1', 'None']);
  });
});

function setup(tasks: Task[]) {
  const backend = installApi({
    'statuses:listAll': () => ok(STATUSES),
    'milestones:listAll': () => ok([]),
    'projects:list': () => ok([makeProject()]),
    'tasks:update': (payload) =>
      ok({ task: makeTask({ ...(payload as Partial<Task>) }), notices: [] }),
  });
  renderWithApp(<TaskTable view="project" tasks={tasks} label="Tasks in Website" />);
  return backend;
}

const cell = (row: number, col: number) =>
  document.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)!;

describe('the task table (ADR-0022)', () => {
  it('renders only the rows in view out of 5,000, and says how many there are', async () => {
    setup(Array.from({ length: 5000 }, (_, i) => makeTask({ id: `t${i}`, title: `Task ${i}` })));
    const grid = await screen.findByRole('grid', { name: 'Tasks in Website' });
    expect(grid.getAttribute('aria-rowcount')).toBe('5001');
    const rendered = within(grid).getAllByRole('row');
    expect(rendered.length).toBeLessThan(60);
    expect(rendered.at(-1)!.getAttribute('aria-rowindex')).toBe(String(rendered.length));
  });

  it('moves between cells with the keyboard as one Tab stop', async () => {
    setup([makeTask({ id: 'a', title: 'A' }), makeTask({ id: 'b', title: 'B' })]);
    await screen.findByRole('grid');
    expect(document.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1);
    act(() => cell(0, 0).focus());
    fireEvent.keyDown(cell(0, 0), { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toBe(cell(1, 0)));
    fireEvent.keyDown(cell(1, 0), { key: 'End' });
    await waitFor(() => expect(document.activeElement).toBe(cell(1, 5)));
    fireEvent.keyDown(cell(1, 5), { key: 'Home', ctrlKey: true });
    await waitFor(() => expect(document.activeElement).toBe(cell(0, 0)));
  });

  it('edits a cell through the task update, with Undo; Escape cancels', async () => {
    const backend = setup([makeTask({ id: 'a', title: 'Ship', priority: 'low' })]);
    await screen.findByRole('grid');
    // Columns: Title, Status, Priority, ...
    act(() => cell(0, 2).focus());
    fireEvent.keyDown(cell(0, 2), { key: 'Enter' });
    const select = screen.getByRole('combobox', { name: 'Priority of Ship' });
    fireEvent.change(select, { target: { value: 'urgent' } });
    await waitFor(() =>
      expect(backend.callsTo('tasks:update')).toEqual([{ id: 'a', priority: 'urgent' }]),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(backend.callsTo('tasks:update').at(-1)).toEqual({ id: 'a', priority: 'low' }),
    );

    fireEvent.keyDown(cell(0, 0), { key: 'F2' });
    const title = screen.getByRole('textbox', { name: 'Title of Ship' });
    fireEvent.change(title, { target: { value: 'Never saved' } });
    fireEvent.keyDown(title, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Title of Ship' })).toBeNull();
    expect(backend.callsTo('tasks:update')).toHaveLength(2);
  });

  it('sorts from its headers and saves column changes and widths per view', async () => {
    const backend = setup([makeTask({ title: 'B' }), makeTask({ title: 'A' })]);
    /** A column of the project layout in the latest saved settings. */
    const savedColumn = (id: string) =>
      (
        backend.callsTo('settings:update').at(-1) as
          { taskTables: { project: TaskTableColumn[] } } | undefined
      )?.taskTables.project.find((c) => c.id === id);
    const grid = await screen.findByRole('grid');
    const header = within(grid).getAllByRole('columnheader')[0]!;
    fireEvent.click(within(header).getByRole('button', { name: 'Title' }));
    expect(header.getAttribute('aria-sort')).toBe('ascending');
    expect(cell(0, 0).textContent).toBe('A');

    fireEvent.keyDown(within(header).getByRole('separator', { name: 'Resize Title' }), {
      key: 'ArrowRight',
    });
    await waitFor(() =>
      expect(savedColumn('title')).toEqual({ id: 'title', width: 296, hidden: false }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    const dialog = screen.getByRole('dialog', { name: 'Table columns' });
    expect(within(dialog).getByRole('checkbox', { name: 'Title' })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Tags' }));
    await waitFor(() => expect(savedColumn('tags')?.hidden).toBe(true));
  });
});
