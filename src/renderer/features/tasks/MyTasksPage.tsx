import { useDeferredValue, useState } from 'react';
import { Plus } from 'lucide-react';
import { useQuery } from '../../app/data';
import { useQuickAdd } from '../../app/quick-add';
import { ErrorNotice, Loading } from '../../components/ui';
import { localToday } from '../../lib/format';
import { FilterBar, filtersToQuery, type TaskFilters } from './FilterBar';
import { TaskList } from './TaskList';
import { useLookups } from './useLookups';

export const MY_TASKS_DEFAULTS: TaskFilters = {
  text: '',
  categories: ['todo', 'in_progress'],
  priorities: [],
  due: '',
  tagId: '',
  projectId: '',
  sort: 'priority',
};

/** Every task across projects, grouped by status category (R10, R18). */
export function MyTasksPage() {
  const [filters, setFilters] = useState(MY_TASKS_DEFAULTS);
  const deferred = useDeferredValue(filters);
  const query = filtersToQuery(deferred);
  const tasks = useQuery(`tasks:${JSON.stringify(query)}`, () => window.api.tasks.list(query));
  const lookups = useLookups();
  const quickAdd = useQuickAdd();

  return (
    <div className="page">
      <header className="page__header">
        <h1>My tasks</h1>
        <div className="page__actions">
          <button type="button" className="btn btn--primary" onClick={() => quickAdd()}>
            <Plus aria-hidden /> New task
          </button>
        </div>
      </header>
      <FilterBar
        value={filters}
        defaults={MY_TASKS_DEFAULTS}
        onChange={setFilters}
        tags={lookups.tagList}
        projects={lookups.projectList}
      />
      {tasks.error && <ErrorNotice error={tasks.error} onRetry={tasks.reload} />}
      {tasks.loading && !tasks.data && <Loading />}
      {tasks.data && tasks.data.length === 0 && (
        <div className="empty">
          <p>No tasks match these filters.</p>
        </div>
      )}
      {tasks.data && tasks.data.length > 0 && (
        <TaskList
          label="Tasks"
          tasks={tasks.data}
          grouping={{ kind: 'category' }}
          today={localToday()}
          separateUndated={deferred.sort === 'due'}
          projects={lookups.projects}
          tags={lookups.tags}
        />
      )}
    </div>
  );
}
