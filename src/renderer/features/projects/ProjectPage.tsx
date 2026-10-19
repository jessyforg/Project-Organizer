import { useDeferredValue, useState, type FormEvent } from 'react';
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Columns3,
  List,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Workflow,
} from 'lucide-react';
import type { ProjectDetails } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import { ConfirmDialog, ErrorNotice, Loading, ProgressMeter, Swatch } from '../../components/ui';
import { formatDate, localToday } from '../../lib/format';
import { TaskBoard } from '../board/TaskBoard';
import { ProjectNotes } from '../notes/ProjectNotes';
import { FilterBar, filtersToQuery, type TaskFilters } from '../tasks/FilterBar';
import { LoadMore, PAGE_SIZE } from '../tasks/LoadMore';
import { TaskList } from '../tasks/TaskList';
import { useLookups } from '../tasks/useLookups';
import { ProjectDialog } from './ProjectDialog';
import { StatusManager } from './StatusManager';

const PROJECT_DEFAULTS: TaskFilters = {
  text: '',
  categories: [],
  priorities: [],
  due: '',
  tagId: '',
  projectId: '',
  sort: 'priority',
};

/** Overview first (progress, dates, actions), then the project's tasks (R17). */
export function ProjectPage({ projectId }: { projectId: string }) {
  const details = useQuery(`project:${projectId}`, () =>
    window.api.projects.get({ id: projectId }),
  );
  if (details.error) {
    return (
      <div className="page">
        <ErrorNotice error={details.error} onRetry={details.reload} />
      </div>
    );
  }
  if (!details.data || details.data.project.id !== projectId) {
    return (
      <div className="page">
        <Loading />
      </div>
    );
  }
  return <ProjectView key={projectId} details={details.data} />;
}

function ProjectView({ details }: { details: ProjectDetails }) {
  const { project, progress, statuses, suggestCompletion } = details;
  const today = localToday();
  const invalidate = useInvalidate();
  const toast = useToast();
  const { navigate } = useNavigation();
  const lookups = useLookups();
  const [editing, setEditing] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [filters, setFilters] = useState(PROJECT_DEFAULTS);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const deferred = useDeferredValue(filters);
  const query = {
    ...filtersToQuery(deferred),
    projectId: project.id,
    includeArchived: true,
    limit,
  };
  const tasks = useQuery(`project-tasks:${JSON.stringify(query)}`, () =>
    window.api.tasks.list(query),
  );

  const run = async (
    promise: Promise<{ ok: boolean; error?: { message: string } }>,
    done?: string,
  ) => {
    const result = await promise;
    invalidate();
    if (!result.ok && result.error) toast({ message: result.error.message, tone: 'error' });
    else if (done) toast({ message: done });
  };

  const trash = async () => {
    setConfirmTrash(false);
    const result = await window.api.trash.trashProject({ id: project.id });
    invalidate();
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    navigate({ name: 'projects' });
    const { batchId } = result.data;
    toast({
      message: `“${project.name}” moved to trash.`,
      actions: [
        {
          label: 'Undo',
          run: async () => {
            const r = await window.api.trash.restore({ batchId });
            if (!r.ok) toast({ message: r.error.message, tone: 'error' });
            invalidate();
            navigate({ name: 'project', id: project.id });
          },
        },
      ],
    });
  };

  const archived = project.archivedAt !== null;

  return (
    <div className="page">
      <header className="project-head">
        <div className="project-head__title">
          <Swatch color={project.color} />
          <h1>{project.name}</h1>
          {archived && <span className="label">Archived</span>}
          {project.status === 'completed' && <span className="label">Completed</span>}
        </div>
        {project.description && <p className="muted">{project.description}</p>}
        <dl className="facts">
          <div>
            <dt>Type</dt>
            <dd>{project.kind === 'software' ? 'Software development' : 'General'}</dd>
          </div>
          {project.startDate && (
            <div>
              <dt>Starts</dt>
              <dd>{formatDate(project.startDate, today)}</dd>
            </div>
          )}
          {project.targetDate && (
            <div>
              <dt>Target</dt>
              <dd>{formatDate(project.targetDate, today)}</dd>
            </div>
          )}
          {project.tagIds.length > 0 && (
            <div>
              <dt>Tags</dt>
              <dd>
                {project.tagIds
                  .map((t) => lookups.tags.get(t)?.name)
                  .filter(Boolean)
                  .join(', ')}
              </dd>
            </div>
          )}
        </dl>
        <div style={{ maxWidth: 420 }}>
          <ProgressMeter progress={progress} label={`${project.name} progress`} />
          <p className="stamp">Calculated from tasks; cancelled tasks are not counted.</p>
        </div>
        <div className="page__actions">
          {!project.isInbox && (
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              <Pencil aria-hidden /> Edit
            </button>
          )}
          <button type="button" className="btn" onClick={() => setWorkflowOpen(true)}>
            <Workflow aria-hidden /> Workflow
          </button>
          {!project.isInbox &&
            (project.status === 'active' ? (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void run(
                    window.api.projects.setStatus({ id: project.id, status: 'completed' }),
                    'Project marked completed.',
                  )
                }
              >
                <CheckCircle2 aria-hidden /> Mark completed
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void run(
                    window.api.projects.setStatus({ id: project.id, status: 'active' }),
                    'Project reopened.',
                  )
                }
              >
                <RotateCcw aria-hidden /> Reopen project
              </button>
            ))}
          {!project.isInbox &&
            (archived ? (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void run(
                    window.api.projects.unarchive({ id: project.id }),
                    'Project restored from archive.',
                  )
                }
              >
                <ArchiveRestore aria-hidden /> Unarchive
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void run(window.api.projects.archive({ id: project.id }), 'Project archived.')
                }
              >
                <Archive aria-hidden /> Archive
              </button>
            ))}
          {!project.isInbox && (
            <button type="button" className="btn btn--danger" onClick={() => setConfirmTrash(true)}>
              <Trash2 aria-hidden /> Move to trash
            </button>
          )}
        </div>
      </header>

      {suggestCompletion && (
        <div className="notice">
          <p>Every task in this project is done.</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() =>
              void run(
                window.api.projects.setStatus({ id: project.id, status: 'completed' }),
                'Project marked completed.',
              )
            }
          >
            Mark project completed
          </button>
        </div>
      )}
      {archived && (
        <div className="notice">
          <p>This project is archived. Unarchive it to add tasks.</p>
        </div>
      )}

      <section className="section" aria-labelledby="project-tasks">
        <div className="section__header">
          <h2 id="project-tasks">Tasks</h2>
          <div className="view-switch" role="group" aria-label="Task view">
            <button
              type="button"
              className="chip"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <List aria-hidden /> List
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={view === 'board'}
              onClick={() => setView('board')}
            >
              <Columns3 aria-hidden /> Board
            </button>
          </div>
        </div>
        {!archived && <InlineAdd projectId={project.id} />}
        {view === 'board' && <TaskBoard project={project} statuses={statuses} />}
        {view === 'list' && (
          <>
            <FilterBar
              value={filters}
              defaults={PROJECT_DEFAULTS}
              onChange={(next) => {
                setFilters(next);
                setLimit(PAGE_SIZE);
              }}
              tags={lookups.tagList}
              allowManualSort
            />
            {tasks.error && <ErrorNotice error={tasks.error} onRetry={tasks.reload} />}
            {tasks.data && tasks.data.length === 0 && (
              <div className="empty">
                <p>
                  {JSON.stringify(filters) === JSON.stringify(PROJECT_DEFAULTS)
                    ? 'No tasks in this project yet.'
                    : 'No tasks match these filters.'}
                </p>
              </div>
            )}
            {tasks.data && tasks.data.length > 0 && (
              <TaskList
                label={`Tasks in ${project.name}`}
                tasks={tasks.data}
                grouping={{ kind: 'statuses', statuses }}
                today={today}
                separateUndated={deferred.sort === 'due'}
                tags={lookups.tags}
              />
            )}
            {tasks.data && (
              <LoadMore
                shown={tasks.data.length}
                limit={limit}
                onMore={() => setLimit((l) => l + PAGE_SIZE)}
              />
            )}
          </>
        )}
      </section>

      <ProjectNotes project={project} />

      <ProjectDialog open={editing} project={project} onClose={() => setEditing(false)} />
      <StatusManager
        open={workflowOpen}
        projectId={project.id}
        statuses={statuses}
        onClose={() => setWorkflowOpen(false)}
      />
      <ConfirmDialog
        open={confirmTrash}
        title={`Move “${project.name}” to the trash?`}
        body="Its tasks move to the trash with it. You can restore the project from the trash for 30 days."
        confirmLabel="Move to trash"
        danger
        onCancel={() => setConfirmTrash(false)}
        onConfirm={() => void trash()}
      />
    </div>
  );
}

function InlineAdd({ projectId }: { projectId: string }) {
  const [title, setTitle] = useState('');
  const invalidate = useInvalidate();
  const toast = useToast();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const result = await window.api.tasks.create({ title, projectId });
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    setTitle('');
    invalidate();
  };
  return (
    <form className="filters" onSubmit={(e) => void submit(e)}>
      <div className="field filters__search">
        <label htmlFor="inline-add">Add a task</label>
        <input
          id="inline-add"
          className="input"
          value={title}
          maxLength={500}
          placeholder="Task title, then Enter"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <button type="submit" className="btn">
        <Plus aria-hidden /> Add
      </button>
    </form>
  );
}
