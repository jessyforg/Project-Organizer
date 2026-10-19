import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { CalendarPage } from '../../src/renderer/features/calendar/CalendarPage';
import {
  addDays,
  addMonths,
  localeFirstDay,
  shiftAnchor,
  startOfWeek,
  visibleDays,
} from '../../src/renderer/lib/calendar';
import { localToday } from '../../src/renderer/lib/format';
import { installApi, makeTask, ok, renderWithApp } from './harness';

/** Node's environment; the renderer test config has no Node types. */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
  .process.env;

describe('calendar date helpers', () => {
  // Restore the exact zone: deleting TZ does not switch Node back to the system zone.
  const originalZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  afterEach(() => {
    env['TZ'] = originalZone;
  });

  it('builds whole-week month grids from the locale’s first weekday', () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const sunday = visibleDays('month', '2026-10-20', 0);
    expect([sunday[0], sunday.at(-1), sunday.length]).toEqual(['2026-09-27', '2026-10-31', 35]);
    const monday = visibleDays('month', '2026-10-20', 1);
    expect([monday[0], monday.at(-1), monday.length]).toEqual(['2026-09-28', '2026-11-01', 35]);
    expect(visibleDays('week', '2026-10-20', 0)).toHaveLength(7);
    expect(startOfWeek('2026-10-20', 1)).toBe('2026-10-19');
    expect(localeFirstDay('en-US')).toBe(0);
    expect(localeFirstDay('en-GB')).toBe(1);
  });

  it('never skips or repeats a day across daylight-saving changes', () => {
    env['TZ'] = 'America/New_York'; // DST starts 2026-03-08 and ends 2026-11-01
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-11-02', -1)).toBe('2026-11-01');
    const week = visibleDays('week', '2026-03-08', 0);
    expect(new Set(week).size).toBe(7);
    expect(week.at(-1)).toBe('2026-03-14');
  });

  it('moves by month without overflowing short months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(shiftAnchor('week', '2026-10-20', -1)).toBe('2026-10-13');
    expect(shiftAnchor('day', '2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('CalendarPage (L3.4)', () => {
  const today = localToday();

  function setup() {
    const tasks = [
      makeTask({ title: 'Ship release', dueDate: today }),
      makeTask({ title: 'Late report', dueDate: addDays(today, -1) }),
    ];
    const backend = installApi({
      'tasks:list': (payload) => {
        if (payload['due'] === 'overdue') return ok([tasks[1]]);
        const from = payload['dueFrom'] as string;
        const to = payload['dueTo'] as string;
        return ok(tasks.filter((t) => t.dueDate! >= from && t.dueDate! <= to));
      },
    });
    renderWithApp(<CalendarPage />);
    return backend;
  }

  it('shows open tasks on their due dates and marks overdue ones in text', async () => {
    const backend = setup();
    const ship = await screen.findByRole('button', { name: 'Ship release' });
    expect(ship.closest('td')).toHaveAttribute('data-today', 'true');
    // Yesterday is in the grid unless today is the 1st and the first day of the week.
    if (visibleDays('month', today, localeFirstDay()).includes(addDays(today, -1))) {
      expect(screen.getByRole('button', { name: /Late report.*overdue/ })).toBeInTheDocument();
    }
    expect(screen.getByText('1 open task is overdue.')).toBeInTheDocument();
    const query = backend.callsTo('tasks:list').find((q) => q['dueFrom'])!;
    expect(query['statusCategories']).toEqual(['todo', 'in_progress']);
    expect(String(query['dueFrom']) <= today && String(query['dueTo']) >= today).toBe(true);
  });

  it('opens a day with its overdue tasks, and switches to the week view', async () => {
    setup();
    await screen.findByRole('button', { name: 'Ship release' });
    await userEvent.click(screen.getByRole('button', { name: 'Show overdue tasks' }));
    expect(screen.getByRole('heading', { name: 'Due today' })).toBeInTheDocument();
    const overdue = screen.getByRole('region', { name: 'Overdue' });
    expect(within(overdue).getByText('Late report')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Week' }));
    expect(screen.getAllByRole('region')).toHaveLength(7);
  });
});
