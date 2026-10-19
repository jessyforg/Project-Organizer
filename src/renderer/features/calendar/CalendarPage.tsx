import { useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Task } from '@shared/domain';
import { LIMITS } from '@shared/schemas';
import { useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { ErrorNotice, Swatch } from '../../components/ui';
import {
  dayOfMonth,
  formatFullDate,
  formatWeekday,
  localeFirstDay,
  shiftAnchor,
  viewTitle,
  visibleDays,
  type CalendarView,
} from '../../lib/calendar';
import { localToday, plural } from '../../lib/format';
import { TaskList } from '../tasks/TaskList';
import { useLookups } from '../tasks/useLookups';

const VIEWS: { view: CalendarView; label: string }[] = [
  { view: 'month', label: 'Month' },
  { view: 'week', label: 'Week' },
  { view: 'day', label: 'Day' },
];
/** Tasks shown in a month cell before "+N more". */
const CELL_LIMIT = 3;

const isOpen = (task: Task) =>
  task.statusCategory === 'todo' || task.statusCategory === 'in_progress';

/**
 * Calendar (L3.4): tasks on their due dates in month, week, and day views. Milestones and
 * recurring occurrences are not part of the app yet, so deadlines are the only entries.
 */
export function CalendarPage() {
  const today = localToday();
  const firstDay = useMemo(() => localeFirstDay(), []);
  const lookups = useLookups();
  const [view, setView] = useState<CalendarView>('month');
  const [anchor, setAnchor] = useState(today);
  const [projectId, setProjectId] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const days = visibleDays(view, anchor, firstDay);
  const query = {
    dueFrom: days[0]!,
    dueTo: days.at(-1)!,
    ...(projectId ? { projectId } : {}),
    ...(showClosed ? {} : { statusCategories: ['todo' as const, 'in_progress' as const] }),
    sort: 'due' as const,
    limit: LIMITS.listPageSize,
  };
  const tasks = useQuery(`calendar:${JSON.stringify(query)}`, () => window.api.tasks.list(query));
  const overdueQuery = { due: 'overdue' as const, ...(projectId ? { projectId } : {}), limit: 500 };
  const overdue = useQuery(`calendar-overdue:${projectId}`, () =>
    window.api.tasks.list(overdueQuery),
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks.data ?? []) {
      if (task.dueDate) map.set(task.dueDate, [...(map.get(task.dueDate) ?? []), task]);
    }
    return map;
  }, [tasks.data]);

  const openDay = (day: string) => {
    setAnchor(day);
    setView('day');
  };
  const overdueCount = overdue.data?.length ?? 0;
  const projects = lookups.projectList.filter((p) => p.archivedAt === null);

  return (
    <div className="page calendar-page">
      <header className="page__header">
        <h1>Calendar</h1>
        <div className="view-switch" role="group" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button
              key={v.view}
              type="button"
              className="chip"
              aria-pressed={view === v.view}
              onClick={() => setView(v.view)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>

      <div className="calendar__toolbar">
        <div className="page__actions">
          <button
            type="button"
            className="btn btn--icon"
            aria-label={`Previous ${view}`}
            onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}
          >
            <ChevronLeft aria-hidden />
          </button>
          <button type="button" className="btn" onClick={() => setAnchor(today)}>
            Today
          </button>
          <button
            type="button"
            className="btn btn--icon"
            aria-label={`Next ${view}`}
            onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}
          >
            <ChevronRight aria-hidden />
          </button>
        </div>
        <h2 className="calendar__title" aria-live="polite">
          {viewTitle(view, anchor, firstDay)}
        </h2>
        <div className="calendar__filters">
          <div className="field">
            <label htmlFor="calendar-project">Project</label>
            <select
              id="calendar-project"
              className="select"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <label className="chip calendar__toggle">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.target.checked)}
            />
            Show done and cancelled
          </label>
        </div>
      </div>

      {overdueCount > 0 && !(view === 'day' && anchor === today) && (
        <div className="notice">
          <p>{plural(overdueCount, 'open task is', 'open tasks are')} overdue.</p>
          <button type="button" className="btn" onClick={() => openDay(today)}>
            Show overdue tasks
          </button>
        </div>
      )}
      {tasks.error && <ErrorNotice error={tasks.error} onRetry={tasks.reload} />}

      {view === 'month' && (
        <MonthGrid
          days={days}
          anchor={anchor}
          today={today}
          byDay={byDay}
          title={viewTitle(view, anchor, firstDay)}
          onOpenDay={openDay}
        />
      )}
      {view === 'week' && (
        <div className="week">
          {days.map((day) => (
            <section
              key={day}
              className="week__day"
              aria-label={formatFullDate(day)}
              data-today={day === today ? 'true' : undefined}
            >
              <button
                type="button"
                className="week__heading"
                data-day={day}
                onClick={() => openDay(day)}
              >
                <span>{formatWeekday(day)}</span>
                <strong>{dayOfMonth(day)}</strong>
              </button>
              <ul className="cal-items">
                {(byDay.get(day) ?? []).map((task) => (
                  <li key={task.id}>
                    <CalendarItem task={task} today={today} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {view === 'day' && (
        <div className="section">
          {anchor === today && overdueCount > 0 && (
            <section className="section" aria-labelledby="calendar-overdue">
              <h3 id="calendar-overdue">Overdue</h3>
              <TaskList
                label="Overdue tasks"
                tasks={overdue.data ?? []}
                grouping={{ kind: 'none' }}
                today={today}
                projects={lookups.projects}
                tags={lookups.tags}
              />
            </section>
          )}
          <section className="section" aria-labelledby="calendar-day">
            <h3 id="calendar-day">Due {anchor === today ? 'today' : formatFullDate(anchor)}</h3>
            {(byDay.get(anchor) ?? []).length === 0 ? (
              <p className="muted">Nothing is due on this day.</p>
            ) : (
              <TaskList
                label={`Tasks due ${formatFullDate(anchor)}`}
                tasks={byDay.get(anchor) ?? []}
                grouping={{ kind: 'none' }}
                today={today}
                projects={lookups.projects}
                tags={lookups.tags}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function MonthGrid({
  days,
  anchor,
  today,
  byDay,
  title,
  onOpenDay,
}: {
  days: string[];
  anchor: string;
  today: string;
  byDay: Map<string, Task[]>;
  title: string;
  onOpenDay: (day: string) => void;
}) {
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const month = anchor.slice(0, 7);
  return (
    <table className="month">
      <caption className="visually-hidden">{title}</caption>
      <thead>
        <tr>
          {weeks[0]!.map((day) => (
            <th key={day} scope="col">
              <abbr title={formatWeekday(day, 'long')}>{formatWeekday(day)}</abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((day) => {
              const items = byDay.get(day) ?? [];
              const hidden = items.length - CELL_LIMIT;
              return (
                <td
                  key={day}
                  className="month__cell"
                  data-outside={day.slice(0, 7) !== month ? 'true' : undefined}
                  data-today={day === today ? 'true' : undefined}
                >
                  <button
                    type="button"
                    className="month__date"
                    aria-current={day === today ? 'date' : undefined}
                    aria-label={`${formatFullDate(day)}${items.length ? `, ${plural(items.length, 'task')}` : ''}`}
                    onClick={() => onOpenDay(day)}
                  >
                    {dayOfMonth(day)}
                  </button>
                  <ul className="cal-items">
                    {items.slice(0, hidden > 0 ? CELL_LIMIT - 1 : CELL_LIMIT).map((task) => (
                      <li key={task.id}>
                        <CalendarItem task={task} today={today} />
                      </li>
                    ))}
                  </ul>
                  {hidden > 0 && (
                    <button type="button" className="month__more" onClick={() => onOpenDay(day)}>
                      {hidden + 1} more
                    </button>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One task on the calendar; opens the task details panel. */
function CalendarItem({ task, today }: { task: Task; today: string }) {
  const { openTask } = useNavigation();
  const { projects } = useLookups();
  const overdue = isOpen(task) && task.dueDate !== null && task.dueDate < today;
  const state = overdue ? 'overdue' : isOpen(task) ? 'open' : 'closed';
  return (
    <button
      type="button"
      className={`cal-item cal-item--${state}`}
      title={task.title}
      onClick={() => openTask(task.id)}
    >
      <Swatch color={projects.get(task.projectId)?.color ?? null} />
      {overdue && <AlertCircle className="cal-item__alert" aria-hidden />}
      <span className="cal-item__title">{task.title}</span>
      {state !== 'open' && (
        <span className="visually-hidden">
          {state === 'overdue'
            ? ' (overdue)'
            : ` (${task.statusCategory === 'done' ? 'done' : 'cancelled'})`}
        </span>
      )}
    </button>
  );
}
