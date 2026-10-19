import { CalendarCheck, FolderKanban, Plus } from 'lucide-react';
import type { Task } from '@shared/domain';
import { useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useQuickAdd } from '../../app/quick-add';
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeader,
  ProgressMeter,
  Swatch,
} from '../../components/ui';
import { formatLongDate, plural } from '../../lib/format';
import { TaskRow } from '../tasks/TaskList';
import { useLookups } from '../tasks/useLookups';

/** "Today": what needs attention now, then what is coming, then project progress (R16). */
export function DashboardPage() {
  const dashboard = useQuery('dashboard', () => window.api.dashboard.get());
  const lookups = useLookups();
  const quickAdd = useQuickAdd();
  const { navigate } = useNavigation();

  if (dashboard.error) {
    return (
      <div className="page">
        <ErrorNotice error={dashboard.error} onRetry={dashboard.reload} />
      </div>
    );
  }
  const d = dashboard.data;
  if (!d) {
    return (
      <div className="page">
        <Loading />
      </div>
    );
  }

  const nothingScheduled = d.overdue.length + d.dueToday.length + d.upcoming.length === 0;

  const list = (title: string, tasks: Task[], options: { empty?: string; alert?: boolean } = {}) =>
    tasks.length === 0 && !options.empty ? null : (
      <section
        className={`dash-section${options.alert ? ' dash-section--alert' : ''}`}
        aria-label={title}
      >
        <div className="dash-section__header">
          <h2>{title}</h2>
          {tasks.length > 0 && <span className="count">{tasks.length}</span>}
        </div>
        {tasks.length === 0 ? (
          <p className="muted small" style={{ padding: '0 var(--space-1)' }}>
            {options.empty}
          </p>
        ) : (
          <ul className="task-list">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                today={d.today}
                project={lookups.projects.get(task.projectId)}
                tags={lookups.tags}
              />
            ))}
          </ul>
        )}
      </section>
    );

  return (
    <div className="page">
      <PageHeader
        title="Today"
        description={`${formatLongDate(d.today)} · ${plural(d.openTaskCount, 'open task')} · ${d.completedThisWeek} completed in the last 7 days`}
        actions={
          <button type="button" className="btn btn--primary" onClick={() => quickAdd()}>
            <Plus aria-hidden /> New task
          </button>
        }
      />

      <div className="columns">
        <div className="section" style={{ gap: 'var(--space-5)' }}>
          {list('Overdue', d.overdue, { alert: true })}
          {list('Due today', d.dueToday, {
            ...(nothingScheduled ? {} : { empty: 'Nothing else is due today.' }),
          })}
          {list('Next 7 days', d.upcoming)}
          {nothingScheduled && (
            <div className="panel">
              <EmptyState
                icon={CalendarCheck}
                title="Nothing is due in the next week."
                action={
                  <button type="button" className="btn" onClick={() => navigate({ name: 'tasks' })}>
                    See all tasks
                  </button>
                }
              >
                Add due dates to tasks to see them here.
              </EmptyState>
            </div>
          )}
          {list('Recently updated', d.recentlyUpdated)}
        </div>

        <div className="section" style={{ gap: 'var(--space-5)' }}>
          <section className="dash-section" aria-label="Active projects">
            <div className="dash-section__header">
              <h2>Active projects</h2>
              {d.activeProjects.length > 0 && (
                <span className="count">{d.activeProjects.length}</span>
              )}
            </div>
            <div className="panel">
              {d.activeProjects.length === 0 ? (
                <EmptyState
                  compact
                  icon={FolderKanban}
                  title="No active projects."
                  action={
                    <button
                      type="button"
                      className="btn"
                      onClick={() => navigate({ name: 'projects' })}
                    >
                      Go to projects
                    </button>
                  }
                />
              ) : (
                <ul className="project-progress">
                  {d.activeProjects.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="link"
                        title={p.name}
                        onClick={() => navigate({ name: 'project', id: p.id })}
                      >
                        <Swatch color={p.color} />
                        <span>{p.name}</span>
                      </button>
                      <ProgressMeter progress={p.progress} label={`${p.name} progress`} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
          {list('Recently completed', d.recentlyCompleted)}
        </div>
      </div>
    </div>
  );
}
