import { useDeferredValue, useState } from 'react';
import { ListFilter, Plus } from 'lucide-react';
import { useQuery } from '../../app/data';
import { useQuickAdd } from '../../app/quick-add';
import { EmptyState, ErrorNotice, Loading, PageHeader } from '../../components/ui';
import { localToday } from '../../lib/format';
import { FilterBar, filtersToQuery, type TaskFilters } from './FilterBar';
import { LoadMore, PAGE_SIZE } from './LoadMore';
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
  const [limit, setLimit] = useState(PAGE_SIZE);
  const deferred = useDeferredValue(filters);
  const query = { ...filtersToQuery(deferred), limit };
  const tasks = useQuery(`tasks:${JSON.stringify(query)}`, () => window.api.tasks.list(query));
  const lookups = useLookups();
  const quickAdd = useQuickAdd();

  return (
    <div className="page">
      <PageHeader
        title="My tasks"
        description="Every task across your projects, grouped by status."
        actions={
          <button type="button" className="btn btn--primary" onClick={() => quickAdd()}>
            <Plus aria-hidden /> New task
          </button>
        }
      />
      <FilterBar
        value={filters}
        defaults={MY_TASKS_DEFAULTS}
        onChange={(next) => {
          setFilters(next);
          setLimit(PAGE_SIZE);
        }}
        tags={lookups.tagList}
        projects={lookups.projectList}
      />
      {tasks.error && <ErrorNotice error={tasks.error} onRetry={tasks.reload} />}
      {tasks.loading && !tasks.data && <Loading />}
      {tasks.data && tasks.data.length === 0 && (
        <div className="panel">
          <EmptyState
            icon={ListFilter}
            title="No tasks match these filters."
            action={
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFilters(MY_TASKS_DEFAULTS);
                  setLimit(PAGE_SIZE);
                }}
              >
                Show open tasks
              </button>
            }
          />
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
      {tasks.data && (
        <LoadMore
          shown={tasks.data.length}
          limit={limit}
          onMore={() => setLimit((l) => l + PAGE_SIZE)}
        />
      )}
    </div>
  );
}
