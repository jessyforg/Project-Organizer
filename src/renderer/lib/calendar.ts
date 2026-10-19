/**
 * Calendar date arithmetic on YYYY-MM-DD strings in the user's local calendar
 * (docs/DATA_MODEL.md §1). Dates are built from parts, so no time-zone or daylight-saving
 * shift can move a day.
 */

export type CalendarView = 'month' | 'week' | 'day';

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Noon avoids any edge case around midnight daylight-saving changes. */
function toDate(iso: string): Date {
  const [y, m, d] = parts(iso);
  return new Date(y, m - 1, d, 12);
}

export function addDays(iso: string, days: number): string {
  const date = toDate(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = parts(iso);
  const first = new Date(y, m - 1 + months, 1, 12);
  // Clamp to the target month's length (Jan 31 + 1 month = Feb 28/29).
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
  first.setDate(Math.min(d, last));
  return toIso(first);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: string): number {
  return toDate(iso).getDay();
}

/** The locale's first day of the week (0 = Sunday), falling back to Sunday. */
export function localeFirstDay(locale = navigator.language): number {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const firstDay = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay;
    return firstDay === undefined ? 0 : firstDay % 7; // Intl uses 7 for Sunday
  } catch {
    return 0;
  }
}

export function startOfWeek(iso: string, firstDay: number): string {
  return addDays(iso, -((weekday(iso) - firstDay + 7) % 7));
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 8)}01`;
}

/** The days shown for a view, in order; month views show whole weeks. */
export function visibleDays(view: CalendarView, anchor: string, firstDay: number): string[] {
  if (view === 'day') return [anchor];
  if (view === 'week') {
    const start = startOfWeek(anchor, firstDay);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const first = startOfMonth(anchor);
  const start = startOfWeek(first, firstDay);
  const nextMonth = startOfMonth(addMonths(first, 1));
  const days: string[] = [];
  for (let day = start; day < nextMonth || days.length % 7 !== 0; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/** Moves the anchor one view-length back (-1) or forward (+1). */
export function shiftAnchor(view: CalendarView, anchor: string, step: -1 | 1): string {
  if (view === 'month') return addMonths(anchor, step);
  return addDays(anchor, view === 'week' ? 7 * step : step);
}

const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayTitle = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
});
const shortDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const weekdayShort = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const weekdayLong = new Intl.DateTimeFormat(undefined, { weekday: 'long' });

export function viewTitle(view: CalendarView, anchor: string, firstDay: number): string {
  if (view === 'month') return monthTitle.format(toDate(anchor));
  if (view === 'day') return dayTitle.format(toDate(anchor));
  const days = visibleDays('week', anchor, firstDay);
  const year = toDate(days[6]!).getFullYear();
  return `${shortDay.format(toDate(days[0]!))} – ${shortDay.format(toDate(days[6]!))}, ${year}`;
}

export function formatWeekday(iso: string, style: 'short' | 'long' = 'short'): string {
  return (style === 'short' ? weekdayShort : weekdayLong).format(toDate(iso));
}

export function formatFullDate(iso: string): string {
  return dayTitle.format(toDate(iso));
}

export function dayOfMonth(iso: string): number {
  return parts(iso)[2];
}
