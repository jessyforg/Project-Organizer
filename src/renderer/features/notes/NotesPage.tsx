import { useDeferredValue, useEffect, useRef, useState, type DragEvent } from 'react';
import {
  Archive,
  ArrowLeft,
  Folder as FolderIcon,
  FolderPlus,
  Inbox,
  Maximize2,
  Minimize2,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { NoteFolder } from '@shared/domain';
import type { NoteSort } from '@shared/schemas';
import { useInvalidate, useQuery } from '../../app/data';
import { useFocusMode } from '../../app/focus';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import { FolderNameDialog } from '../../components/FolderNameDialog';
import {
  ConfirmDialog,
  ErrorNotice,
  Loading,
  MenuButton,
  PageHeader,
  useContextMenu,
  type MenuItem,
} from '../../components/ui';
import { LoadMore, PAGE_SIZE } from '../tasks/LoadMore';
import { useLookups } from '../tasks/useLookups';
import { importSummary, readMarkdownFiles } from './import';
import { NoteEditor, UNTITLED } from './NoteEditor';
import { NoteList } from './NoteList';

/** Which notes the library shows (ADR-0014, ADR-0015). */
type FolderFilter = 'all' | 'none' | 'archived' | { id: string };

const folderIdOf = (filter: FolderFilter) => (typeof filter === 'object' ? filter.id : null);
const sameFilter = (a: FolderFilter, b: FolderFilter) =>
  typeof a === 'object' && typeof b === 'object' ? a.id === b.id : a === b;

const SORT_LABEL: Record<NoteSort, string> = {
  updated: 'Last updated',
  created: 'Newest',
  title: 'Title (A–Z)',
};

/** Whether a paste lands where the user is typing, so it is not an import. */
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Notes (R26 / L1.5, ADR-0015): a library for finding notes, and a separate view for reading or
 * writing one. The page stays mounted between the two, so the library keeps its filters.
 */
export function NotesPage({
  noteId,
  projectId,
}: {
  noteId: string | null;
  projectId?: string | undefined;
}) {
  const [filters, setFilters] = useState<LibraryFilters>({
    text: '',
    project: projectId ?? '',
    tag: '',
    folder: 'all',
    sort: 'updated',
  });
  // Keyed by the note, so each note gets fresh data: reusing the previous note's data while
  // the next one loads would show, and then save, the wrong text.
  return noteId ? (
    <NoteView key={noteId} noteId={noteId} />
  ) : (
    <NotesLibrary filters={filters} setFilters={setFilters} />
  );
}

interface LibraryFilters {
  text: string;
  project: string;
  tag: string;
  folder: FolderFilter;
  sort: NoteSort;
}

function NotesLibrary({
  filters,
  setFilters,
}: {
  filters: LibraryFilters;
  setFilters: (update: (current: LibraryFilters) => LibraryFilters) => void;
}) {
  const lookups = useLookups();
  const { navigate } = useNavigation();
  const invalidate = useInvalidate();
  const toast = useToast();
  const { text, project, tag, folder, sort } = filters;
  const set = (patch: Partial<LibraryFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [folderDialog, setFolderDialog] = useState<{ folder?: NoteFolder } | null>(null);
  const [deleting, setDeleting] = useState<NoteFolder | null>(null);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const folderMenu = useContextMenu();
  const query = useDeferredValue({
    text: text || undefined,
    projectId: project || undefined,
    tagIds: tag ? [tag] : undefined,
    folderId: folder === 'all' || folder === 'archived' ? undefined : folderIdOf(folder),
    archived: folder === 'archived' ? ('only' as const) : undefined,
    sort,
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
    if (folderIdOf(folder) === deleting.id) set({ folder: 'all' });
    invalidate();
    if (!result.ok) toast({ message: result.error.message, tone: 'error' });
  };

  const folderItems = (f: NoteFolder): MenuItem[] => [
    { label: 'Rename folder', icon: Pencil, onSelect: () => setFolderDialog({ folder: f }) },
    {
      label: 'Delete folder',
      icon: Trash2,
      danger: true,
      separated: true,
      onSelect: () => setDeleting(f),
    },
  ];

  const folderButton = (
    filter: FolderFilter,
    label: string,
    icon: typeof Inbox,
    extra: { count?: number; menu?: { label: string; items: MenuItem[] } } = {},
  ) => {
    const Icon = icon;
    return (
      <button
        type="button"
        className="nav__item"
        aria-current={sameFilter(folder, filter) ? 'true' : undefined}
        onClick={() => set({ folder: filter })}
        {...(extra.menu ? folderMenu.bind(extra.menu.label, extra.menu.items) : {})}
      >
        <Icon aria-hidden />
        <span className="nav__label">{label}</span>
        {extra.count !== undefined && <span className="nav__count">{extra.count}</span>}
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
        className={dragging ? 'notes-library notes-library--dragging' : 'notes-library'}
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
        <nav className="note-folders" aria-label="Note folders">
          {folderButton('all', 'All notes', NotebookPen)}
          {(folders.data ?? []).map((f) => {
            const label = `Actions for folder ${f.name}`;
            return (
              <div key={f.id} className="note-folders__row">
                {folderButton({ id: f.id }, f.name, FolderIcon, {
                  count: f.noteCount,
                  menu: { label, items: folderItems(f) },
                })}
                <MenuButton label={label} items={folderItems(f)} />
              </div>
            );
          })}
          {(folders.data ?? []).length > 0 && folderButton('none', 'No folder', Inbox)}
          {folderButton('archived', 'Archived', Archive)}
          <button
            type="button"
            className="btn btn--quiet note-folders__new"
            onClick={() => setFolderDialog({})}
          >
            <FolderPlus aria-hidden /> New folder
          </button>
          {folderMenu.menu}
        </nav>
        <section className="notes-library__list" aria-label="All notes">
          <div className="toolbar notes-library__toolbar">
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
                onChange={(e) => set({ text: e.target.value })}
              />
            </div>
            <div className="inline-field">
              <label htmlFor="notes-project">Project</label>
              <select
                id="notes-project"
                value={project}
                onChange={(e) => set({ project: e.target.value })}
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
                <select id="notes-tag" value={tag} onChange={(e) => set({ tag: e.target.value })}>
                  <option value="">Any tag</option>
                  {lookups.tagList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="inline-field">
              <label htmlFor="notes-sort">Sort</label>
              <select
                id="notes-sort"
                value={sort}
                onChange={(e) => set({ sort: e.target.value as NoteSort })}
              >
                {(Object.keys(SORT_LABEL) as NoteSort[]).map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {notes.error && <ErrorNotice error={notes.error} onRetry={notes.reload} />}
          {folders.error && <ErrorNotice error={folders.error} onRetry={folders.reload} />}
          {notes.loading && !notes.data && <Loading />}
          {notes.data && notes.data.length === 0 && (
            <p className="muted">
              {folder === 'archived'
                ? 'No archived notes.'
                : filtered
                  ? 'No notes match these filters.'
                  : 'No notes yet. Create one to start.'}
            </p>
          )}
          {notes.data && notes.data.length > 0 && (
            <div className="panel">
              <NoteList label="Notes" notes={notes.data} variant="library" />
            </div>
          )}
          {notes.data && (
            <LoadMore
              shown={notes.data.length}
              limit={limit}
              noun="notes"
              onMore={() => setLimit((l) => l + PAGE_SIZE)}
            />
          )}
          <p className="muted small">
            Tip: right-click a note for its actions, or drop or paste .md files here to import them.
          </p>
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

/** One note at a comfortable reading width, with a way back and focus mode (ADR-0015). */
function NoteView({ noteId }: { noteId: string }) {
  const { navigate, route } = useNavigation();
  const { focused, setFocused } = useFocusMode();
  // Opened with Ctrl+click on a link: start in focus mode (after the previous note's view has
  // left it).
  const [startFocused] = useState(() => route.name === 'notes' && route.focus === true);
  useEffect(() => {
    if (startFocused) setFocused(true);
  }, [startFocused, setFocused]);
  const note = useQuery(`note:${noteId}`, () => window.api.notes.get({ id: noteId }));
  const folders = useQuery('note-folders', () => window.api.noteFolders.list());
  const folder = folders.data?.find((f) => f.id === note.data?.folderId);

  // Ctrl+Shift+F toggles focus mode; Escape leaves it, except in a dialog or menu. The editor
  // marks Escape as handled (ProseMirror selects the parent block), so defaultPrevented cannot
  // be used to tell; open menus stop Escape from reaching the window themselves.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFocused(!focused);
      } else if (event.key === 'Escape' && focused) {
        const inDialog = (event.target as Element | null)?.closest?.('dialog, [role="menu"]');
        if (!inDialog) setFocused(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focused, setFocused]);

  // Leaving the note leaves focus mode.
  useEffect(() => () => setFocused(false), [setFocused]);

  return (
    <div className={focused ? 'page note-page note-page--focused' : 'page note-page'}>
      <div className="note-page__bar">
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => navigate({ name: 'notes', noteId: null })}
        >
          <ArrowLeft aria-hidden /> All notes
        </button>
        <nav className="note-page__crumbs" aria-label="Breadcrumb">
          <span>Notes</span>
          {folder && (
            <>
              <span aria-hidden="true">/</span>
              <span>{folder.name}</span>
            </>
          )}
          {note.data?.archivedAt && (
            <>
              <span aria-hidden="true">/</span>
              <span>Archived</span>
            </>
          )}
        </nav>
        <button
          type="button"
          className="btn btn--quiet"
          aria-pressed={focused}
          title="Focus mode (Ctrl+Shift+F)"
          onClick={() => setFocused(!focused)}
        >
          {focused ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
          {focused ? 'Exit focus' : 'Focus'}
        </button>
      </div>
      <section className="note-page__editor" aria-label="Open note">
        {note.error && <ErrorNotice error={note.error} onRetry={note.reload} />}
        {!note.error && note.data?.id !== noteId && <Loading />}
        {note.data?.id === noteId && <NoteEditor note={note.data} />}
      </section>
    </div>
  );
}
