import { useDeferredValue, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  Folder as FolderIcon,
  FolderPlus,
  Inbox,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { NoteFolder } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import { FolderNameDialog } from '../../components/FolderNameDialog';
import {
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  Loading,
  MenuButton,
  PageHeader,
} from '../../components/ui';
import { LoadMore, PAGE_SIZE } from '../tasks/LoadMore';
import { useLookups } from '../tasks/useLookups';
import { importSummary, readMarkdownFiles } from './import';
import { NoteEditor, UNTITLED } from './NoteEditor';
import { NoteList } from './NoteList';

/** Which notes the list shows: all, those in no folder, or one folder's (ADR-0014). */
type FolderFilter = 'all' | 'none' | { id: string };

const folderIdOf = (filter: FolderFilter) => (typeof filter === 'object' ? filter.id : null);
const sameFilter = (a: FolderFilter, b: FolderFilter) =>
  typeof a === 'object' && typeof b === 'object' ? a.id === b.id : a === b;

/** Whether a paste lands where the user is typing, so it is not an import. */
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/** Markdown notes (R26 / L1.5): folders and a filterable list beside the open note. */
export function NotesPage({
  noteId,
  projectId,
}: {
  noteId: string | null;
  projectId?: string | undefined;
}) {
  const lookups = useLookups();
  const { navigate } = useNavigation();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [text, setText] = useState('');
  const [project, setProject] = useState(projectId ?? '');
  const [tag, setTag] = useState('');
  const [folder, setFolder] = useState<FolderFilter>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [folderDialog, setFolderDialog] = useState<{ folder?: NoteFolder } | null>(null);
  const [deleting, setDeleting] = useState<NoteFolder | null>(null);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const query = useDeferredValue({
    text: text || undefined,
    projectId: project || undefined,
    tagIds: tag ? [tag] : undefined,
    folderId: folder === 'all' ? undefined : folderIdOf(folder),
    limit,
  });
  const notes = useQuery(`notes:${JSON.stringify(query)}`, () => window.api.notes.list(query));
  const folders = useQuery('note-folders', () => window.api.noteFolders.list());

  const open = lookups.projectList.filter((p) => p.archivedAt === null);
  const filtered = Boolean(text || project || tag || folder !== 'all');
  /** New and imported notes go to the project and folder being viewed. */
  const target = {
    projectId: open.some((p) => p.id === project) ? project : undefined,
    folderId: folderIdOf(folder),
  };

  const create = async () => {
    const result = await window.api.notes.create({ title: UNTITLED, ...target });
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    invalidate();
    navigate({ name: 'notes', noteId: result.data.id });
  };

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const read = await readMarkdownFiles(files);
    if (read.notes.length === 0) {
      return toast({ message: importSummary(0, read.skipped), tone: 'error' });
    }
    const result = await window.api.notes.import({ ...target, notes: read.notes });
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    invalidate();
    navigate({ name: 'notes', noteId: result.data[0]!.id });
    toast({ message: importSummary(result.data.length, read.skipped) });
  };
  // The latest importFiles, for the document-level paste listener below.
  const importRef = useRef(importFiles);
  useEffect(() => {
    importRef.current = importFiles;
  });

  // Pasting Markdown files (copied in File Explorer) imports them, unless the user is typing.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0 || isEditable(event.target)) return;
      event.preventDefault();
      void importRef.current(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');
  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };
  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    void importFiles(Array.from(event.dataTransfer.files));
  };

  const deleteFolder = async () => {
    if (!deleting) return;
    const result = await window.api.noteFolders.delete({ id: deleting.id });
    setDeleting(null);
    if (folderIdOf(folder) === deleting.id) setFolder('all');
    invalidate();
    if (!result.ok) toast({ message: result.error.message, tone: 'error' });
  };

  const folderButton = (
    filter: FolderFilter,
    label: string,
    icon: typeof Inbox,
    count?: number,
  ) => {
    const Icon = icon;
    return (
      <button
        type="button"
        className="nav__item"
        aria-current={sameFilter(folder, filter) ? 'true' : undefined}
        onClick={() => setFolder(filter)}
      >
        <Icon aria-hidden />
        <span className="nav__label">{label}</span>
        {count !== undefined && <span className="nav__count">{count}</span>}
      </button>
    );
  };

  return (
    <div className="page notes-page">
      <PageHeader
        title="Notes"
        description="Markdown notes for your projects, in folders if you like. Loose notes go to the Inbox."
        actions={
          <>
            <button type="button" className="btn" onClick={() => picker.current?.click()}>
              <Upload aria-hidden /> Import Markdown
            </button>
            <button type="button" className="btn btn--primary" onClick={() => void create()}>
              <Plus aria-hidden /> New note
            </button>
          </>
        }
      />
      <input
        ref={picker}
        type="file"
        accept=".md,.markdown"
        multiple
        hidden
        data-testid="import-markdown-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void importFiles(files);
        }}
      />
      <div
        className={dragging ? 'notes notes--dragging' : 'notes'}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        {dragging && (
          <div className="notes__drop" aria-hidden="true">
            Drop Markdown files to import them
          </div>
        )}
        <section className="notes__list" aria-label="All notes">
          <nav className="note-folders" aria-label="Note folders">
            {folderButton('all', 'All notes', NotebookPen)}
            {(folders.data ?? []).map((f) => (
              <div key={f.id} className="note-folders__row">
                {folderButton({ id: f.id }, f.name, FolderIcon, f.noteCount)}
                <MenuButton
                  label={`Actions for folder ${f.name}`}
                  items={[
                    {
                      label: 'Rename folder',
                      icon: Pencil,
                      onSelect: () => setFolderDialog({ folder: f }),
                    },
                    {
                      label: 'Delete folder',
                      icon: Trash2,
                      danger: true,
                      separated: true,
                      onSelect: () => setDeleting(f),
                    },
                  ]}
                />
              </div>
            ))}
            {(folders.data ?? []).length > 0 && folderButton('none', 'No folder', Inbox)}
            <button
              type="button"
              className="btn btn--quiet note-folders__new"
              onClick={() => setFolderDialog({})}
            >
              <FolderPlus aria-hidden /> New folder
            </button>
          </nav>
          <div className="notes__filters">
            <div className="search-field">
              <label htmlFor="notes-search" className="visually-hidden">
                Search notes
              </label>
              <Search aria-hidden />
              <input
                id="notes-search"
                className="input"
                type="search"
                value={text}
                maxLength={200}
                placeholder="Search notes"
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <div className="inline-field">
              <label htmlFor="notes-project">Project</label>
              <select
                id="notes-project"
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">All projects</option>
                {open.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {lookups.tagList.length > 0 && (
              <div className="inline-field">
                <label htmlFor="notes-tag">Tag</label>
                <select id="notes-tag" value={tag} onChange={(e) => setTag(e.target.value)}>
                  <option value="">Any tag</option>
                  {lookups.tagList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          {notes.error && <ErrorNotice error={notes.error} onRetry={notes.reload} />}
          {folders.error && <ErrorNotice error={folders.error} onRetry={folders.reload} />}
          {notes.loading && !notes.data && <Loading />}
          {notes.data && notes.data.length === 0 && (
            <p className="muted">
              {filtered ? 'No notes match these filters.' : 'No notes yet. Create one to start.'}
            </p>
          )}
          {notes.data && notes.data.length > 0 && (
            <NoteList label="Notes" notes={notes.data} selectedId={noteId} />
          )}
          {notes.data && (
            <LoadMore
              shown={notes.data.length}
              limit={limit}
              noun="notes"
              onMore={() => setLimit((l) => l + PAGE_SIZE)}
            />
          )}
          <p className="muted small">Tip: drop or paste .md files here to import them.</p>
        </section>
        <section className="notes__editor" aria-label="Open note">
          {noteId ? (
            <NoteLoader key={noteId} noteId={noteId} />
          ) : (
            <div className="panel">
              <EmptyState icon={NotebookPen} title="No note open">
                Choose a note from the list, or create a new one.
              </EmptyState>
            </div>
          )}
        </section>
      </div>
      <FolderNameDialog
        state={folderDialog && { name: folderDialog.folder?.name }}
        onSave={(name) =>
          folderDialog?.folder
            ? window.api.noteFolders.rename({ id: folderDialog.folder.id, name })
            : window.api.noteFolders.create({ name })
        }
        onClose={() => setFolderDialog(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete the folder “${deleting?.name ?? ''}”?`}
        body="Its notes are kept and move to “No folder”."
        confirmLabel="Delete folder"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => void deleteFolder()}
      />
    </div>
  );
}

function NoteLoader({ noteId }: { noteId: string }) {
  const note = useQuery(`note:${noteId}`, () => window.api.notes.get({ id: noteId }));
  if (note.error) return <ErrorNotice error={note.error} onRetry={note.reload} />;
  if (!note.data) return <Loading />;
  return <NoteEditor note={note.data} />;
}
