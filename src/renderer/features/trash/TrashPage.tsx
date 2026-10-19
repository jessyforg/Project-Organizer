import { useState } from 'react';
import { FolderKanban, ListChecks, NotebookPen, RotateCcw, Trash2 } from 'lucide-react';
import type { TrashEntry } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { useToast } from '../../app/toasts';
import { ConfirmDialog, EmptyState, ErrorNotice, Loading, PageHeader } from '../../components/ui';
import { formatTimestamp, plural } from '../../lib/format';

const KIND_LABEL: Record<TrashEntry['kind'], string> = {
  project: 'Project',
  task: 'Task',
  note: 'Note',
};

const KIND_ICON = { project: FolderKanban, task: ListChecks, note: NotebookPen };

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
      <PageHeader
        title="Trash"
        description="Items are deleted permanently 30 days after they were moved here."
        actions={
          entries.length > 0 && (
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => setConfirm({ all: true })}
            >
              <Trash2 aria-hidden /> Empty trash
            </button>
          )
        }
      />
      {trash.error && <ErrorNotice error={trash.error} onRetry={trash.reload} />}
      {trash.loading && !trash.data && <Loading />}
      {trash.data && entries.length === 0 && (
        <div className="panel">
          <EmptyState icon={Trash2} title="The trash is empty.">
            Deleted tasks, notes, and projects stay here for 30 days, so you can restore them.
          </EmptyState>
        </div>
      )}
      {entries.length > 0 && (
        <ul className="trash-list" aria-label="Items in trash">
          {entries.map((entry) => {
            const Icon = KIND_ICON[entry.kind];
            return (
              <li key={entry.batchId} className="trash-row">
                <span className="trash-row__icon" aria-hidden="true">
                  <Icon />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="trash-row__title">
                    <strong title={entry.title}>{entry.title}</strong>
                    <span className="label">{KIND_LABEL[entry.kind]}</span>
                  </div>
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
            );
          })}
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
