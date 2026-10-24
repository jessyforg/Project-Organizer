import type { ActivityEvent, Priority } from '@shared/domain';
import { formatDate, PRIORITY_LABEL } from '../../lib/format';

const quote = (text: string) => `“${text}”`;

/** "from A to B", "set to B", or "removed", for a value that may be empty. */
function change(label: string, from: string | null, to: string | null): string {
  if (from === null && to !== null) return `${label} set to ${to}`;
  if (from !== null && to === null) return `${label} removed (was ${from})`;
  return `${label} changed from ${from ?? '—'} to ${to ?? '—'}`;
}

/**
 * One event as a plain sentence, without the item's name (ADR-0021): "Status changed from To do
 * to Done". Dates are shown relative to `today`'s year, like elsewhere in the app.
 */
export function describeActivity(event: ActivityEvent, today: string): string {
  const { oldValue: from, newValue: to } = event;
  const date = (value: string | null) => (value === null ? null : formatDate(value, today));
  const priority = (value: string | null) =>
    value === null ? null : (PRIORITY_LABEL[value as Priority] ?? value);
  switch (event.action) {
    case 'created':
      return 'Created';
    case 'renamed':
      return `Renamed from ${quote(from ?? '')} to ${quote(to ?? '')}`;
    case 'moved':
      return `Moved from ${from ?? '—'} to ${to ?? '—'}`;
    case 'edited':
      return 'Edited';
    case 'completed':
      return 'Marked completed';
    case 'reopened':
      return 'Reopened';
    case 'archived':
      return 'Archived';
    case 'unarchived':
      return 'Unarchived';
    case 'trashed':
      return 'Moved to the trash';
    case 'restored':
      return 'Restored from the trash';
    case 'attachment_added':
      return `Added the file ${quote(to ?? '')}`;
    case 'attachment_removed':
      return `Removed the file ${quote(from ?? '')}`;
    case 'changed':
      // A custom field's value, with the field's name (ADR-0023).
      if (event.field?.startsWith('custom:')) {
        return change(event.field.slice('custom:'.length), from, to);
      }
      switch (event.field) {
        case 'status':
          return change('Status', from, to);
        case 'priority':
          return change('Priority', priority(from), priority(to));
        case 'due_date':
          return change('Due date', date(from), date(to));
        case 'target_date':
          return change('Target date', date(from), date(to));
        case 'milestone':
          return change('Milestone', from, to);
        case 'folder':
          return change('Folder', from, to);
        default:
          return 'Changed';
      }
  }
}

export const KIND_LABEL: Record<ActivityEvent['itemKind'], string> = {
  task: 'Task',
  project: 'Project',
  note: 'Note',
  milestone: 'Milestone',
};
