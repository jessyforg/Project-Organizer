import {
  PRIORITIES,
  STATUS_CATEGORIES,
  type CustomField,
  type Milestone,
  type Project,
  type Tag,
  type Task,
  type TaskTableColumn,
  type WorkflowStatus,
} from '@shared/domain';
import { formatDate, formatTimestamp, PRIORITY_LABEL } from '../../lib/format';
import { fieldSortValue, fieldText } from '../fields/field-values';

/** Which table: project tables share one layout, My tasks has its own (ADR-0022). */
export type TableView = 'project' | 'myTasks';

/** Built-in columns, and a project's custom fields as `field:<id>` (ADR-0023). */
export type ColumnId =
  | `field:${string}`
  | 'title'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'startDate'
  | 'tags'
  | 'milestone'
  | 'project'
  | 'createdAt'
  | 'updatedAt';

export type Editor = 'text' | 'status' | 'priority' | 'milestone' | 'date' | 'field';

export interface ColumnDef {
  id: ColumnId;
  label: string;
  width: number;
  shown: boolean;
  editor: Editor | null;
  views: TableView[];
  /** For a custom field's column. */
  field?: CustomField;
}

const BOTH: TableView[] = ['project', 'myTasks'];

/** In their default order. Title is always shown and first. */
export const COLUMNS: ColumnDef[] = [
  { id: 'title', label: 'Title', width: 280, shown: true, editor: 'text', views: BOTH },
  { id: 'project', label: 'Project', width: 160, shown: true, editor: null, views: ['myTasks'] },
  { id: 'status', label: 'Status', width: 140, shown: true, editor: 'status', views: BOTH },
  { id: 'priority', label: 'Priority', width: 112, shown: true, editor: 'priority', views: BOTH },
  { id: 'dueDate', label: 'Due date', width: 128, shown: true, editor: 'date', views: BOTH },
  {
    id: 'milestone',
    label: 'Milestone',
    width: 140,
    shown: true,
    editor: 'milestone',
    views: BOTH,
  },
  { id: 'tags', label: 'Tags', width: 140, shown: true, editor: null, views: BOTH },
  { id: 'startDate', label: 'Start date', width: 128, shown: false, editor: 'date', views: BOTH },
  { id: 'createdAt', label: 'Created', width: 176, shown: false, editor: null, views: BOTH },
  { id: 'updatedAt', label: 'Updated', width: 176, shown: false, editor: null, views: BOTH },
];

export const MIN_WIDTH = 60;
export const MAX_WIDTH = 800;

/** A custom field's column; multiple choices are edited in the task panel only. */
export function fieldColumn(field: CustomField): ColumnDef {
  return {
    id: `field:${field.id}`,
    label: field.name,
    width: 140,
    shown: true,
    editor: field.type === 'multi_select' ? null : 'field',
    views: ['project'],
    field,
  };
}

/** Fields differ between projects, so only project tables have their columns. */
export function columnsFor(view: TableView, fields: CustomField[] = []): ColumnDef[] {
  return [
    ...COLUMNS.filter((c) => c.views.includes(view)),
    ...(view === 'project' ? fields.map(fieldColumn) : []),
  ];
}

export function defaultLayout(view: TableView, fields: CustomField[] = []): TaskTableColumn[] {
  return columnsFor(view, fields).map((c) => ({ id: c.id, width: c.width, hidden: !c.shown }));
}

/**
 * A saved layout made safe: unknown or repeated columns are dropped, missing ones are added
 * with their defaults at the end, widths are clamped, and Title is shown and first.
 */
export function normalizeLayout(
  view: TableView,
  saved: TaskTableColumn[] | undefined,
  fields: CustomField[] = [],
): TaskTableColumn[] {
  const known = new Map(columnsFor(view, fields).map((c) => [c.id as string, c]));
  const seen = new Set<string>();
  const result: TaskTableColumn[] = [];
  for (const column of saved ?? []) {
    if (!known.has(column.id) || seen.has(column.id)) continue;
    seen.add(column.id);
    result.push({
      id: column.id,
      width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(column.width))),
      hidden: column.id === 'title' ? false : column.hidden,
    });
  }
  for (const column of defaultLayout(view, fields)) if (!seen.has(column.id)) result.push(column);
  const title = result.findIndex((c) => c.id === 'title');
  if (title > 0) result.unshift(...result.splice(title, 1));
  return result;
}

/** Names the table shows instead of IDs. */
export interface Lookups {
  statuses: Map<string, WorkflowStatus>;
  milestones: Map<string, Milestone>;
  projects: Map<string, Project>;
  tags: Map<string, Tag>;
  /** The project's custom fields (ADR-0023). */
  fields: Map<string, CustomField>;
  today: string;
}

const fieldOf = (column: ColumnId, lookups: Lookups) =>
  column.startsWith('field:') ? lookups.fields.get(column.slice('field:'.length)) : undefined;

/** The text a cell shows; empty values are ''. */
export function cellText(task: Task, column: ColumnId, lookups: Lookups): string {
  if (column.startsWith('field:')) {
    const field = fieldOf(column, lookups);
    return field ? fieldText(field, task.customValues[field.id], lookups.today) : '';
  }
  switch (column) {
    case 'title':
      return task.title;
    case 'status':
      return lookups.statuses.get(task.statusId)?.name ?? '';
    case 'priority':
      return task.priority ? PRIORITY_LABEL[task.priority] : '';
    case 'dueDate':
      return task.dueDate ? formatDate(task.dueDate, lookups.today) : '';
    case 'startDate':
      return task.startDate ? formatDate(task.startDate, lookups.today) : '';
    case 'tags':
      return task.tagIds
        .map((id) => lookups.tags.get(id)?.name)
        .filter(Boolean)
        .join(', ');
    case 'milestone':
      return task.milestoneId ? (lookups.milestones.get(task.milestoneId)?.name ?? '') : '';
    case 'project':
      return lookups.projects.get(task.projectId)?.name ?? '';
    case 'createdAt':
      return formatTimestamp(task.createdAt);
    case 'updatedAt':
      return formatTimestamp(task.updatedAt);
    default:
      return '';
  }
}

/** A value that sorts in the column's natural order, or null for an empty cell. */
function sortValue(task: Task, column: ColumnId, lookups: Lookups): string | number | null {
  const field = fieldOf(column, lookups);
  if (field) return fieldSortValue(field, task.customValues[field.id]);
  switch (column) {
    case 'priority':
      return task.priority ? PRIORITIES.indexOf(task.priority) : null;
    case 'status': {
      const status = lookups.statuses.get(task.statusId);
      return status
        ? `${STATUS_CATEGORIES.indexOf(status.category)}${status.name.toLocaleLowerCase()}`
        : null;
    }
    case 'dueDate':
      return task.dueDate;
    case 'startDate':
      return task.startDate;
    case 'createdAt':
      return task.createdAt;
    case 'updatedAt':
      return task.updatedAt;
    default: {
      const text = cellText(task, column, lookups);
      return text ? text.toLocaleLowerCase() : null;
    }
  }
}

export type SortDirection = 'ascending' | 'descending';

/** Sorts by a column; empty cells go last in both directions, and ties keep their order. */
export function sortTasks(
  tasks: Task[],
  sort: { column: ColumnId; direction: SortDirection } | null,
  lookups: Lookups,
): Task[] {
  if (!sort) return tasks;
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return tasks
    .map((task, index) => ({ task, index, value: sortValue(task, sort.column, lookups) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        return a.value === b.value ? a.index - b.index : a.value === null ? 1 : -1;
      }
      const order =
        typeof a.value === 'number' && typeof b.value === 'number'
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value));
      return order === 0 ? a.index - b.index : order * sign;
    })
    .map((entry) => entry.task);
}

/** Built-in groupings, and choice and checkbox fields (ADR-0023). */
export type GroupBy = 'none' | 'status' | 'priority' | 'milestone' | 'project' | `field:${string}`;

export type TableRow =
  { kind: 'group'; key: string; label: string; count: number } | { kind: 'task'; task: Task };

/** Rows for the table: tasks, with a header row before each group when grouped. */
export function tableRows(
  tasks: Task[],
  groupBy: GroupBy,
  lookups: Lookups,
  /** What tasks without a value are grouped as, such as "No priority". */
  emptyLabel = `No ${groupBy}`,
): TableRow[] {
  if (groupBy === 'none') return tasks.map((task) => ({ kind: 'task', task }));
  const column: ColumnId = groupBy;
  const groups = new Map<string, { label: string; order: string | number | null; tasks: Task[] }>();
  for (const task of tasks) {
    const label = cellText(task, column, lookups) || emptyLabel;
    const group = groups.get(label) ?? {
      label,
      order: sortValue(task, column, lookups),
      tasks: [],
    };
    group.tasks.push(task);
    groups.set(label, group);
  }
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.order === null || b.order === null)
      return a.order === b.order ? 0 : a.order === null ? 1 : -1;
    return typeof a.order === 'number' && typeof b.order === 'number'
      ? a.order - b.order
      : String(a.order).localeCompare(String(b.order));
  });
  return ordered.flatMap((group) => [
    { kind: 'group' as const, key: group.label, label: group.label, count: group.tasks.length },
    ...group.tasks.map((task) => ({ kind: 'task' as const, task })),
  ]);
}
