import { useState, type ReactNode } from 'react';
import {
  Archive,
  ArchiveRestore,
  ClipboardCopy,
  CopyPlus,
  Download,
  FolderInput,
  NotebookPen,
  Pencil,
  Trash2,
} from 'lucide-react';
import { TRASH_RETENTION_DAYS, type NoteSummary } from '@shared/domain';
import { LIMITS } from '@shared/schemas';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import { NameDialog } from '../../components/FolderNameDialog';
import { ConfirmDialog, Dialog, type MenuItem } from '../../components/ui';

/** What the actions need to know about a note; both lists and the editor can supply it. */
export type NoteRef = Pick<NoteSummary, 'id' | 'title' | 'folderId' | 'archivedAt'>;

export interface NoteActionOptions {
  /** Runs first; resolve false to stop (the editor saves pending edits here). */
  beforeAction?: () => Promise<boolean>;
  /** Replaces the rename dialog (the editor focuses its title field instead). */
  onRename?: () => void;
  /** Runs after the note moved to the trash, before leaving it. */
  onTrashed?: () => void;
  /** Adds "Open" first, for lists. */
  openable?: boolean;
}

/**
 * The actions on one note (ADR-0014, ADR-0015), shared by the editor's ⋯ menu and the
 * right-click menu on note rows. Render `dialogs` once beside the menus.
 */
export function useNoteActions() {
  const invalidate = useInvalidate();
  const toast = useToast();
  const { route, navigate } = useNavigation();
  const [renaming, setRenaming] = useState<NoteRef | null>(null);
  const [moving, setMoving] = useState<NoteRef | null>(null);
  const [trashing, setTrashing] = useState<{ note: NoteRef; options: NoteActionOptions } | null>(
    null,
  );

  const openNoteId = route.name === 'notes' ? route.noteId : null;
  const failed = (message: string) => toast({ message, tone: 'error' });

  const run = (options: NoteActionOptions, action: () => Promise<void>) => () =>
    void (async () => {
      if (options.beforeAction && !(await options.beforeAction())) return;
      await action();
    })();

  const setArchived = async (note: NoteRef, archived: boolean) => {
    const result = archived
      ? await window.api.notes.archive({ id: note.id })
      : await window.api.notes.unarchive({ id: note.id });
    invalidate();
    if (!result.ok) return failed(result.error.message);
    toast({
      message: archived ? `Archived “${note.title}”.` : `Unarchived “${note.title}”.`,
      actions: [{ label: 'Undo', run: () => setArchived(note, !archived) }],
    });
  };

  const trash = async ({ note, options }: { note: NoteRef; options: NoteActionOptions }) => {
    if (options.beforeAction && !(await options.beforeAction())) return;
    const result = await window.api.trash.trashNote({ id: note.id });
    invalidate();
    if (!result.ok) return failed(result.error.message);
    options.onTrashed?.();
    if (openNoteId === note.id) navigate({ name: 'notes', noteId: null });
    const { batchId } = result.data;
    toast({
      message: `“${note.title}” moved to trash.`,
      actions: [
        {
          label: 'Undo',
          run: async () => {
            const restored = await window.api.trash.restore({ batchId });
            invalidate();
            if (!restored.ok) return failed(restored.error.message);
          },
        },
      ],
    });
  };

  const itemsFor = (note: NoteRef, options: NoteActionOptions = {}): MenuItem[] => {
    const archived = note.archivedAt !== null;
    const items: MenuItem[] = [];
    if (options.openable) {
      items.push({
        label: 'Open',
        icon: NotebookPen,
        onSelect: () => navigate({ name: 'notes', noteId: note.id }),
      });
    }
    // Archived notes are read-only, so they cannot be renamed until unarchived.
    if (!archived) {
      items.push({
        label: 'Rename',
        icon: Pencil,
        onSelect: options.onRename ?? (() => setRenaming(note)),
      });
    }
    items.push(
      {
        label: 'Duplicate',
        icon: CopyPlus,
        onSelect: run(options, async () => {
          const result = await window.api.notes.duplicate({ id: note.id });
          invalidate();
          if (!result.ok) return failed(result.error.message);
          navigate({ name: 'notes', noteId: result.data.id });
          toast({ message: `Created “${result.data.title}”.` });
        }),
      },
      { label: 'Move to folder…', icon: FolderInput, onSelect: () => setMoving(note) },
      {
        label: archived ? 'Unarchive' : 'Archive',
        icon: archived ? ArchiveRestore : Archive,
        onSelect: run(options, () => setArchived(note, !archived)),
      },
      {
        label: 'Copy as Markdown',
        icon: ClipboardCopy,
        separated: true,
        onSelect: run(options, async () => {
          const result = await window.api.notes.copyMarkdown({ id: note.id });
          if (!result.ok) return failed(result.error.message);
          toast({ message: 'Copied the note as Markdown.' });
        }),
      },
      {
        label: 'Export as Markdown…',
        icon: Download,
        onSelect: run(options, async () => {
          const result = await window.api.notes.exportMarkdown({ id: note.id });
          if (!result.ok) return failed(result.error.message);
          if (result.data.saved) toast({ message: `Saved “${result.data.fileName}”.` });
        }),
      },
      {
        label: 'Move to trash…',
        icon: Trash2,
        danger: true,
        separated: true,
        onSelect: () => setTrashing({ note, options }),
      },
    );
    return items;
  };

  const dialogs: ReactNode = (
    <>
      <NameDialog
        open={renaming !== null}
        title="Rename note"
        fieldLabel="Note title"
        submitLabel="Rename note"
        initial={renaming?.title ?? ''}
        maxLength={LIMITS.title}
        onSave={(title) => window.api.notes.update({ id: renaming!.id, title })}
        onClose={() => setRenaming(null)}
      />
      <MoveToFolderDialog note={moving} onClose={() => setMoving(null)} />
      <ConfirmDialog
        open={trashing !== null}
        title={`Move “${trashing?.note.title ?? ''}” to the trash?`}
        body={`You can restore it from Trash for ${TRASH_RETENTION_DAYS} days.`}
        confirmLabel="Move to trash"
        danger
        onCancel={() => setTrashing(null)}
        onConfirm={() => {
          const target = trashing;
          setTrashing(null);
          if (target) void trash(target);
        }}
      />
    </>
  );

  return { itemsFor, dialogs };
}

function MoveToFolderDialog({ note, onClose }: { note: NoteRef | null; onClose: () => void }) {
  return (
    <Dialog open={note !== null} onClose={onClose} label="Move to folder">
      {note && <MoveToFolderForm note={note} onDone={onClose} />}
    </Dialog>
  );
}

function MoveToFolderForm({ note, onDone }: { note: NoteRef; onDone: () => void }) {
  const folders = useQuery('note-folders', () => window.api.noteFolders.list());
  const invalidate = useInvalidate();
  const [folderId, setFolderId] = useState(note.folderId ?? '');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="dialog__form"
      onSubmit={(e) => {
        e.preventDefault();
        void (async () => {
          const result = await window.api.notes.setFolder({
            id: note.id,
            folderId: folderId || null,
          });
          if (!result.ok) return setError(result.error.message);
          invalidate();
          onDone();
        })();
      }}
    >
      <h2>Move “{note.title}” to a folder</h2>
      <div className="field">
        <label htmlFor="move-note-folder">Folder</label>
        <select
          id="move-note-folder"
          className="select"
          value={folderId}
          autoFocus
          onChange={(e) => setFolderId(e.target.value)}
        >
          <option value="">No folder</option>
          {(folders.data ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
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
          Move note
        </button>
      </div>
    </form>
  );
}
