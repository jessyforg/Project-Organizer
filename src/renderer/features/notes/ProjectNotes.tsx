import { Plus } from 'lucide-react';
import type { Project } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import { ErrorNotice } from '../../components/ui';
import { UNTITLED } from './NoteEditor';
import { NoteList } from './NoteList';

const SHOWN = 5;

/** The project's most recently updated notes, with links to the rest (R26). */
export function ProjectNotes({ project }: { project: Project }) {
  const { navigate } = useNavigation();
  const invalidate = useInvalidate();
  const toast = useToast();
  const notes = useQuery(`project-notes:${project.id}`, () =>
    window.api.notes.list({ projectId: project.id, includeArchived: true, limit: SHOWN + 1 }),
  );
  const archived = project.archivedAt !== null;

  const create = async () => {
    const result = await window.api.notes.create({ title: UNTITLED, projectId: project.id });
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    invalidate();
    navigate({ name: 'notes', noteId: result.data.id });
  };

  const list = notes.data ?? [];
  return (
    <section className="section" aria-labelledby="project-notes">
      <div className="section__header">
        <h2 id="project-notes">Notes</h2>
        <div className="page__actions">
          {list.length > SHOWN && (
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => navigate({ name: 'notes', noteId: null, projectId: project.id })}
            >
              All notes in this project
            </button>
          )}
          {!archived && (
            <button type="button" className="btn" onClick={() => void create()}>
              <Plus aria-hidden /> New note
            </button>
          )}
        </div>
      </div>
      {notes.error && <ErrorNotice error={notes.error} onRetry={notes.reload} />}
      {notes.data && list.length === 0 && <p className="muted">No notes in this project yet.</p>}
      {list.length > 0 && (
        <NoteList
          label={`Notes in ${project.name}`}
          notes={list.slice(0, SHOWN)}
          showProject={false}
        />
      )}
    </section>
  );
}
