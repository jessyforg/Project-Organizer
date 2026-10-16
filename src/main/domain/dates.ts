const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** The calendar date of `instant` in the computer's local time zone, as YYYY-MM-DD. */
export function localIsoDate(instant: Date): string {
  return `${pad(instant.getFullYear(), 4)}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
}

/** Adds whole days to a YYYY-MM-DD date using calendar arithmetic (no time-zone effects). */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) throw new Error('Invalid date');
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The instant `days` days before `instant`, as an ISO timestamp. */
export function daysBefore(instant: Date, days: number): string {
  return new Date(instant.getTime() - days * 86_400_000).toISOString();
}

export function daysAfter(isoTimestamp: string, days: number): string {
  return new Date(new Date(isoTimestamp).getTime() + days * 86_400_000).toISOString();
}
