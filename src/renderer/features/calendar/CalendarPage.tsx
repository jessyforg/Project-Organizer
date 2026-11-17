import { useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Flag } from 'lucide-react';
import type { MilestoneEntry, Task } from '@shared/domain';
import { LIMITS } from '@shared/schemas';
import { useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { ErrorNotice, PageHeader, Swatch } from '../../components/ui';
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

  // Milestones on their target dates (ADR-0020), with the same project and "done" filters.
  const range = { from: days[0]!, to: days.at(-1)! };
  const milestones = useQuery(`calendar-milestones:${JSON.stringify(range)}`, () =>
    window.api.milestones.inRange(range),
  );
  const milestonesByDay = useMemo(() => {
    const map = new Map<string, MilestoneEntry[]>();
    for (const m of milestones.data ?? []) {
      if (projectId && m.projectId !== projectId) continue;
      if (!showClosed && m.completedAt !== null) continue;
      map.set(m.targetDate!, [...(map.get(m.targetDate!) ?? []), m]);
    }
    return map;
  }, [milestones.data, projectId, showClosed]);

  const openDay = (day: string) => {
    setAnchor(day);
    setView('day');
  };
  const overdueCount = overdue.data?.length ?? 0;
  const projects = lookups.projectList.filter((p) => p.archivedAt === null);

  return (
    <div className="page calendar-page">
      <PageHeader
        title="Calendar"
        description="Tasks on their due dates and milestones on their target dates. Select one to open it."
        actions={
          <div className="segmented" role="group" aria-label="Calendar view">
            {VIEWS.map((v) => (
              <button
                key={v.view}
                type="button"
                aria-pressed={view === v.view}
                onClick={() => setView(v.view)}
              >
                {v.label}
              </button>
            ))}
          </div>
        }
      />

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
          <div className="inline-field">
            <label htmlFor="calendar-project">Project</label>
            <select
              id="calendar-project"
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
          milestonesByDay={milestonesByDay}
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
                {(milestonesByDay.get(day) ?? []).map((m) => (
                  <li key={m.id}>
                    <MilestoneItem milestone={m} today={today} />
                  </li>
                ))}
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
          {(milestonesByDay.get(anchor) ?? []).length > 0 && (
            <section className="section" aria-labelledby="calendar-day-milestones">
              <h3 id="calendar-day-milestones">Milestones</h3>
              <ul className="cal-items cal-items--day" aria-label="Milestones on this day">
                {(milestonesByDay.get(anchor) ?? []).map((m) => (
                  <li key={m.id}>
                    <MilestoneItem milestone={m} today={today} />
                  </li>
                ))}
              </ul>
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
  milestonesByDay,
  title,
  onOpenDay,
}: {
  days: string[];
  anchor: string;
  today: string;
  byDay: Map<string, Task[]>;
  milestonesByDay: Map<string, MilestoneEntry[]>;
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
              const marks = milestonesByDay.get(day) ?? [];
              const tasks = byDay.get(day) ?? [];
              // Milestones first; together they share the cell's room.
              const items = [
                ...marks.map((m) => ({
                  key: m.id,
                  node: <MilestoneItem milestone={m} today={today} />,
                })),
                ...tasks.map((t) => ({ key: t.id, node: <CalendarItem task={t} today={today} /> })),
              ];
              const hidden = items.length - CELL_LIMIT;
              const counts = [
                tasks.length ? plural(tasks.length, 'task') : '',
                marks.length ? plural(marks.length, 'milestone') : '',
              ].filter(Boolean);
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
                    aria-label={`${formatFullDate(day)}${counts.length ? `, ${counts.join(', ')}` : ''}`}
                    onClick={() => onOpenDay(day)}
                  >
                    {dayOfMonth(day)}
                  </button>
                  <ul className="cal-items">
                    {items.slice(0, hidden > 0 ? CELL_LIMIT - 1 : CELL_LIMIT).map((item) => (
                      <li key={item.key}>{item.node}</li>
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

/** A milestone on its target date; opens its project, filtered to it (ADR-0020). */
function MilestoneItem({ milestone, today }: { milestone: MilestoneEntry; today: string }) {
  const { navigate } = useNavigation();
  const done = milestone.completedAt !== null;
  const overdue = !done && milestone.targetDate! < today;
  const state = overdue ? 'overdue' : done ? 'closed' : 'open';
  return (
    <button
      type="button"
      className={`cal-item cal-item--milestone cal-item--${state}`}
      title={`Milestone: ${milestone.name} (${milestone.projectName})`}
      onClick={() =>
        navigate({ name: 'project', id: milestone.projectId, milestoneId: milestone.id })
      }
    >
      <Flag className="cal-item__flag" aria-hidden />
      <span className="visually-hidden">Milestone: </span>
      <span className="cal-item__title">{milestone.name}</span>
      {state !== 'open' && (
        <span className="visually-hidden">{overdue ? ' (overdue)' : ' (done)'}</span>
      )}
    </button>
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
