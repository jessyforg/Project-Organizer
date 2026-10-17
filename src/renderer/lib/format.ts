import type { Priority, Progress, StatusCategory } from '@shared/domain';

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

/** Builds a local Date from YYYY-MM-DD without any time-zone shift. */
function fromIsoDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((fromIsoDate(toIso).getTime() - fromIsoDate(fromIso).getTime()) / 86_400_000);
}

const dayMonth = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dayMonthYear = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const longDate = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});
const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(isoDate: string, today: string): string {
  const date = fromIsoDate(isoDate);
  return isoDate.slice(0, 4) === today.slice(0, 4)
    ? dayMonth.format(date)
    : dayMonthYear.format(date);
}

export function formatLongDate(isoDate: string): string {
  return longDate.format(fromIsoDate(isoDate));
}

export function formatTimestamp(iso: string): string {
  return dateTime.format(new Date(iso));
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later' | 'closed';

/** Human label and state for a due date. Overdue applies only to open tasks. */
export function describeDue(
  dueDate: string,
  today: string,
  category: StatusCategory,
): { label: string; state: DueState } {
  const open = category === 'todo' || category === 'in_progress';
  const diff = daysBetween(today, dueDate);
  if (!open) return { label: formatDate(dueDate, today), state: 'closed' };
  if (diff < 0) {
    return { label: `${formatDate(dueDate, today)}, overdue`, state: 'overdue' };
  }
  if (diff === 0) return { label: 'Today', state: 'today' };
  if (diff === 1) return { label: 'Tomorrow', state: 'soon' };
  return { label: formatDate(dueDate, today), state: diff <= 7 ? 'soon' : 'later' };
}

export function describeProgress(progress: Progress): string {
  if (progress.ratio === null) return 'No tasks to count yet';
  return `${progress.done} of ${progress.total} done`;
}

export function percent(progress: Progress): string {
  return progress.ratio === null ? '—' : `${Math.round(progress.ratio * 100)}%`;
}

export function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
