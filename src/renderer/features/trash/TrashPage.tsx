import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { TrashEntry } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { useToast } from '../../app/toasts';
import { ConfirmDialog, ErrorNotice, Loading } from '../../components/ui';
import { formatTimestamp, plural } from '../../lib/format';

/** Recoverable deletion (R14): restore, delete permanently, or empty the trash. */
export function TrashPage() {
  const trash = useQuery('trash', () => window.api.trash.list());
  const invalidate = useInvalidate();
  const toast = useToast();
  const [confirm, setConfirm] = useState<{ entry: TrashEntry } | { all: true } | null>(null);

  const restore = async (entry: TrashEntry) => {
    const result = await window.api.trash.restore({ batchId: entry.batchId });
    invalidate();
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    const unresolved = result.data.unresolvedDependencies.length;
    toast({
      message:
        unresolved > 0
          ? `Restored “${entry.title}”. ${plural(unresolved, 'dependency', 'dependencies')} still point to tasks in the trash.`
          : `Restored “${entry.title}”.`,
    });
  };

  const destroy = async () => {
    const target = confirm;
    setConfirm(null);
    if (!target) return;
    const result =
      'all' in target
        ? await window.api.trash.empty()
        : await window.api.trash.deletePermanently({ batchId: target.entry.batchId });
    invalidate();
    if (!result.ok) toast({ message: result.error.message, tone: 'error' });
  };

  const entries = trash.data ?? [];

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>Trash</h1>
          <p className="muted">Items are deleted permanently 30 days after they were moved here.</p>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => setConfirm({ all: true })}
          >
            <Trash2 aria-hidden /> Empty trash
          </button>
        )}
      </header>
      {trash.error && <ErrorNotice error={trash.error} onRetry={trash.reload} />}
      {trash.loading && !trash.data && <Loading />}
      {trash.data && entries.length === 0 && <p className="muted">The trash is empty.</p>}
      {entries.length > 0 && (
        <ul className="task-list" aria-label="Items in trash">
          {entries.map((entry) => (
            <li key={entry.batchId} className="trash-row">
              <div>
                <strong>{entry.title}</strong>{' '}
                <span className="label">{entry.kind === 'project' ? 'Project' : 'Task'}</span>
                <p className="muted small">
                  {entry.projectName ? `In ${entry.projectName}. ` : ''}
                  {entry.itemCount > 1 ? `${plural(entry.itemCount, 'item')}. ` : ''}
                  Moved here {formatTimestamp(entry.deletedAt)}; deleted permanently after{' '}
                  {formatTimestamp(entry.purgeAfter)}.
                </p>
              </div>
              <div className="page__actions">
                <button type="button" className="btn" onClick={() => void restore(entry)}>
                  <RotateCcw aria-hidden /> Restore
                </button>
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={() => setConfirm({ entry })}
                >
                  Delete permanently
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm && 'all' in confirm
            ? 'Empty the trash?'
            : `Delete “${confirm?.entry.title ?? ''}” permanently?`
        }
        body="This cannot be undone. Copies in backups or exports you made earlier are not affected."
        confirmLabel={confirm && 'all' in confirm ? 'Empty trash' : 'Delete permanently'}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => void destroy()}
      />
    </div>
  );
}
