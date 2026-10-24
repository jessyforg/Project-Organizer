import { useDeferredValue, useRef, useState, type FormEvent } from 'react';
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Columns3,
  List,
  Pencil,
  Plus,
  RotateCcw,
  SquarePen,
  Table2,
  Trash2,
  Workflow,
} from 'lucide-react';
import type { ProjectDetails } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { usePaletteActions } from '../../app/palette-registry';
import { useToast } from '../../app/toasts';
import { Tabs } from '../../components/Tabs';
import {
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  Loading,
  MenuButton,
  PageHeader,
  ProgressMeter,
  Swatch,
  type MenuItem,
} from '../../components/ui';
import { formatDate, localToday } from '../../lib/format';
import { TaskBoard } from '../board/TaskBoard';
import { ProjectNotes } from '../notes/ProjectNotes';
import { CoverBanner } from '../looks/Cover';
import { LooksRow } from '../looks/LooksRow';
import { useLooks, type LooksTarget } from '../looks/useLooks';
import { ActivityList } from '../activity/ActivityList';
import { ProjectMilestones } from '../milestones/ProjectMilestones';
import { useCreateNote } from '../notes/useCreateNote';
import { FilterBar, filtersToQuery, type TaskFilters } from '../tasks/FilterBar';
import { LoadMore, PAGE_SIZE } from '../tasks/LoadMore';
import { TaskList } from '../tasks/TaskList';
import { TABLE_LIMIT, TaskTable } from '../tasks/TaskTable';
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
  milestone: '',
  sort: 'priority',
};

/** Overview first (progress, dates, actions), then the project's tasks (R17). */
export function ProjectPage({
  projectId,
  milestoneId,
}: {
  projectId: string;
  /** Opens the task list filtered to this milestone (ADR-0020). */
  milestoneId?: string | undefined;
}) {
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
  return (
    <ProjectView
      key={`${projectId}:${milestoneId ?? ''}`}
      details={details.data}
      milestoneId={milestoneId}
    />
  );
}

function ProjectView({
  details,
  milestoneId,
}: {
  details: ProjectDetails;
  milestoneId: string | undefined;
}) {
  const { project, progress, statuses, suggestCompletion } = details;
  const today = localToday();
  const invalidate = useInvalidate();
  const toast = useToast();
  const { navigate } = useNavigation();
  const lookups = useLookups();
  const createNote = useCreateNote();
  const looks = useLooks();
  const [editing, setEditing] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [view, setView] = useState<'list' | 'board' | 'table'>('list');
  const [pageTab, setPageTab] = useState<'work' | 'activity'>('work');
  const [chosenFilters, setFilters] = useState({
    ...PROJECT_DEFAULTS,
    milestone: milestoneId ?? '',
  });
  const milestones = useQuery(`milestones:${project.id}`, () =>
    window.api.milestones.list({ projectId: project.id }),
  );
  // A milestone that went to the trash (or no longer exists) stops filtering the list.
  const staleMilestone =
    milestones.data !== undefined &&
    chosenFilters.milestone !== '' &&
    chosenFilters.milestone !== 'none' &&
    !milestones.data.some((m) => m.id === chosenFilters.milestone);
  const filters = staleMilestone ? { ...chosenFilters, milestone: '' } : chosenFilters;
  const tasksSection = useRef<HTMLElement>(null);
  /** From the Milestones section: the list view, filtered to that milestone. */
  const showMilestoneTasks = (id: string) => {
    setView('list');
    setFilters({ ...PROJECT_DEFAULTS, milestone: id });
    setLimit(PAGE_SIZE);
    tasksSection.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const [limit, setLimit] = useState(PAGE_SIZE);
  const deferred = useDeferredValue(filters);
  const query = {
    ...filtersToQuery(deferred),
    projectId: project.id,
    includeArchived: true,
    // The table sorts and groups in the window, so it loads every task up to its limit.
    limit: view === 'table' ? TABLE_LIMIT : limit,
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

  const setStatus = (status: 'active' | 'completed') =>
    void run(
      window.api.projects.setStatus({ id: project.id, status }),
      status === 'completed' ? 'Project marked completed.' : 'Project reopened.',
    );
  const unarchive = () =>
    void run(window.api.projects.unarchive({ id: project.id }), 'Project restored from archive.');
  const looksTarget: LooksTarget = {
    kind: 'project',
    id: project.id,
    title: project.name,
    favourite: project.favourite,
    icon: project.icon,
    cover: project.cover,
    editable: true,
  };
  // The ⋯ menu; the command palette offers it too, with the header's buttons (ADR-0018).
  const moreItems: MenuItem[] = [
    ...looks.itemsFor(looksTarget),
    {
      ...(project.status === 'active'
        ? { label: 'Mark completed', icon: CheckCircle2, onSelect: () => setStatus('completed') }
        : { label: 'Reopen project', icon: RotateCcw, onSelect: () => setStatus('active') }),
      separated: true,
    },
    archived
      ? { label: 'Unarchive', icon: ArchiveRestore, onSelect: unarchive }
      : {
          label: 'Archive',
          icon: Archive,
          onSelect: () =>
            void run(window.api.projects.archive({ id: project.id }), 'Project archived.'),
        },
    {
      label: 'Move to trash',
      icon: Trash2,
      danger: true,
      separated: true,
      onSelect: () => setConfirmTrash(true),
    },
  ];
  usePaletteActions(`Project: ${project.name}`, () => [
    ...(project.isInbox
      ? []
      : [{ label: 'Edit project', icon: Pencil, onSelect: () => setEditing(true) }]),
    { label: 'Edit workflow', icon: Workflow, onSelect: () => setWorkflowOpen(true) },
    ...(archived
      ? []
      : [
          {
            label: 'New note in this project',
            icon: SquarePen,
            onSelect: () => void createNote({ projectId: project.id }),
          },
        ]),
    ...(project.isInbox ? looks.itemsFor(looksTarget) : moreItems),
  ]);
  const tagNames = project.tagIds
    .map((t) => lookups.tags.get(t)?.name)
    .filter(Boolean)
    .join(', ');

  return (
    <div className="page">
      <CoverBanner value={project.cover} />
      <LooksRow target={looksTarget} onIcon={looks.editIcon} onCover={looks.editCover} />
      <PageHeader
        eyebrow={
          <>
            <button type="button" className="link" onClick={() => navigate({ name: 'projects' })}>
              Projects
            </button>
            <ChevronRight aria-hidden width={14} height={14} />
            <span className="truncate">{project.isInbox ? 'Inbox' : project.name}</span>
          </>
        }
        // With an icon, the tile above the title shows it; otherwise the colour does.
        leading={project.icon ? undefined : <Swatch color={project.color} />}
        title={project.name}
        titleAdornment={
          <>
            {archived && <span className="label">Archived</span>}
            {project.status === 'completed' && (
              <span className="label label--success">Completed</span>
            )}
          </>
        }
        description={project.description}
        actions={
          <>
            {!project.isInbox && (
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                <Pencil aria-hidden /> Edit
              </button>
            )}
            <button type="button" className="btn" onClick={() => setWorkflowOpen(true)}>
              <Workflow aria-hidden /> Workflow
            </button>
            {!project.isInbox && <MenuButton label="More project actions" items={moreItems} />}
          </>
        }
      />

      <Tabs
        label="Project"
        tabs={[
          { id: 'work', label: 'Work' },
          { id: 'activity', label: 'Activity' },
        ]}
        selected={pageTab}
        onSelect={setPageTab}
      >
        {pageTab === 'activity' ? (
          // The project's own changes and those of its tasks, notes, and milestones (ADR-0021).
          <ActivityList
            queryKey={`project:${project.id}`}
            load={(limit) => window.api.activity.forProject({ projectId: project.id, limit })}
            label={`Activity in ${project.name}`}
            showItem
          />
        ) : (
          <>
            <div className="panel project-head__summary">
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
                {tagNames && (
                  <div>
                    <dt>Tags</dt>
                    <dd>{tagNames}</dd>
                  </div>
                )}
              </dl>
              <div>
                <ProgressMeter progress={progress} label={`${project.name} progress`} />
                <p className="stamp">Calculated from tasks; cancelled tasks are not counted.</p>
              </div>
            </div>

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
                <button type="button" className="btn" onClick={unarchive}>
                  <ArchiveRestore aria-hidden /> Unarchive
                </button>
              </div>
            )}

            <ProjectMilestones project={project} onShowTasks={showMilestoneTasks} />

            <section className="section" aria-labelledby="project-tasks" ref={tasksSection}>
              <div className="section__header">
                <h2 id="project-tasks">Tasks</h2>
                <div className="segmented" role="group" aria-label="Task view">
                  <button
                    type="button"
                    aria-pressed={view === 'list'}
                    onClick={() => setView('list')}
                  >
                    <List aria-hidden /> List
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === 'board'}
                    onClick={() => setView('board')}
                  >
                    <Columns3 aria-hidden /> Board
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === 'table'}
                    onClick={() => setView('table')}
                  >
                    <Table2 aria-hidden /> Table
                  </button>
                </div>
              </div>
              {!archived && <InlineAdd projectId={project.id} />}
              {view === 'board' && (
                <TaskBoard
                  project={project}
                  statuses={statuses}
                  milestones={milestones.data ?? []}
                />
              )}
              {view !== 'board' && (
                <>
                  <FilterBar
                    value={filters}
                    defaults={PROJECT_DEFAULTS}
                    onChange={(next) => {
                      setFilters(next);
                      setLimit(PAGE_SIZE);
                    }}
                    tags={lookups.tagList}
                    milestones={milestones.data ?? []}
                    allowManualSort
                  />
                  {tasks.error && <ErrorNotice error={tasks.error} onRetry={tasks.reload} />}
                  {tasks.data && tasks.data.length === 0 && (
                    <div className="panel">
                      <EmptyState
                        icon={ClipboardList}
                        title={
                          JSON.stringify(filters) === JSON.stringify(PROJECT_DEFAULTS)
                            ? 'No tasks in this project yet.'
                            : 'No tasks match these filters.'
                        }
                      >
                        {JSON.stringify(filters) === JSON.stringify(PROJECT_DEFAULTS) && !archived
                          ? 'Type a title in “Add a task” above and press Enter.'
                          : null}
                      </EmptyState>
                    </div>
                  )}
                  {view === 'table' && tasks.data && tasks.data.length > 0 && (
                    <TaskTable
                      view="project"
                      tasks={tasks.data}
                      label={`Tasks in ${project.name}`}
                    />
                  )}
                  {view === 'table' && tasks.data?.length === TABLE_LIMIT && (
                    <p className="muted small">
                      Showing the first {TABLE_LIMIT.toLocaleString()} tasks. Use filters to narrow
                      the table.
                    </p>
                  )}
                  {view === 'list' && tasks.data && tasks.data.length > 0 && (
                    <TaskList
                      label={`Tasks in ${project.name}`}
                      tasks={tasks.data}
                      grouping={{ kind: 'statuses', statuses }}
                      today={today}
                      separateUndated={deferred.sort === 'due'}
                      tags={lookups.tags}
                    />
                  )}
                  {view === 'list' && tasks.data && (
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
          </>
        )}
      </Tabs>

      <ProjectDialog open={editing} project={project} onClose={() => setEditing(false)} />
      {looks.dialogs}
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
    <form className="toolbar" onSubmit={(e) => void submit(e)}>
      <div className="search-field toolbar__grow">
        <label htmlFor="inline-add" className="visually-hidden">
          Add a task
        </label>
        <Plus aria-hidden />
        <input
          id="inline-add"
          className="input"
          value={title}
          maxLength={500}
          placeholder="Add a task: type a title and press Enter"
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <button type="submit" className="btn">
        Add
      </button>
    </form>
  );
}
