import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { ArrowDown, ArrowUp, Columns3 } from 'lucide-react';
import {
  PRIORITIES,
  type CustomField,
  type CustomValue,
  type Priority,
  type Task,
  type TaskTableColumn,
} from '@shared/domain';
import type { UpdateTaskInput } from '@shared/schemas';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import { Dialog } from '../../components/ui';
import { localToday, PRIORITY_LABEL } from '../../lib/format';
import {
  cellText,
  columnsFor,
  defaultLayout,
  MAX_WIDTH,
  MIN_WIDTH,
  normalizeLayout,
  sortTasks,
  tableRows,
  type ColumnDef,
  type ColumnId,
  type GroupBy,
  type Lookups,
  type SortDirection,
  type TableView,
} from './table-model';
import { fieldEditValue, fieldMatches, parseFieldEdit } from '../fields/field-values';
import { useLookups } from './useLookups';
import { useTaskActions } from './useTaskActions';

/** Tables load at most this many tasks (ADR-0022). */
export const TABLE_LIMIT = 5000;

/** Rows are this tall, so only the ones in view need to be in the page (ADR-0022). */
export const ROW_HEIGHT = 40;
const OVERSCAN = 10;
const RESIZE_STEP = 16;

const GROUPS: { id: GroupBy; label: string; views: TableView[] }[] = [
  { id: 'none', label: 'None', views: ['project', 'myTasks'] },
  { id: 'status', label: 'Status', views: ['project', 'myTasks'] },
  { id: 'priority', label: 'Priority', views: ['project', 'myTasks'] },
  { id: 'milestone', label: 'Milestone', views: ['project', 'myTasks'] },
  { id: 'project', label: 'Project', views: ['myTasks'] },
];

/** The value a cell's editor starts with and writes back. */
function editValue(task: Task, column: ColumnId): string {
  switch (column) {
    case 'title':
      return task.title;
    case 'status':
      return task.statusId;
    case 'priority':
      return task.priority ?? '';
    case 'dueDate':
      return task.dueDate ?? '';
    case 'startDate':
      return task.startDate ?? '';
    case 'milestone':
      return task.milestoneId ?? '';
    default:
      return '';
  }
}

function patchFor(column: ColumnId, value: string): Omit<UpdateTaskInput, 'id'> {
  switch (column) {
    case 'title':
      return { title: value };
    case 'status':
      return { statusId: value };
    case 'priority':
      return { priority: value ? (value as Priority) : null };
    case 'dueDate':
      return { dueDate: value || null };
    case 'startDate':
      return { startDate: value || null };
    case 'milestone':
      return { milestoneId: value || null };
    default:
      return {};
  }
}

/**
 * Tasks as a table (ADR-0022): sortable, groupable, resizable columns whose layout is saved
 * per view, inline editing through the same update path as the task panel, and the WAI-ARIA
 * grid keyboard pattern. Only the rows in view are rendered.
 */
export function TaskTable({
  view,
  tasks,
  label,
  fields = [],
}: {
  view: TableView;
  tasks: Task[];
  label: string;
  /** The project's custom fields, shown as columns on project tables (ADR-0023). */
  fields?: CustomField[];
}) {
  const id = useId();
  const settings = useQuery('settings', () => window.api.settings.get());
  const statuses = useQuery('statuses:all', () => window.api.statuses.listAll());
  const milestones = useQuery('milestones:all', () => window.api.milestones.listAll());
  const lookupsData = useLookups();
  const { openTask } = useNavigation();
  const { applyUpdate } = useTaskActions();
  const invalidate = useInvalidate();
  const toast = useToast();

  const [sort, setSort] = useState<{ column: ColumnId; direction: SortDirection } | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  /** The field filter (ADR-0023): a field and the value wanted. */
  const [fieldFilter, setFieldFilter] = useState({ fieldId: '', value: '' });
  const [columnsOpen, setColumnsOpen] = useState(false);
  /** A width being dragged, before it is saved. */
  const [dragWidth, setDragWidth] = useState<{ id: string; width: number } | null>(null);
  /** The layout just chosen, shown until the saved setting catches up. */
  const [pending, setPending] = useState<TaskTableColumn[] | null>(null);
  const [focus, setFocus] = useState({ row: 0, col: 0 });
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 600 });
  const wantFocus = useRef(false);
  const body = useRef<HTMLDivElement>(null);

  const lookups: Lookups = {
    statuses: new Map((statuses.data ?? []).map((s) => [s.id, s])),
    milestones: new Map((milestones.data ?? []).map((m) => [m.id, m])),
    projects: lookupsData.projects,
    tags: lookupsData.tags,
    fields: new Map(fields.map((f) => [f.id, f])),
    today: localToday(),
  };
  const DEF = new Map(columnsFor(view, fields).map((c) => [c.id as string, c]));
  // A change shows at once; the saved layout takes over once the setting has reloaded.
  const saved = normalizeLayout(view, settings.data?.taskTables[view], fields);
  const layout = (pending ?? saved).map((c) =>
    dragWidth?.id === c.id ? { ...c, width: dragWidth.width } : c,
  );
  const shown = layout.filter((c) => !c.hidden);
  const defs = shown.map((c) => DEF.get(c.id)!);
  const template = shown.map((c) => `${c.width}px`).join(' ');
  const filterField = lookups.fields.get(fieldFilter.fieldId);
  const filtered = filterField
    ? tasks.filter((t) =>
        fieldMatches(filterField, t.customValues[filterField.id], fieldFilter.value),
      )
    : tasks;
  const groupLabel = DEF.get(groupBy)?.label.toLocaleLowerCase() ?? groupBy;
  const rows = tableRows(sortTasks(filtered, sort, lookups), groupBy, lookups, `No ${groupLabel}`);
  const groups = [
    ...GROUPS.filter((g) => g.views.includes(view)),
    ...fields
      .filter((f) => f.type === 'select' || f.type === 'checkbox')
      .map((f) => ({ id: `field:${f.id}` as GroupBy, label: f.name, views: [view] })),
  ];

  // Keep the focused cell inside the table when rows or columns change.
  const row = Math.min(focus.row, Math.max(0, rows.length - 1));
  const col = rows[row]?.kind === 'group' ? 0 : Math.min(focus.col, shown.length - 1);

  // The rows in view, plus some above and below.
  const first = Math.max(0, Math.floor(scroll.top / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(
    rows.length,
    Math.ceil((scroll.top + scroll.height) / ROW_HEIGHT) + OVERSCAN,
  );

  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return;
    const measure = () =>
      setScroll({ top: element.scrollTop, height: element.clientHeight || 600 });
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, []);

  // After moving with the keyboard, focus the cell once it is rendered.
  useEffect(() => {
    if (!wantFocus.current || editing) return;
    wantFocus.current = false;
    const target = body.current?.querySelector<HTMLElement>(
      `[data-row="${row}"][data-col="${col}"]`,
    );
    // Scroll only as far as needed, never re-centring the table.
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });

  const saveLayout = async (next: TaskTableColumn[]) => {
    setPending(next);
    setDragWidth(null);
    const tables = settings.data?.taskTables ?? {};
    // Keep other projects' field columns, newest first, within the 40 columns allowed.
    const others = (tables[view] ?? []).filter(
      (c) => c.id.startsWith('field:') && !next.some((n) => n.id === c.id),
    );
    const merged = [...next, ...others].slice(0, 40);
    const result = await window.api.settings.update({ taskTables: { ...tables, [view]: merged } });
    if (!result.ok) {
      setPending(null);
      toast({ message: result.error.message, tone: 'error' });
    }
    invalidate();
  };

  const setWidth = (columnId: string, width: number) =>
    void saveLayout(
      layout.map((c) =>
        c.id === columnId ? { ...c, width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)) } : c,
      ),
    );

  const moveTo = (nextRow: number, nextCol: number) => {
    const r = Math.min(Math.max(0, nextRow), rows.length - 1);
    const c = rows[r]?.kind === 'group' ? 0 : Math.min(Math.max(0, nextCol), shown.length - 1);
    setFocus({ row: r, col: c });
    // Scroll the row into view; the effect focuses it after rendering.
    const element = body.current;
    if (element) {
      const top = r * ROW_HEIGHT;
      if (top < element.scrollTop) element.scrollTop = top;
      else if (top + ROW_HEIGHT > element.scrollTop + element.clientHeight) {
        element.scrollTop = top + ROW_HEIGHT - element.clientHeight;
      }
      setScroll({ top: element.scrollTop, height: element.clientHeight || 600 });
    }
    wantFocus.current = true;
  };

  const commit = async (task: Task, column: ColumnId, value: string) => {
    setEditing(null);
    wantFocus.current = true;
    const field = DEF.get(column)?.field;
    if (field) return commitField(task, field, value);
    const before = editValue(task, column);
    if (value === before || (column === 'title' && !value.trim())) return;
    const ok = applyUpdate(
      await window.api.tasks.update({ id: task.id, ...patchFor(column, value) }),
    );
    if (!ok) return;
    toast({
      message: `Changed ${DEF.get(column)!.label.toLowerCase()} of “${column === 'title' ? value : task.title}”.`,
      actions: [
        {
          label: 'Undo',
          run: async () => {
            applyUpdate(
              await window.api.tasks.update({ id: task.id, ...patchFor(column, before) }),
            );
          },
        },
      ],
    });
  };

  /** A custom field's cell saves through its own channel, with the same Undo (ADR-0023). */
  const commitField = async (task: Task, field: CustomField, text: string) => {
    const before = task.customValues[field.id];
    if (text === fieldEditValue(field, before)) return;
    const value = parseFieldEdit(field, text);
    if (value === undefined) {
      return toast({ message: `“${field.name}” needs a number.`, tone: 'error' });
    }
    const save = async (next: CustomValue | null) => {
      const result = await window.api.customFields.setValue({
        taskId: task.id,
        fieldId: field.id,
        value: next,
      });
      invalidate();
      if (!result.ok) toast({ message: result.error.message, tone: 'error' });
      return result.ok;
    };
    if (!(await save(value))) return;
    toast({
      message: `Changed ${field.name} of “${task.title}”.`,
      actions: [{ label: 'Undo', run: async () => void (await save(before ?? null)) }],
    });
  };

  const onGridKeyDown = (event: KeyboardEvent) => {
    if (editing) return;
    // The cell the key was pressed in (normally the focused one).
    const at = (event.target as HTMLElement).closest<HTMLElement>('[data-row]');
    const r = at ? Number(at.dataset['row']) : row;
    const c = at ? Number(at.dataset['col']) : col;
    const page = Math.max(1, Math.floor(scroll.height / ROW_HEIGHT) - 1);
    const target = rows[r];
    const moves: Record<string, () => void> = {
      ArrowDown: () => moveTo(r + 1, c),
      ArrowUp: () => moveTo(r - 1, c),
      ArrowRight: () => moveTo(r, c + 1),
      ArrowLeft: () => moveTo(r, c - 1),
      PageDown: () => moveTo(r + page, c),
      PageUp: () => moveTo(r - page, c),
      Home: () => (event.ctrlKey ? moveTo(0, 0) : moveTo(r, 0)),
      End: () =>
        event.ctrlKey ? moveTo(rows.length - 1, shown.length - 1) : moveTo(r, shown.length - 1),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      move();
      return;
    }
    if (target?.kind !== 'task') return;
    const column = defs[c]!;
    if (event.key === 'Enter' && column.id === 'title') {
      event.preventDefault();
      openTask(target.task.id);
    } else if ((event.key === 'Enter' || event.key === 'F2') && column.editor) {
      event.preventDefault();
      setEditing({ row: r, col: c });
    }
  };

  const sortBy = (column: ColumnId) =>
    setSort((current) =>
      current?.column !== column
        ? { column, direction: 'ascending' }
        : current.direction === 'ascending'
          ? { column, direction: 'descending' }
          : null,
    );

  const startResize = (event: PointerEvent<HTMLDivElement>, column: TaskTableColumn) => {
    event.preventDefault();
    const startX = event.clientX;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    let width = column.width;
    const onMove = (e: globalThis.PointerEvent) => {
      width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, column.width + e.clientX - startX));
      setDragWidth({ id: column.id, width });
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      setWidth(column.id, width);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  };

  return (
    <div className="task-table">
      <div className="task-table__toolbar">
        <div className="inline-field">
          <label htmlFor={`${id}-group`}>Group by</label>
          <select
            id={`${id}-group`}
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        {fields.length > 0 && (
          <FieldFilter fields={fields} value={fieldFilter} onChange={setFieldFilter} />
        )}
        <button type="button" className="btn btn--small" onClick={() => setColumnsOpen(true)}>
          <Columns3 aria-hidden /> Columns
        </button>
        <p className="task-table__hint" id={`${id}-hint`}>
          Arrow keys move between cells. Enter or F2 edits; Enter on a title opens the task, F2
          renames it. Esc cancels.
        </p>
      </div>
      <div
        role="grid"
        aria-label={label}
        aria-describedby={`${id}-hint`}
        aria-rowcount={rows.length + 1}
        aria-colcount={shown.length}
        className="task-table__grid"
      >
        <div role="rowgroup" className="task-table__head">
          <div
            role="row"
            aria-rowindex={1}
            className="task-table__row"
            style={{ gridTemplateColumns: template }}
          >
            {shown.map((column, i) => {
              const def = defs[i]!;
              const sorted = sort?.column === def.id ? sort.direction : undefined;
              return (
                <div
                  key={column.id}
                  role="columnheader"
                  aria-colindex={i + 1}
                  aria-sort={sorted ?? 'none'}
                  className="task-table__header"
                >
                  <button type="button" className="task-table__sort" onClick={() => sortBy(def.id)}>
                    {def.label}
                    {sorted === 'ascending' && <ArrowUp aria-hidden />}
                    {sorted === 'descending' && <ArrowDown aria-hidden />}
                  </button>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${def.label}`}
                    aria-valuemin={MIN_WIDTH}
                    aria-valuemax={MAX_WIDTH}
                    aria-valuenow={column.width}
                    tabIndex={0}
                    className="task-table__resize"
                    onPointerDown={(e) => startResize(e, column)}
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                      e.preventDefault();
                      setWidth(
                        column.id,
                        column.width + (e.key === 'ArrowRight' ? RESIZE_STEP : -RESIZE_STEP),
                      );
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div
          ref={body}
          role="rowgroup"
          className="task-table__body"
          onScroll={(e) =>
            setScroll({
              top: e.currentTarget.scrollTop,
              height: e.currentTarget.clientHeight || 600,
            })
          }
          onKeyDown={onGridKeyDown}
        >
          <div style={{ height: first * ROW_HEIGHT }} aria-hidden="true" />
          {rows.slice(first, last).map((entry, offset) => {
            const r = first + offset;
            if (entry.kind === 'group') {
              return (
                <div
                  key={`group:${entry.key}`}
                  role="row"
                  aria-rowindex={r + 2}
                  className="task-table__row task-table__row--group"
                >
                  <div
                    role="gridcell"
                    aria-colspan={shown.length}
                    aria-colindex={1}
                    data-row={r}
                    data-col={0}
                    tabIndex={r === row ? 0 : -1}
                    className="task-table__cell task-table__group"
                    onFocus={() => setFocus({ row: r, col: 0 })}
                  >
                    {entry.label} <span className="count">{entry.count}</span>
                  </div>
                </div>
              );
            }
            const task = entry.task;
            return (
              <div
                key={task.id}
                role="row"
                aria-rowindex={r + 2}
                className="task-table__row"
                style={{ gridTemplateColumns: template }}
                data-done={task.statusCategory === 'done' ? 'true' : undefined}
              >
                {defs.map((def, c) => {
                  const isEditing = editing?.row === r && editing.col === c;
                  return (
                    <div
                      key={def.id}
                      role="gridcell"
                      aria-colindex={c + 1}
                      aria-readonly={def.editor ? undefined : true}
                      data-row={r}
                      data-col={c}
                      tabIndex={!isEditing && r === row && c === col ? 0 : -1}
                      className={`task-table__cell task-table__cell--${def.id}`}
                      onFocus={() => {
                        if (!isEditing) setFocus({ row: r, col: c });
                      }}
                      onClick={() => def.id === 'title' && !isEditing && openTask(task.id)}
                      onDoubleClick={() =>
                        def.editor && def.id !== 'title' && setEditing({ row: r, col: c })
                      }
                    >
                      {isEditing ? (
                        <CellEditor
                          task={task}
                          def={def}
                          lookups={lookups}
                          onCommit={(value) => void commit(task, def.id, value)}
                          onCancel={() => {
                            setEditing(null);
                            wantFocus.current = true;
                          }}
                        />
                      ) : (
                        <span className="task-table__text">{cellText(task, def.id, lookups)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div style={{ height: (rows.length - last) * ROW_HEIGHT }} aria-hidden="true" />
        </div>
      </div>
      <ColumnsDialog
        open={columnsOpen}
        view={view}
        layout={layout}
        fields={fields}
        onClose={() => setColumnsOpen(false)}
        onChange={(next) => void saveLayout(next)}
      />
    </div>
  );
}

/** The editor inside a cell: Enter commits, Escape cancels, a choice commits at once. */
function CellEditor({
  task,
  def,
  lookups,
  onCommit,
  onCancel,
}: {
  task: Task;
  def: ColumnDef;
  lookups: Lookups;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(
    def.field
      ? fieldEditValue(def.field, task.customValues[def.field.id])
      : editValue(task, def.id),
  );
  const done = useRef(false);
  const finish = (commit: boolean, next = value) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(next);
    else onCancel();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(false);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      finish(true);
    }
  };
  const common = {
    autoFocus: true,
    'aria-label': `${def.label} of ${task.title}`,
    className: 'task-table__editor',
    onKeyDown,
  };
  const field = def.field;
  const inputType =
    def.editor === 'date' || field?.type === 'date'
      ? 'date'
      : field?.type === 'number'
        ? 'number'
        : 'text';
  if (
    def.editor === 'text' ||
    def.editor === 'date' ||
    (field && field.type !== 'select' && field.type !== 'checkbox')
  ) {
    return (
      <input
        {...common}
        type={inputType}
        value={value}
        maxLength={500}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(true)}
      />
    );
  }
  const options = field
    ? field.type === 'checkbox'
      ? [
          { value: '', label: 'No' },
          { value: 'yes', label: 'Yes' },
        ]
      : [{ value: '', label: '—' }, ...field.options.map((o) => ({ value: o.id, label: o.label }))]
    : def.editor === 'priority'
      ? [
          { value: '', label: 'No priority' },
          ...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })),
        ]
      : def.editor === 'status'
        ? [...lookups.statuses.values()]
            .filter((s) => s.projectId === task.projectId)
            .map((s) => ({ value: s.id, label: s.name }))
        : [
            { value: '', label: 'No milestone' },
            ...[...lookups.milestones.values()]
              .filter((m) => m.projectId === task.projectId)
              .map((m) => ({ value: m.id, label: m.name })),
          ];
  return (
    <select
      {...common}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        finish(true, e.target.value);
      }}
      onBlur={() => finish(false)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Show, hide, and reorder columns; Title stays first (ADR-0022). */
function ColumnsDialog({
  open,
  view,
  layout,
  fields,
  onClose,
  onChange,
}: {
  open: boolean;
  view: TableView;
  layout: TaskTableColumn[];
  fields: CustomField[];
  onClose: () => void;
  onChange: (next: TaskTableColumn[]) => void;
}) {
  const move = (index: number, step: -1 | 1) => {
    const next = [...layout];
    const [column] = next.splice(index, 1);
    next.splice(index + step, 0, column!);
    onChange(next);
  };
  const labels = new Map(columnsFor(view, fields).map((c) => [c.id as string, c.label]));
  return (
    <Dialog open={open} onClose={onClose} label="Table columns">
      {open && (
        <div className="dialog__form">
          <h2>Table columns</h2>
          <ul className="columns-list" aria-label="Columns">
            {layout.map((column, index) => {
              const name = labels.get(column.id)!;
              return (
                <li key={column.id} className="columns-list__item">
                  <label>
                    <input
                      type="checkbox"
                      checked={!column.hidden}
                      disabled={column.id === 'title'}
                      onChange={(e) =>
                        onChange(
                          layout.map((c) =>
                            c.id === column.id ? { ...c, hidden: !e.target.checked } : c,
                          ),
                        )
                      }
                    />
                    {name}
                  </label>
                  {column.id !== 'title' && (
                    <span className="columns-list__moves">
                      <button
                        type="button"
                        className="btn btn--quiet btn--icon btn--small"
                        aria-label={`Move ${name} left`}
                        disabled={index <= 1}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="btn btn--quiet btn--icon btn--small"
                        aria-label={`Move ${name} right`}
                        disabled={index === layout.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown aria-hidden />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="dialog__actions">
            <button
              type="button"
              className="btn dialog__actions-start"
              onClick={() => onChange(defaultLayout(view, fields))}
            >
              Reset columns
            </button>
            <button type="button" className="btn btn--primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Choose a field and the value wanted (ADR-0023). */
function FieldFilter({
  fields,
  value,
  onChange,
}: {
  fields: CustomField[];
  value: { fieldId: string; value: string };
  onChange: (next: { fieldId: string; value: string }) => void;
}) {
  const id = useId();
  const field = fields.find((f) => f.id === value.fieldId);
  const choices = field
    ? field.type === 'checkbox'
      ? [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ]
      : field.type === 'select' || field.type === 'multi_select'
        ? field.options.map((o) => ({ value: o.id, label: o.label }))
        : null
    : null;
  return (
    <div className="inline-field task-table__filter">
      <label htmlFor={`${id}-field`}>Field filter</label>
      <select
        id={`${id}-field`}
        value={value.fieldId}
        onChange={(e) => onChange({ fieldId: e.target.value, value: '' })}
      >
        <option value="">None</option>
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {field && choices && (
        <select
          aria-label={`Value of ${field.name}`}
          value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        >
          <option value="">Any</option>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      {field && !choices && (
        <input
          aria-label={`Value of ${field.name}`}
          className="input input--small"
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          value={value.value}
          onChange={(e) => onChange({ ...value, value: e.target.value })}
        />
      )}
    </div>
  );
}
