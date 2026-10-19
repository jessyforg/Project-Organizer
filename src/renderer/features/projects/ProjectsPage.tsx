import { useState } from 'react';
import { Folder as FolderIcon, FolderKanban, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Folder, ProjectListItem } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import {
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorNotice,
  Loading,
  MenuButton,
  PageHeader,
  ProgressMeter,
  Swatch,
} from '../../components/ui';
import { formatDate, localToday } from '../../lib/format';
import { ProjectDialog } from './ProjectDialog';

export function ProjectsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [folderDialog, setFolderDialog] = useState<{ folder?: Folder } | null>(null);
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const invalidate = useInvalidate();
  const toast = useToast();
  const projects = useQuery(`projects:${showArchived}`, () =>
    window.api.projects.list({ includeArchived: showArchived }),
  );
  const folders = useQuery('folders', () => window.api.folders.list());

  const deleteFolder = async () => {
    if (!deleting) return;
    const result = await window.api.folders.delete({ id: deleting.id });
    setDeleting(null);
    invalidate();
    if (!result.ok) toast({ message: result.error.message, tone: 'error' });
  };

  const all = (projects.data ?? []).filter((p) => !p.isInbox);
  const groups: { folder: Folder | null; projects: ProjectListItem[] }[] = [
    ...(folders.data ?? []).map((folder) => ({
      folder,
      projects: all.filter((p) => p.folderId === folder.id),
    })),
    { folder: null, projects: all.filter((p) => p.folderId === null) },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Projects"
        description="Group projects into folders. Open a project to see its tasks, board, and notes."
        actions={
          <>
            <label className="chip">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>
            <button type="button" className="btn" onClick={() => setFolderDialog({})}>
              <FolderPlus aria-hidden /> New folder
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
              <Plus aria-hidden /> New project
            </button>
          </>
        }
      />
      {projects.error && <ErrorNotice error={projects.error} onRetry={projects.reload} />}
      {projects.loading && !projects.data && <Loading />}
      {projects.data && all.length === 0 && (
        <div className="panel">
          <EmptyState
            icon={FolderKanban}
            title="No projects yet."
            action={
              <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
                Create a project
              </button>
            }
          >
            Tasks you add without a project go to the Inbox.
          </EmptyState>
        </div>
      )}
      {all.length > 0 &&
        groups.map(({ folder, projects: items }) =>
          folder === null && items.length === 0 ? null : (
            <section
              key={folder?.id ?? 'none'}
              className="section"
              aria-label={folder?.name ?? 'No folder'}
            >
              <div className="section__header">
                <div className="section__title">
                  <FolderIcon aria-hidden width={16} height={16} className="muted" />
                  <h2>{folder?.name ?? 'No folder'}</h2>
                  <span className="count">{items.length}</span>
                </div>
                {folder && (
                  <MenuButton
                    label={`Actions for folder ${folder.name}`}
                    items={[
                      {
                        label: 'Rename folder',
                        icon: Pencil,
                        onSelect: () => setFolderDialog({ folder }),
                      },
                      {
                        label: 'Delete folder',
                        icon: Trash2,
                        danger: true,
                        onSelect: () => setDeleting(folder),
                      },
                    ]}
                  />
                )}
              </div>
              {items.length === 0 ? (
                <p className="muted small">No projects in this folder.</p>
              ) : (
                <ProjectRows projects={items} />
              )}
            </section>
          ),
        )}
      <ProjectDialog open={creating} onClose={() => setCreating(false)} />
      <FolderDialog state={folderDialog} onClose={() => setFolderDialog(null)} />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete the folder “${deleting?.name ?? ''}”?`}
        body="Its projects are kept and move to “No folder”."
        confirmLabel="Delete folder"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void deleteFolder()}
      />
    </div>
  );
}

function ProjectRows({ projects }: { projects: ProjectListItem[] }) {
  const { navigate } = useNavigation();
  const today = localToday();
  return (
    <ul className="project-list">
      {projects.map((p) => (
        <li key={p.id} className="project-row">
          <Swatch color={p.color} />
          <div className="project-row__main">
            <div className="project-row__name">
              <button
                type="button"
                className="link"
                title={p.name}
                onClick={() => navigate({ name: 'project', id: p.id })}
              >
                {p.name}
              </button>
              {p.archivedAt && <span className="label">Archived</span>}
              {p.status === 'completed' && <span className="label label--success">Completed</span>}
            </div>
            {p.description && <span className="project-row__description">{p.description}</span>}
          </div>
          <ProgressMeter progress={p.progress} label={`${p.name} progress`} />
          <span className="project-row__date">
            {p.targetDate ? `Target ${formatDate(p.targetDate, today)}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FolderDialog({
  state,
  onClose,
}: {
  state: { folder?: Folder } | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={state !== null}
      onClose={onClose}
      label={state?.folder ? 'Rename folder' : 'New folder'}
    >
      {state && <FolderForm folder={state.folder} onDone={onClose} />}
    </Dialog>
  );
}

function FolderForm({ folder, onDone }: { folder: Folder | undefined; onDone: () => void }) {
  const [name, setName] = useState(folder?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidate();
  return (
    <form
      className="dialog__form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError('Enter a folder name.');
        void (async () => {
          const result = folder
            ? await window.api.folders.rename({ id: folder.id, name })
            : await window.api.folders.create({ name });
          if (!result.ok) return setError(result.error.message);
          invalidate();
          onDone();
        })();
      }}
    >
      <h2>{folder ? 'Rename folder' : 'New folder'}</h2>
      <div className="field">
        <label htmlFor="folder-name">Folder name</label>
        <input
          id="folder-name"
          className="input"
          value={name}
          maxLength={200}
          autoFocus
          aria-invalid={error !== null}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          {folder ? 'Rename folder' : 'Create folder'}
        </button>
      </div>
    </form>
  );
}
