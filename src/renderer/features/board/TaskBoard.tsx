import { useId, useState, type DragEvent } from 'react';
import { ListTree, MoveRight } from 'lucide-react';
import type { Project, Task, WorkflowStatus } from '@shared/domain';
import { LIMITS } from '@shared/schemas';
import { useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { Dialog, ErrorNotice, Loading, PriorityLabel } from '../../components/ui';
import { CATEGORY_LABEL, describeDue, localToday } from '../../lib/format';
import { useTaskActions } from '../tasks/useTaskActions';

/** Where a card goes: a column, and the card it goes before (null = bottom). */
export interface BoardTarget {
  statusId: string;
  beforeTaskId: string | null;
}

/**
 * Kanban board (L1.1): one column per workflow status, top-level tasks as cards in manual
 * order. Cards move by drag and drop or, without a mouse, with each card's Move button.
 */
export function TaskBoard({ project, statuses }: { project: Project; statuses: WorkflowStatus[] }) {
  const query = {
    projectId: project.id,
    parentTaskId: null,
    sort: 'manual' as const,
    includeArchived: true,
    limit: LIMITS.listPageSize,
  };
  const tasks = useQuery(`board:${project.id}`, () => window.api.tasks.list(query));
  const { applyUpdate } = useTaskActions();
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<BoardTarget | null>(null);
  const [moving, setMoving] = useState<Task | null>(null);

  if (tasks.error) return <ErrorNotice error={tasks.error} onRetry={tasks.reload} />;
  if (!tasks.data) return <Loading />;
  const all = tasks.data;
  const columns = statuses.map((status) => ({
    status,
    cards: all.filter((t) => t.statusId === status.id),
  }));

  const move = async (task: Task, target: BoardTarget) => {
    const cards = all.filter((t) => t.statusId === target.statusId && t.id !== task.id);
    const index = target.beforeTaskId
      ? cards.findIndex((t) => t.id === target.beforeTaskId)
      : cards.length;
    const current = all.filter((t) => t.statusId === task.statusId);
    if (task.statusId === target.statusId && current.indexOf(task) === index) return;
    applyUpdate(await window.api.tasks.moveOnBoard({ id: task.id, ...target }));
  };

  const finishDrag = () => {
    setDragging(null);
    setDrop(null);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const task = all.find((t) => t.id === dragging);
    const target = drop;
    finishDrag();
    if (task && target) void move(task, target);
  };

  return (
    <>
      <div className="board" aria-label={`Board for ${project.name}`} role="region">
        {columns.map(({ status, cards }) => (
          <section
            key={status.id}
            className="board__column"
            aria-labelledby={`col-${status.id}`}
            data-drop={drop?.statusId === status.id ? 'true' : undefined}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              // Over the column's empty space: drop at the bottom.
              if (event.target === event.currentTarget || !drop || drop.statusId !== status.id) {
                setDrop({ statusId: status.id, beforeTaskId: null });
              }
            }}
            onDrop={onDrop}
          >
            <h3 id={`col-${status.id}`} className="board__heading">
              {status.name}
              <span className="board__count">{cards.length}</span>
              {status.name !== CATEGORY_LABEL[status.category] && (
                <span className="visually-hidden"> ({CATEGORY_LABEL[status.category]})</span>
              )}
            </h3>
            <ul className="board__cards">
              {cards.map((task) => (
                <BoardCard
                  key={task.id}
                  task={task}
                  dragging={dragging === task.id}
                  dropBefore={drop?.beforeTaskId === task.id}
                  onDragStart={() => setDragging(task.id)}
                  onDragEnd={finishDrag}
                  onDragOverCard={(upperHalf) => {
                    if (!dragging || dragging === task.id) return;
                    // Positions are counted without the card being dragged.
                    const rest = cards.filter((t) => t.id !== dragging);
                    const next = rest[rest.indexOf(task) + 1]?.id ?? null;
                    setDrop({ statusId: status.id, beforeTaskId: upperHalf ? task.id : next });
                  }}
                  onMove={() => setMoving(task)}
                />
              ))}
              {drop?.statusId === status.id && drop.beforeTaskId === null && dragging && (
                <li className="board__marker" aria-hidden="true" />
              )}
            </ul>
            {cards.length === 0 && !dragging && <p className="muted small">No tasks.</p>}
          </section>
        ))}
      </div>
      {moving && (
        <MoveDialog
          task={moving}
          columns={columns}
          onClose={() => setMoving(null)}
          onMove={(target) => {
            const task = moving;
            setMoving(null);
            void move(task, target);
          }}
        />
      )}
    </>
  );
}

function BoardCard({
  task,
  dragging,
  dropBefore,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onMove,
}: {
  task: Task;
  dragging: boolean;
  dropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCard: (upperHalf: boolean) => void;
  onMove: () => void;
}) {
  const { openTask, openTaskId } = useNavigation();
  const today = localToday();
  const due = task.dueDate ? describeDue(task.dueDate, today, task.statusCategory) : null;
  return (
    <>
      {dropBefore && <li className="board__marker" aria-hidden="true" />}
      <li
        className="card"
        draggable
        data-dragging={dragging ? 'true' : undefined}
        data-selected={openTaskId === task.id ? 'true' : undefined}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', task.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const box = event.currentTarget.getBoundingClientRect();
          onDragOverCard(event.clientY < box.top + box.height / 2);
        }}
      >
        <button type="button" className="card__title" onClick={() => openTask(task.id)}>
          {task.title}
        </button>
        <div className="card__meta">
          <PriorityLabel priority={task.priority} />
          {due && <span className={`due due--${due.state}`}>{due.label}</span>}
          {task.subtaskCount > 0 && (
            <span className="card__subtasks">
              <ListTree aria-hidden /> {task.completedSubtaskCount}/{task.subtaskCount}
              <span className="visually-hidden"> subtasks done</span>
            </span>
          )}
          <button
            type="button"
            className="btn btn--quiet card__move"
            aria-label={`Move ${task.title}`}
            onClick={onMove}
          >
            <MoveRight aria-hidden /> Move
          </button>
        </div>
      </li>
    </>
  );
}

/** The keyboard alternative to dragging: choose a column and a position. */
function MoveDialog({
  task,
  columns,
  onClose,
  onMove,
}: {
  task: Task;
  columns: { status: WorkflowStatus; cards: Task[] }[];
  onClose: () => void;
  onMove: (target: BoardTarget) => void;
}) {
  const id = useId();
  const [statusId, setStatusId] = useState(task.statusId);
  const others = (columns.find((c) => c.status.id === statusId)?.cards ?? []).filter(
    (t) => t.id !== task.id,
  );
  // Position = the card it goes before; '' = bottom. Default: where it is now, or the bottom.
  const currentCards = columns.find((c) => c.status.id === task.statusId)?.cards ?? [];
  const nextInPlace = currentCards[currentCards.indexOf(task) + 1]?.id ?? '';
  const [before, setBefore] = useState(nextInPlace);
  const changeColumn = (next: string) => {
    setStatusId(next);
    setBefore(next === task.statusId ? nextInPlace : '');
  };

  return (
    <Dialog open onClose={onClose} label={`Move ${task.title}`}>
      <form
        className="dialog__form"
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onMove({ statusId, beforeTaskId: before || null });
        }}
      >
        <h2>Move “{task.title}”</h2>
        <div className="field">
          <label htmlFor={`${id}-column`}>Column</label>
          <select
            id={`${id}-column`}
            className="select"
            value={statusId}
            onChange={(e) => changeColumn(e.target.value)}
          >
            {columns.map(({ status }) => (
              <option key={status.id} value={status.id}>
                {status.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-position`}>Position</label>
          <select
            id={`${id}-position`}
            className="select"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
          >
            {others.map((card, index) => (
              <option key={card.id} value={card.id}>
                {index === 0 ? 'At the top' : `After “${others[index - 1]!.title}”`}
              </option>
            ))}
            <option value="">
              {others.length === 0
                ? 'Only card'
                : `At the bottom (after “${others.at(-1)!.title}”)`}
            </option>
          </select>
        </div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" autoFocus>
            Move
          </button>
        </div>
      </form>
    </Dialog>
  );
}
