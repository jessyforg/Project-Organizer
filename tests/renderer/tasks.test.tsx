import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QuickAddForm } from '../../src/renderer/app/quick-add';
import { FilterBar } from '../../src/renderer/features/tasks/FilterBar';
import { TaskDetails } from '../../src/renderer/features/tasks/TaskDetails';
import { TaskList } from '../../src/renderer/features/tasks/TaskList';
import { MY_TASKS_DEFAULTS } from '../../src/renderer/features/tasks/MyTasksPage';
import { fail, installApi, makeProject, makeTask, ok, renderWithApp, STATUSES } from './harness';

const TODAY = '2026-03-10';

describe('TaskList', () => {
  it('groups by the project workflow in order, with done collapsed', () => {
    installApi();
    renderWithApp(
      <TaskList
        label="Tasks"
        today={TODAY}
        grouping={{ kind: 'statuses', statuses: STATUSES }}
        tasks={[
          makeTask({ title: 'Doing it', statusId: 's-doing', statusCategory: 'in_progress' }),
          makeTask({ title: 'Plan it' }),
          makeTask({ title: 'Shipped', statusId: 's-done', statusCategory: 'done' }),
        ]}
      />,
    );
    const headers = screen.getAllByRole('button', { expanded: true });
    expect(headers.map((h) => h.textContent)).toEqual(['To do 1', 'Doing 1']);
    expect(screen.getByRole('button', { name: /Done/, expanded: false })).toBeInTheDocument();
    expect(screen.queryByText('Shipped')).not.toBeInTheDocument();
  });

  it('labels overdue open tasks in text, not only colour', () => {
    installApi();
    renderWithApp(
      <TaskList
        label="Tasks"
        today={TODAY}
        grouping={{ kind: 'none' }}
        tasks={[makeTask({ title: 'Late', dueDate: '2026-03-08', priority: 'urgent' })]}
      />,
    );
    expect(screen.getByText(/overdue/)).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('separates undated tasks when sorting by due date', () => {
    installApi();
    renderWithApp(
      <TaskList
        label="Tasks"
        today={TODAY}
        separateUndated
        grouping={{ kind: 'none' }}
        tasks={[
          makeTask({ title: 'Dated', dueDate: '2026-03-12' }),
          makeTask({ title: 'Undated' }),
        ]}
      />,
    );
    expect(screen.getByText('No due date')).toBeInTheDocument();
  });

  it('completes a task from its checkbox and offers to complete the parent', async () => {
    const task = makeTask({ title: 'Last subtask', parentTaskId: 'parent' });
    const backend = installApi({
      'tasks:setCompleted': () =>
        ok({ task, notices: [{ type: 'parent_may_be_complete', taskId: 'parent' }] }),
    });
    renderWithApp(
      <TaskList label="Tasks" today={TODAY} grouping={{ kind: 'none' }} tasks={[task]} />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Done: Last subtask' }));
    expect(backend.callsTo('tasks:setCompleted')).toEqual([{ id: task.id, completed: true }]);
    expect(await screen.findByRole('button', { name: 'Complete parent task' })).toBeInTheDocument();
  });
});

describe('FilterBar', () => {
  it('shows "Clear filters" only when filters differ from the defaults, and resets them', async () => {
    installApi();
    let value = MY_TASKS_DEFAULTS;
    const { rerender } = renderWithApp(
      <FilterBar
        value={value}
        defaults={MY_TASKS_DEFAULTS}
        onChange={(v) => (value = v)}
        tags={[]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Urgent' }));
    expect(value.priorities).toEqual(['urgent']);
    rerender(
      <FilterBar
        value={value}
        defaults={MY_TASKS_DEFAULTS}
        onChange={(v) => (value = v)}
        tags={[]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(value).toEqual(MY_TASKS_DEFAULTS);
  });
});

describe('QuickAddForm', () => {
  it('requires a title before calling the backend', async () => {
    const backend = installApi();
    renderWithApp(<QuickAddForm initialProjectId="" onDone={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a title for the task.');
    expect(backend.callsTo('tasks:create')).toEqual([]);
  });

  it('creates a task with the chosen project, priority, and due date', async () => {
    const backend = installApi({
      'projects:list': () =>
        ok([{ ...makeProject(), progress: { done: 0, total: 0, ratio: null } }]),
      'tasks:create': () => ok(makeTask()),
    });
    let done = false;
    renderWithApp(<QuickAddForm initialProjectId="" onDone={() => (done = true)} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Write tests');
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Website' })).toBeInTheDocument(),
    );
    await userEvent.selectOptions(screen.getByLabelText('Project'), 'p1');
    await userEvent.selectOptions(screen.getByLabelText('Priority'), 'high');
    await userEvent.type(screen.getByLabelText('Due date'), '2026-03-20');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(backend.callsTo('tasks:create')).toEqual([
      { title: 'Write tests', projectId: 'p1', priority: 'high', dueDate: '2026-03-20' },
    ]);
    expect(done).toBe(true);
  });

  it('shows the backend error message', async () => {
    installApi({
      'tasks:create': () => fail('Unarchive the project before adding tasks to it.', 'CONFLICT'),
    });
    renderWithApp(<QuickAddForm initialProjectId="" onDone={() => undefined} />);
    await userEvent.type(screen.getByLabelText('Title'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unarchive the project');
  });
});

describe('TaskDetails', () => {
  it('saves a priority change and reports failures', async () => {
    const task = makeTask({ title: 'Edit me' });
    let failNext = false;
    const backend = installApi({
      'tasks:get': () => ok(task),
      'statuses:list': () => ok(STATUSES),
      'tasks:update': () =>
        failNext ? fail('The status does not belong to this project.') : ok({ task, notices: [] }),
    });
    renderWithApp(<TaskDetails taskId={task.id} />);
    const priority = await screen.findByLabelText('Priority');
    await userEvent.selectOptions(priority, 'high');
    expect(backend.callsTo('tasks:update')).toEqual([{ id: task.id, priority: 'high' }]);

    failNext = true;
    await userEvent.selectOptions(screen.getByLabelText('Status'), 's-doing');
    const toasts = await screen.findByRole('status');
    await waitFor(() =>
      expect(
        within(toasts).getByText('The status does not belong to this project.'),
      ).toBeInTheDocument(),
    );
  });

  it('asks for confirmation, naming dependents, before moving a task to the trash', async () => {
    const task = makeTask({ title: 'Foundation' });
    const backend = installApi({
      'tasks:get': () => ok(task),
      'trash:previewTask': () =>
        ok({
          subtaskCount: 2,
          dependents: [{ id: 'd', title: 'Roof', statusCategory: 'todo', trashed: false }],
        }),
      'trash:trashTask': () => ok({ batchId: 'b1' }),
    });
    renderWithApp(<TaskDetails taskId={task.id} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Move to trash' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Its 2 subtasks will move to the trash too.');
    expect(dialog).toHaveTextContent('Roof');
    expect(backend.callsTo('trash:trashTask')).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move to trash' }));
    expect(backend.callsTo('trash:trashTask')).toEqual([{ id: task.id }]);
  });
});

describe('MyTasksPage paging', () => {
  it('says when the list may be incomplete and loads more on request', async () => {
    const { MyTasksPage } = await import('../../src/renderer/features/tasks/MyTasksPage');
    const backend = installApi({
      'tasks:list': (payload) => {
        const limit = Number(payload['limit']);
        return ok(
          Array.from({ length: Math.min(limit, 700) }, (_, i) => makeTask({ title: `T${i}` })),
        );
      },
    });
    renderWithApp(<MyTasksPage />);
    expect(
      await screen.findByText(
        'Showing the first 500 tasks. Use filters to narrow the list, or load more.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load 500 more' }));
    await waitFor(() => expect(backend.callsTo('tasks:list').at(-1)?.['limit']).toBe(1000));
    await waitFor(() => expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument());
    // Renders 500, then 700 rows: about 2 s normally, but it has exceeded 5 s on a busy machine.
  }, 15_000);
});
