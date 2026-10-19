import { useId, useState, type KeyboardEvent } from 'react';
import { CornerLeftUp, Trash2, X } from 'lucide-react';
import { PRIORITIES, type Priority, type Task, type TaskTrashPreview } from '@shared/domain';
import type { UpdateTaskInput } from '@shared/schemas';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import { TagPicker } from '../../components/TagPicker';
import { ConfirmDialog, ErrorNotice, Loading } from '../../components/ui';
import { CATEGORY_LABEL, formatTimestamp, plural, PRIORITY_LABEL } from '../../lib/format';
import { CompleteCheckbox } from './CompleteCheckbox';
import { useLookups } from './useLookups';
import { useTaskActions } from './useTaskActions';

/** Side panel for the selected task. Every field saves on change (or on blur for text). */
export function TaskDetails({ taskId }: { taskId: string }) {
  const { openTask } = useNavigation();
  const task = useQuery(`task:${taskId}`, () => window.api.tasks.get({ id: taskId }));

  return (
    <aside className="details" aria-label="Task details">
      <div className="task-details">
        <div className="task-details__top">
          <span className="muted small">Task</span>
          <button
            type="button"
            className="btn btn--quiet btn--icon"
            aria-label="Close task details"
            onClick={() => openTask(null)}
          >
            <X aria-hidden />
          </button>
        </div>
        {task.error && <ErrorNotice error={task.error} onRetry={task.reload} />}
        {task.loading && !task.data && <Loading />}
        {task.data && task.data.id === taskId && <TaskEditor key={task.data.id} task={task.data} />}
      </div>
    </aside>
  );
}

function TaskEditor({ task }: { task: Task }) {
  const id = useId();
  const { openTask } = useNavigation();
  const { applyUpdate } = useTaskActions();
  const invalidate = useInvalidate();
  const toast = useToast();
  const lookups = useLookups();
  const statuses = useQuery(`statuses:${task.projectId}`, () =>
    window.api.statuses.list({ projectId: task.projectId }),
  );
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [trashPreview, setTrashPreview] = useState<TaskTrashPreview | null>(null);

  // When the saved task changes (after a save or reload), adopt the new text.
  const [savedText, setSavedText] = useState({ title: task.title, description: task.description });
  if (savedText.title !== task.title || savedText.description !== task.description) {
    setSavedText({ title: task.title, description: task.description });
    setTitle(task.title);
    setDescription(task.description ?? '');
  }

  const update = async (patch: Omit<UpdateTaskInput, 'id'>) =>
    applyUpdate(await window.api.tasks.update({ id: task.id, ...patch }));

  const saveTitle = async () => {
    if (title.trim() === task.title) return;
    if (!title.trim()) {
      setTitle(task.title);
      toast({ message: 'A task needs a title.', tone: 'error' });
      return;
    }
    await update({ title });
  };

  const saveDescription = async () => {
    const next = description.trim() ? description : null;
    if (next === task.description) return;
    await update({ description: next });
  };

  const move = async (projectId: string) => {
    const result = await window.api.tasks.move({ id: task.id, projectId });
    invalidate();
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    const removed = result.data.removedDependencies;
    toast({
      message:
        removed > 0
          ? `Task moved. ${plural(removed, 'dependency', 'dependencies')} to tasks in the old project removed.`
          : 'Task moved.',
    });
  };

  const askTrash = async () => {
    const result = await window.api.trash.previewTask({ id: task.id });
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    setTrashPreview(result.data);
  };

  const confirmTrash = async () => {
    setTrashPreview(null);
    const result = await window.api.trash.trashTask({ id: task.id });
    invalidate();
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    openTask(null);
    const { batchId } = result.data;
    toast({
      message: 'Task moved to trash.',
      actions: [
        {
          label: 'Undo',
          run: async () => {
            const restored = await window.api.trash.restore({ batchId });
            if (!restored.ok) toast({ message: restored.error.message, tone: 'error' });
            invalidate();
          },
        },
      ],
    });
  };

  const titleKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      // Titles are single-line; Enter saves.
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      setTitle(task.title);
      event.stopPropagation();
    }
  };

  const projects = lookups.projectList.filter((p) => p.archivedAt === null);

  return (
    <>
      {task.parentTaskId && (
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => openTask(task.parentTaskId)}
        >
          <CornerLeftUp aria-hidden /> Open parent task
        </button>
      )}
      <label className="visually-hidden" htmlFor={`${id}-title`}>
        Title
      </label>
      <textarea
        id={`${id}-title`}
        className="task-details__title"
        rows={1}
        value={title}
        maxLength={500}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
        onBlur={() => void saveTitle()}
        onKeyDown={titleKey}
      />

      <div className="task-details__grid">
        <div className="field">
          <label htmlFor={`${id}-status`}>Status</label>
          <select
            id={`${id}-status`}
            className="select"
            value={task.statusId}
            onChange={(e) => void update({ statusId: e.target.value })}
          >
            {(statuses.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.name !== CATEGORY_LABEL[s.category] ? ` (${CATEGORY_LABEL[s.category]})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-priority`}>Priority</label>
          <select
            id={`${id}-priority`}
            className="select"
            value={task.priority ?? ''}
            onChange={(e) =>
              void update({ priority: e.target.value ? (e.target.value as Priority) : null })
            }
          >
            <option value="">No priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-start`}>Start date</label>
          <input
            id={`${id}-start`}
            className="input"
            type="date"
            value={task.startDate ?? ''}
            onChange={(e) => void update({ startDate: e.target.value || null })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-due`}>Due date</label>
          <input
            id={`${id}-due`}
            className="input"
            type="date"
            value={task.dueDate ?? ''}
            onChange={(e) => void update({ dueDate: e.target.value || null })}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor={`${id}-project`}>Project</label>
        <select
          id={`${id}-project`}
          className="select"
          value={task.projectId}
          disabled={task.parentTaskId !== null}
          aria-describedby={task.parentTaskId ? `${id}-project-hint` : undefined}
          onChange={(e) => void move(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {task.parentTaskId && (
          <p id={`${id}-project-hint`} className="field__hint">
            Subtasks move with their parent task.
          </p>
        )}
      </div>

      <TaskTags task={task} />

      <div className="field">
        <label htmlFor={`${id}-description`}>Description</label>
        <textarea
          id={`${id}-description`}
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => void saveDescription()}
        />
      </div>

      {task.parentTaskId === null && <Subtasks task={task} />}
      <Dependencies task={task} />

      <div className="section">
        <p className="stamp">
          Created {formatTimestamp(task.createdAt)}. Updated {formatTimestamp(task.updatedAt)}.
          {task.completedAt && ` Completed ${formatTimestamp(task.completedAt)}.`}
        </p>
        <div>
          <button type="button" className="btn btn--danger" onClick={() => void askTrash()}>
            <Trash2 aria-hidden /> Move to trash
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={trashPreview !== null}
        title="Move this task to the trash?"
        confirmLabel="Move to trash"
        danger
        onCancel={() => setTrashPreview(null)}
        onConfirm={() => void confirmTrash()}
        body={
          trashPreview && (
            <>
              <p>
                {trashPreview.subtaskCount > 0
                  ? `Its ${plural(trashPreview.subtaskCount, 'subtask')} will move to the trash too. `
                  : ''}
                You can restore it from the trash for 30 days.
              </p>
              {trashPreview.dependents.length > 0 && (
                <p>
                  These tasks depend on it: {trashPreview.dependents.map((d) => d.title).join(', ')}
                  .
                </p>
              )}
            </>
          )
        }
      />
    </>
  );
}

function TaskTags({ task }: { task: Task }) {
  const invalidate = useInvalidate();
  const toast = useToast();
  const setTags = async (tagIds: string[]) => {
    const result = await window.api.tags.setTaskTags({ taskId: task.id, tagIds });
    if (!result.ok) toast({ message: result.error.message, tone: 'error' });
    invalidate();
  };
  return <TagPicker selected={task.tagIds} onChange={setTags} />;
}

function Subtasks({ task }: { task: Task }) {
  const { openTask } = useNavigation();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const subtasks = useQuery(`subtasks:${task.id}`, () =>
    window.api.tasks.list({ parentTaskId: task.id, sort: 'manual' }),
  );

  const add = async () => {
    if (!title.trim()) return;
    const result = await window.api.tasks.create({ title, parentTaskId: task.id });
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    setTitle('');
    invalidate();
  };

  return (
    <section className="section" aria-label="Subtasks">
      <h3>Subtasks</h3>
      <ul className="mini-list">
        {(subtasks.data ?? []).map((sub) => (
          <li key={sub.id}>
            <CompleteCheckbox task={sub} />
            <button type="button" className="link" onClick={() => openTask(sub.id)}>
              {sub.title}
            </button>
          </li>
        ))}
      </ul>
      <input
        className="input"
        value={title}
        aria-label="New subtask title"
        placeholder="Add a subtask, then Enter"
        maxLength={500}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void add();
          }
        }}
      />
    </section>
  );
}

function Dependencies({ task }: { task: Task }) {
  const id = useId();
  const { openTask } = useNavigation();
  const invalidate = useInvalidate();
  const toast = useToast();
  const relations = useQuery(`deps:${task.id}`, () =>
    window.api.dependencies.list({ taskId: task.id }),
  );
  const candidates = useQuery(`dep-candidates:${task.projectId}`, () =>
    window.api.tasks.list({ projectId: task.projectId, includeArchived: true, sort: 'manual' }),
  );

  const run = async (promise: Promise<{ ok: boolean; error?: { message: string } }>) => {
    const result = await promise;
    if (!result.ok && result.error) toast({ message: result.error.message, tone: 'error' });
    invalidate();
  };

  const prerequisites = relations.data?.prerequisites ?? [];
  const dependents = relations.data?.dependents ?? [];
  const linked = new Set([task.id, ...prerequisites.map((p) => p.id)]);
  const options = (candidates.data ?? []).filter((t) => !linked.has(t.id));

  return (
    <section className="section" aria-label="Dependencies">
      <h3>Waiting on</h3>
      {prerequisites.length === 0 && <p className="muted small">No prerequisites.</p>}
      <ul className="mini-list">
        {prerequisites.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="link"
              disabled={p.trashed}
              onClick={() => openTask(p.id)}
            >
              {p.title}
            </button>
            <span className="muted small">
              {p.trashed ? 'In trash' : CATEGORY_LABEL[p.statusCategory]}
            </span>
            <button
              type="button"
              className="btn btn--quiet btn--icon"
              aria-label={`Remove dependency on ${p.title}`}
              onClick={() =>
                void run(window.api.dependencies.remove({ taskId: task.id, dependsOnTaskId: p.id }))
              }
            >
              <X aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {options.length > 0 && (
        <div className="field">
          <label htmlFor={`${id}-add`}>Add a prerequisite</label>
          <select
            id={`${id}-add`}
            className="select"
            value=""
            onChange={(e) =>
              void run(
                window.api.dependencies.add({ taskId: task.id, dependsOnTaskId: e.target.value }),
              )
            }
          >
            <option value="">Choose a task in this project</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {dependents.length > 0 && (
        <>
          <h3>Blocking</h3>
          <ul className="mini-list">
            {dependents.map((d) => (
              <li key={d.id}>
                <button type="button" className="link" onClick={() => openTask(d.id)}>
                  {d.title}
                </button>
                <span className="muted small">{CATEGORY_LABEL[d.statusCategory]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
