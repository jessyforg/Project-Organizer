import { useId, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { STATUS_CATEGORIES, type StatusCategory, type WorkflowStatus } from '@shared/domain';
import { useInvalidate } from '../../app/data';
import { useToast } from '../../app/toasts';
import { Dialog } from '../../components/ui';
import { CATEGORY_LABEL, plural } from '../../lib/format';

/** Rename, add, reorder, set default, and remove a project's statuses (R09). */
export function StatusManager({
  open,
  projectId,
  statuses,
  onClose,
}: {
  open: boolean;
  projectId: string;
  statuses: WorkflowStatus[];
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} label="Edit workflow">
      <div className="dialog__form">
        <h2>Workflow</h2>
        <p className="muted small">
          Each status belongs to a category. Progress counts tasks in a “Done” status as finished
          and leaves “Cancelled” tasks out.
        </p>
        <StatusEditor projectId={projectId} statuses={statuses} />
        <div className="dialog__actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function StatusEditor({ projectId, statuses }: { projectId: string; statuses: WorkflowStatus[] }) {
  const id = useId();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<StatusCategory>('in_progress');
  const [removing, setRemoving] = useState<WorkflowStatus | null>(null);
  const [replacement, setReplacement] = useState('');

  const run = async (promise: Promise<{ ok: boolean; error?: { message: string } }>) => {
    const result = await promise;
    if (!result.ok && result.error) toast({ message: result.error.message, tone: 'error' });
    invalidate();
    return result.ok;
  };

  const move = (index: number, delta: number) => {
    const ids = statuses.map((s) => s.id);
    const [moved] = ids.splice(index, 1);
    if (moved === undefined) return;
    ids.splice(index + delta, 0, moved);
    void run(window.api.statuses.reorder({ projectId, ids }));
  };

  const add = async () => {
    if (!newName.trim()) return;
    if (await run(window.api.statuses.add({ projectId, name: newName, category: newCategory }))) {
      setNewName('');
    }
  };

  const remove = async () => {
    if (!removing || !replacement) return;
    const result = await window.api.statuses.remove({
      id: removing.id,
      replacementStatusId: replacement,
    });
    invalidate();
    setRemoving(null);
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    toast({
      message: `Status removed. ${plural(result.data.reassignedTasks, 'task')} moved to the replacement.`,
    });
  };

  return (
    <div className="section">
      <ul className="mini-list">
        {statuses.map((status, index) => (
          <li key={status.id} className="status-editor">
            <input
              className="input"
              defaultValue={status.name}
              aria-label={`Name of status ${status.name}`}
              maxLength={200}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== status.name) {
                  void run(window.api.statuses.rename({ id: status.id, name }));
                }
              }}
            />
            <span className="muted small">
              {CATEGORY_LABEL[status.category]}
              {status.isDefault && ', default'}
            </span>
            <span>
              <button
                type="button"
                className="btn btn--quiet btn--icon"
                aria-label={`Move ${status.name} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp aria-hidden />
              </button>
              <button
                type="button"
                className="btn btn--quiet btn--icon"
                aria-label={`Move ${status.name} down`}
                disabled={index === statuses.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown aria-hidden />
              </button>
              {!status.isDefault &&
                (status.category === 'todo' || status.category === 'in_progress') && (
                  <button
                    type="button"
                    className="btn btn--quiet"
                    onClick={() => void run(window.api.statuses.setDefault({ id: status.id }))}
                  >
                    Make default
                  </button>
                )}
              {!status.isDefault && (
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={() => {
                    setRemoving(status);
                    setReplacement(statuses.find((s) => s.id !== status.id)?.id ?? '');
                  }}
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {removing && (
        <div className="notice" role="group" aria-label={`Remove ${removing.name}`}>
          <div className="field">
            <label htmlFor={`${id}-replacement`}>Move tasks in “{removing.name}” to</label>
            <select
              id={`${id}-replacement`}
              className="select"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            >
              {statuses
                .filter((s) => s.id !== removing.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
          <button type="button" className="btn" onClick={() => setRemoving(null)}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={() => void remove()}>
            Remove status
          </button>
        </div>
      )}

      <div className="filters">
        <div className="field filters__search">
          <label htmlFor={`${id}-new`}>New status</label>
          <input
            id={`${id}-new`}
            className="input"
            value={newName}
            maxLength={200}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-category`}>Category</label>
          <select
            id={`${id}-category`}
            className="select"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as StatusCategory)}
          >
            {STATUS_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn" onClick={() => void add()}>
          Add status
        </button>
      </div>
    </div>
  );
}
