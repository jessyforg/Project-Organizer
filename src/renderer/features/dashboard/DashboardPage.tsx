import { Plus } from 'lucide-react';
import type { Task } from '@shared/domain';
import { useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useQuickAdd } from '../../app/quick-add';
import { ErrorNotice, Loading, ProgressMeter, Swatch } from '../../components/ui';
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

  const list = (title: string, tasks: Task[], empty?: string) =>
    tasks.length === 0 && !empty ? null : (
      <section className="section" aria-label={title}>
        <h2>{title}</h2>
        {tasks.length === 0 ? (
          <p className="muted">{empty}</p>
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
      <header className="page__header">
        <div>
          <h1>Today</h1>
          <p className="muted">
            {formatLongDate(d.today)}. {plural(d.openTaskCount, 'open task')}, {d.completedThisWeek}{' '}
            completed in the last 7 days.
          </p>
        </div>
        <div className="page__actions">
          <button type="button" className="btn btn--primary" onClick={() => quickAdd()}>
            <Plus aria-hidden /> New task
          </button>
        </div>
      </header>

      <div className="columns">
        <div className="section" style={{ gap: 'var(--space-6)' }}>
          {list('Overdue', d.overdue)}
          {list(
            'Due today',
            d.dueToday,
            nothingScheduled ? undefined : 'Nothing else is due today.',
          )}
          {list('Next 7 days', d.upcoming)}
          {nothingScheduled && (
            <div className="empty">
              <p>Nothing is due in the next week.</p>
              <button type="button" className="btn" onClick={() => navigate({ name: 'tasks' })}>
                See all tasks
              </button>
            </div>
          )}
          {list('Recently updated', d.recentlyUpdated)}
        </div>

        <div className="section" style={{ gap: 'var(--space-6)' }}>
          <section className="section" aria-label="Active projects">
            <h2>Active projects</h2>
            {d.activeProjects.length === 0 ? (
              <div className="empty">
                <p>No active projects.</p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => navigate({ name: 'projects' })}
                >
                  Go to projects
                </button>
              </div>
            ) : (
              <ul className="mini-list" style={{ gap: 'var(--space-4)' }}>
                {d.activeProjects.map((p) => (
                  <li key={p.id} style={{ display: 'grid', alignItems: 'stretch' }}>
                    <button
                      type="button"
                      className="link"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}
                      onClick={() => navigate({ name: 'project', id: p.id })}
                    >
                      <Swatch color={p.color} />
                      {p.name}
                    </button>
                    <ProgressMeter progress={p.progress} label={`${p.name} progress`} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {list('Recently completed', d.recentlyCompleted)}
        </div>
      </div>
    </div>
  );
}
