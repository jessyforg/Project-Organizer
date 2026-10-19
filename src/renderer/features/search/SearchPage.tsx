import { useDeferredValue } from 'react';
import { useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { ErrorNotice, Swatch } from '../../components/ui';
import { localToday } from '../../lib/format';
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
        <h1>Search</h1>
        <p className="muted">Type in the search box to find projects, tasks, and notes.</p>
      </div>
    );
  }
  const data = results.data;
  const empty =
    data && data.projects.length === 0 && data.tasks.length === 0 && data.notes.length === 0;

  return (
    <div className="page">
      <h1>Results for “{deferred}”</h1>
      {results.error && <ErrorNotice error={results.error} onRetry={results.reload} />}
      {empty && (
        <p className="muted">No projects, tasks, or notes match. Try fewer or shorter words.</p>
      )}
      {data && data.projects.length > 0 && (
        <section className="section" aria-label="Projects">
          <h2>Projects</h2>
          <ul className="project-list">
            {data.projects.map((p) => (
              <li key={p.id} className="project-row" style={{ gridTemplateColumns: 'auto 1fr' }}>
                <Swatch color={p.color} />
                <span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => navigate({ name: 'project', id: p.id })}
                  >
                    {p.name}
                  </button>{' '}
                  {p.archivedAt && <span className="label">Archived</span>}
                </span>
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
          <NoteList label="Matching notes" notes={data.notes} />
        </section>
      )}
    </div>
  );
}
