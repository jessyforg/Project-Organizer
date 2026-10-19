import { useDeferredValue } from 'react';
import { useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { Search } from 'lucide-react';
import { EmptyState, ErrorNotice, PageHeader, Swatch } from '../../components/ui';
import { localToday, plural } from '../../lib/format';
import { NoteList } from '../notes/NoteList';
import { TaskList } from '../tasks/TaskList';
import { useLookups } from '../tasks/useLookups';

/** Global search across projects (including archived) and tasks. */
export function SearchPage({ text }: { text: string }) {
  const deferred = useDeferredValue(text);
  const { navigate } = useNavigation();
  const lookups = useLookups();
  const results = useQuery(`search:${deferred}`, () => window.api.search.query({ text: deferred }));

  if (!deferred.trim()) {
    return (
      <div className="page">
        <PageHeader title="Search" />
        <div className="panel">
          <EmptyState icon={Search} title="Search everything">
            Type in the search box to find projects, tasks, and notes. Press Ctrl+K to jump there.
          </EmptyState>
        </div>
      </div>
    );
  }
  const data = results.data;
  const empty =
    data && data.projects.length === 0 && data.tasks.length === 0 && data.notes.length === 0;

  return (
    <div className="page">
      <PageHeader
        title={`Results for “${deferred}”`}
        description={
          data && !empty
            ? [
                [data.projects.length, 'project'] as const,
                [data.tasks.length, 'task'] as const,
                [data.notes.length, 'note'] as const,
              ]
                .filter(([count]) => count > 0)
                .map(([count, noun]) => plural(count, noun))
                .join(' · ')
            : undefined
        }
      />
      {results.error && <ErrorNotice error={results.error} onRetry={results.reload} />}
      {empty && (
        <div className="panel">
          <EmptyState icon={Search} title="No projects, tasks, or notes match.">
            Try fewer or shorter words.
          </EmptyState>
        </div>
      )}
      {data && data.projects.length > 0 && (
        <section className="section" aria-label="Projects">
          <h2>Projects</h2>
          <ul className="project-list">
            {data.projects.map((p) => (
              <li key={p.id} className="project-row" style={{ gridTemplateColumns: 'auto 1fr' }}>
                <Swatch color={p.color} />
                <div className="project-row__main">
                  <div className="project-row__name">
                    <button
                      type="button"
                      className="link"
                      onClick={() => navigate({ name: 'project', id: p.id })}
                    >
                      {p.name}
                    </button>
                    {p.archivedAt && <span className="label">Archived</span>}
                  </div>
                  {p.description && (
                    <span className="project-row__description">{p.description}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {data && data.tasks.length > 0 && (
        <section className="section">
          <h2>Tasks</h2>
          <TaskList
            label="Matching tasks"
            tasks={data.tasks}
            grouping={{ kind: 'none' }}
            today={localToday()}
            projects={lookups.projects}
            tags={lookups.tags}
          />
        </section>
      )}
      {data && data.notes.length > 0 && (
        <section className="section">
          <h2>Notes</h2>
          <div className="panel" style={{ padding: 'var(--space-1)' }}>
            <NoteList label="Matching notes" notes={data.notes} />
          </div>
        </section>
      )}
    </div>
  );
}
