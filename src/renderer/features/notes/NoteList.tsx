import type { NoteSummary } from '@shared/domain';
import { useNavigation } from '../../app/navigation';
import { formatTimestamp } from '../../lib/format';
import { useLookups } from '../tasks/useLookups';

/** Note rows that open the note on the Notes screen. */
export function NoteList({
  notes,
  label,
  selectedId,
  showProject = true,
}: {
  notes: NoteSummary[];
  label: string;
  selectedId?: string | null;
  showProject?: boolean;
}) {
  const { navigate } = useNavigation();
  const { projects } = useLookups();
  return (
    <ul className="note-list" aria-label={label}>
      {notes.map((note) => (
        <li key={note.id}>
          <button
            type="button"
            className="note-row"
            aria-current={note.id === selectedId ? 'true' : undefined}
            onClick={() => navigate({ name: 'notes', noteId: note.id })}
          >
            <span className="note-row__title">{note.title}</span>
            {note.excerpt && <span className="note-row__excerpt">{note.excerpt}</span>}
            <span className="note-row__meta">
              {showProject && projects.get(note.projectId) && (
                <>{projects.get(note.projectId)!.name} · </>
              )}
              Updated {formatTimestamp(note.updatedAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
