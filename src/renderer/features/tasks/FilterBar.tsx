import { useId } from 'react';
import {
  PRIORITIES,
  type Priority,
  type Project,
  type StatusCategory,
  type Tag,
} from '@shared/domain';
import type { TaskListQuery } from '@shared/schemas';
import { CATEGORY_LABEL, PRIORITY_LABEL } from '../../lib/format';

export type DueFilter = '' | 'overdue' | 'today' | 'upcoming' | 'none';
export type SortKey = 'priority' | 'due' | 'created' | 'manual';

export interface TaskFilters {
  text: string;
  categories: StatusCategory[];
  priorities: (Priority | 'none')[];
  due: DueFilter;
  tagId: string;
  projectId: string;
  sort: SortKey;
}

export function filtersToQuery(filters: TaskFilters): TaskListQuery {
  return {
    parentTaskId: null,
    sort: filters.sort,
    ...(filters.text.trim() ? { text: filters.text } : {}),
    ...(filters.categories.length ? { statusCategories: filters.categories } : {}),
    ...(filters.priorities.length ? { priorities: filters.priorities } : {}),
    ...(filters.due ? { due: filters.due } : {}),
    ...(filters.tagId ? { tagIds: [filters.tagId] } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
  };
}

function sameFilters(a: TaskFilters, b: TaskFilters): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const CATEGORIES: StatusCategory[] = ['todo', 'in_progress', 'done', 'cancelled'];

interface Props {
  value: TaskFilters;
  defaults: TaskFilters;
  onChange: (next: TaskFilters) => void;
  tags: Tag[];
  projects?: Project[];
  allowManualSort?: boolean;
}

export function FilterBar({ value, defaults, onChange, tags, projects, allowManualSort }: Props) {
  const id = useId();
  const set = <K extends keyof TaskFilters>(key: K, next: TaskFilters[K]) =>
    onChange({ ...value, [key]: next });
  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  return (
    <div className="section" role="search" aria-label="Filter tasks">
      <div className="filters">
        <div className="field filters__search">
          <label htmlFor={`${id}-text`}>Search</label>
          <input
            id={`${id}-text`}
            className="input"
            type="search"
            value={value.text}
            placeholder="Words in title or description"
            onChange={(e) => set('text', e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-due`}>Due</label>
          <select
            id={`${id}-due`}
            className="select"
            value={value.due}
            onChange={(e) => set('due', e.target.value as DueFilter)}
          >
            <option value="">Any time</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="upcoming">Next 7 days</option>
            <option value="none">No due date</option>
          </select>
        </div>
        {projects && (
          <div className="field">
            <label htmlFor={`${id}-project`}>Project</label>
            <select
              id={`${id}-project`}
              className="select"
              value={value.projectId}
              onChange={(e) => set('projectId', e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {tags.length > 0 && (
          <div className="field">
            <label htmlFor={`${id}-tag`}>Tag</label>
            <select
              id={`${id}-tag`}
              className="select"
              value={value.tagId}
              onChange={(e) => set('tagId', e.target.value)}
            >
              <option value="">Any tag</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor={`${id}-sort`}>Sort by</label>
          <select
            id={`${id}-sort`}
            className="select"
            value={value.sort}
            onChange={(e) => set('sort', e.target.value as SortKey)}
          >
            <option value="priority">Priority</option>
            <option value="due">Due date</option>
            <option value="created">Newest first</option>
            {allowManualSort && <option value="manual">Manual order</option>}
          </select>
        </div>
      </div>
      <div className="filters">
        <div className="chips" role="group" aria-label="Status">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              aria-pressed={value.categories.includes(c)}
              onClick={() => set('categories', toggle(value.categories, c))}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Priority">
          {[...PRIORITIES, 'none' as const].map((p) => (
            <button
              key={p}
              type="button"
              className="chip"
              aria-pressed={value.priorities.includes(p)}
              onClick={() => set('priorities', toggle(value.priorities, p))}
            >
              {p === 'none' ? 'No priority' : PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
        {!sameFilters(value, defaults) && (
          <button type="button" className="btn btn--quiet" onClick={() => onChange(defaults)}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
