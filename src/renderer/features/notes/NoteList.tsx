import { Archive, Folder as FolderIcon } from 'lucide-react';
import type { NoteSummary } from '@shared/domain';
import { useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useContextMenu } from '../../components/ui';
import { formatTimestamp } from '../../lib/format';
import { useLookups } from '../tasks/useLookups';
import { useNoteActions } from './useNoteActions';

/**
 * Note rows that open the note. Right-click (or Shift+F10) offers the note's actions
 * (ADR-0015). The library variant shows each note's folder and tags as well.
 */
export function NoteList({
  notes,
  label,
  selectedId,
  showProject = true,
  variant = 'compact',
}: {
  notes: NoteSummary[];
  label: string;
  selectedId?: string | null;
  showProject?: boolean;
  variant?: 'compact' | 'library';
}) {
  const { navigate } = useNavigation();
  const { projects, tags } = useLookups();
  const folders = useQuery('note-folders', () => window.api.noteFolders.list());
  const folderName = new Map((folders.data ?? []).map((f) => [f.id, f.name]));
  const actions = useNoteActions();
  const context = useContextMenu();

  return (
    <>
      <ul className={`note-list note-list--${variant}`} aria-label={label}>
        {notes.map((note) => {
          const folder = note.folderId ? folderName.get(note.folderId) : undefined;
          return (
            <li key={note.id}>
              <button
                type="button"
                className="note-row"
                aria-current={note.id === selectedId ? 'true' : undefined}
                onClick={() => navigate({ name: 'notes', noteId: note.id })}
                {...context.bind(
                  `Actions for note ${note.title}`,
                  actions.itemsFor(note, { openable: true }),
                )}
              >
                <span className="note-row__title">
                  {note.title}
                  {note.archivedAt && (
                    <span className="label note-row__badge">
                      <Archive aria-hidden /> Archived
                    </span>
                  )}
                </span>
                {note.excerpt && <span className="note-row__excerpt">{note.excerpt}</span>}
                <span className="note-row__meta">
                  {variant === 'library' && folder && (
                    <span className="note-row__folder">
                      <FolderIcon aria-hidden /> {folder} ·{' '}
                    </span>
                  )}
                  {showProject && projects.get(note.projectId) && (
                    <>{projects.get(note.projectId)!.name} · </>
                  )}
                  Updated {formatTimestamp(note.updatedAt)}
                  {variant === 'library' && note.tagIds.length > 0 && (
                    <>
                      {' · '}
                      {note.tagIds
                        .map((id) => tags.get(id)?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {context.menu}
      {actions.dialogs}
    </>
  );
}
