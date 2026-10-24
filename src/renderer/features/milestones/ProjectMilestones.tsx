import { useId, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Filter,
  Flag,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import type { Milestone, Project } from '@shared/domain';
import { LIMITS } from '@shared/schemas';
import { useInvalidate, useQuery } from '../../app/data';
import { useToast } from '../../app/toasts';
import { Dialog, MenuButton, ProgressMeter, type MenuItem } from '../../components/ui';
import { formatDate, localToday } from '../../lib/format';

/** Overdue: the target date has passed and the milestone is not complete (ADR-0020). */
export function isOverdue(milestone: Milestone, today: string): boolean {
  return (
    milestone.completedAt === null && milestone.targetDate !== null && milestone.targetDate < today
  );
}

/**
 * The project's milestones (ADR-0020): target date, progress over their tasks, and actions.
 * Choosing a milestone's name shows only its tasks.
 */
export function ProjectMilestones({
  project,
  onShowTasks,
}: {
  project: Project;
  onShowTasks: (milestoneId: string) => void;
}) {
  const milestones = useQuery(`milestones:${project.id}`, () =>
    window.api.milestones.list({ projectId: project.id }),
  );
  const invalidate = useInvalidate();
  const toast = useToast();
  const today = localToday();
  const [editing, setEditing] = useState<{ milestone?: Milestone } | null>(null);
  const readOnly = project.archivedAt !== null;
  const list = milestones.data ?? [];

  const failed = (message: string) => toast({ message, tone: 'error' });

  const setCompleted = async (m: Milestone, completed: boolean) => {
    const result = await window.api.milestones.setCompleted({ id: m.id, completed });
    invalidate();
    if (!result.ok) return failed(result.error.message);
    toast({ message: completed ? `Completed “${m.name}”.` : `Reopened “${m.name}”.` });
  };

  const setFavourite = async (m: Milestone, starred: boolean) => {
    const result = await window.api.favourites.set({ kind: 'milestone', id: m.id, starred });
    invalidate();
    if (!result.ok) failed(result.error.message);
  };

  const trash = async (m: Milestone) => {
    const result = await window.api.trash.trashMilestone({ id: m.id });
    invalidate();
    if (!result.ok) return failed(result.error.message);
    const { batchId } = result.data;
    toast({
      message: `“${m.name}” moved to trash. Its tasks stay in the project.`,
      actions: [
        {
          label: 'Undo',
          run: async () => {
            const restored = await window.api.trash.restore({ batchId });
            invalidate();
            if (!restored.ok) failed(restored.error.message);
          },
        },
      ],
    });
  };

  const itemsFor = (m: Milestone): MenuItem[] => [
    { label: 'Show its tasks', icon: Filter, onSelect: () => onShowTasks(m.id) },
    m.favourite
      ? {
          label: 'Remove from favourites',
          icon: StarOff,
          onSelect: () => void setFavourite(m, false),
        }
      : { label: 'Add to favourites', icon: Star, onSelect: () => void setFavourite(m, true) },
    ...(readOnly
      ? []
      : [
          { label: 'Edit…', icon: Pencil, onSelect: () => setEditing({ milestone: m }) },
          m.completedAt
            ? { label: 'Reopen', icon: RotateCcw, onSelect: () => void setCompleted(m, false) }
            : {
                label: 'Mark completed',
                icon: CheckCircle2,
                onSelect: () => void setCompleted(m, true),
              },
          {
            label: 'Move to trash',
            icon: Trash2,
            danger: true,
            separated: true,
            onSelect: () => void trash(m),
          },
        ]),
  ];

  return (
    <section className="section" aria-labelledby="project-milestones">
      <div className="section__header">
        <div className="section__title">
          <h2 id="project-milestones">Milestones</h2>
          {list.length > 0 && <span className="count">{list.length}</span>}
        </div>
        {!readOnly && (
          <button type="button" className="btn" onClick={() => setEditing({})}>
            <Plus aria-hidden /> New milestone
          </button>
        )}
      </div>
      {milestones.data && list.length === 0 && (
        <p className="muted small">
          No milestones yet. A milestone groups tasks toward a date, such as a beta or a launch.
        </p>
      )}
      {list.length > 0 && (
        <ul className="milestone-list" aria-label={`Milestones in ${project.name}`}>
          {list.map((m) => {
            const overdue = isOverdue(m, today);
            return (
              <li key={m.id} className="milestone-row">
                <Flag aria-hidden className="milestone-row__flag" />
                <div className="milestone-row__main">
                  <div className="milestone-row__name">
                    <button
                      type="button"
                      className="link"
                      title={`Show the tasks of ${m.name}`}
                      onClick={() => onShowTasks(m.id)}
                    >
                      {m.name}
                    </button>
                    {m.completedAt && <span className="label label--success">Done</span>}
                    {overdue && <span className="label label--danger">Overdue</span>}
                  </div>
                  {m.description && (
                    <span className="milestone-row__description">{m.description}</span>
                  )}
                </div>
                <ProgressMeter progress={m.progress} label={`${m.name} progress`} />
                <span className="milestone-row__date">
                  {m.targetDate ? `Target ${formatDate(m.targetDate, today)}` : 'No target date'}
                </span>
                <MenuButton label={`Actions for milestone ${m.name}`} items={itemsFor(m)} />
              </li>
            );
          })}
        </ul>
      )}
      <MilestoneDialog state={editing} projectId={project.id} onClose={() => setEditing(null)} />
    </section>
  );
}

function MilestoneDialog({
  state,
  projectId,
  onClose,
}: {
  state: { milestone?: Milestone } | null;
  projectId: string;
  onClose: () => void;
}) {
  const label = state?.milestone ? 'Edit milestone' : 'New milestone';
  return (
    <Dialog open={state !== null} onClose={onClose} label={label}>
      {state && (
        <MilestoneForm milestone={state.milestone} projectId={projectId} onDone={onClose} />
      )}
    </Dialog>
  );
}

function MilestoneForm({
  milestone,
  projectId,
  onDone,
}: {
  milestone: Milestone | undefined;
  projectId: string;
  onDone: () => void;
}) {
  const id = useId();
  const invalidate = useInvalidate();
  const [name, setName] = useState(milestone?.name ?? '');
  const [description, setDescription] = useState(milestone?.description ?? '');
  const [targetDate, setTargetDate] = useState(milestone?.targetDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('Enter a name for the milestone.');
    setBusy(true);
    const fields = {
      name,
      description: description.trim() ? description : null,
      targetDate: targetDate || null,
    };
    const result = milestone
      ? await window.api.milestones.update({ id: milestone.id, ...fields })
      : await window.api.milestones.create({ projectId, ...fields });
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    invalidate();
    onDone();
  };

  return (
    <form className="dialog__form" onSubmit={(e) => void submit(e)} noValidate>
      <h2>{milestone ? 'Edit milestone' : 'New milestone'}</h2>
      <div className="field">
        <label htmlFor={`${id}-name`}>Name</label>
        <input
          id={`${id}-name`}
          className="input"
          value={name}
          maxLength={LIMITS.name}
          autoFocus
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p id={`${id}-error`} className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-target`}>Target date</label>
        <input
          id={`${id}-target`}
          className="input"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-description`}>Description</label>
        <textarea
          id={`${id}-description`}
          className="textarea"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {milestone ? 'Save milestone' : 'Create milestone'}
        </button>
      </div>
    </form>
  );
}
