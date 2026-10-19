import { useDeferredValue, useState } from 'react';
import { Plus } from 'lucide-react';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';
import { ErrorNotice, Loading } from '../../components/ui';
import { LoadMore, PAGE_SIZE } from '../tasks/LoadMore';
import { useLookups } from '../tasks/useLookups';
import { NoteEditor, UNTITLED } from './NoteEditor';
import { NoteList } from './NoteList';

/** Markdown notes (R26 / L1.5): a filterable list beside the open note. */
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
  const [limit, setLimit] = useState(PAGE_SIZE);
  const query = useDeferredValue({
    text: text || undefined,
    projectId: project || undefined,
    tagIds: tag ? [tag] : undefined,
    limit,
  });
  const notes = useQuery(`notes:${JSON.stringify(query)}`, () => window.api.notes.list(query));

  const open = lookups.projectList.filter((p) => p.archivedAt === null);
  const filtered = Boolean(text || project || tag);

  const create = async () => {
    const target = open.some((p) => p.id === project) ? project : undefined;
    const result = await window.api.notes.create({ title: UNTITLED, projectId: target });
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    invalidate();
    navigate({ name: 'notes', noteId: result.data.id });
  };

  return (
    <div className="page notes-page">
      <header className="page__header">
        <h1>Notes</h1>
        <button type="button" className="btn btn--primary" onClick={() => void create()}>
          <Plus aria-hidden /> New note
        </button>
      </header>
      <div className="notes">
        <section className="notes__list" aria-label="All notes">
          <div className="notes__filters">
            <div className="field">
              <label htmlFor="notes-search">Search notes</label>
              <input
                id="notes-search"
                className="input"
                type="search"
                value={text}
                maxLength={200}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="notes-project">Project</label>
              <select
                id="notes-project"
                className="select"
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
              <div className="field">
                <label htmlFor="notes-tag">Tag</label>
                <select
                  id="notes-tag"
                  className="select"
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                >
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
        </section>
        <section className="notes__editor" aria-label="Open note">
          {noteId ? (
            <NoteLoader key={noteId} noteId={noteId} />
          ) : (
            <p className="muted">Choose a note from the list, or create a new one.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function NoteLoader({ noteId }: { noteId: string }) {
  const note = useQuery(`note:${noteId}`, () => window.api.notes.get({ id: noteId }));
  if (note.error) return <ErrorNotice error={note.error} onRetry={note.reload} />;
  if (!note.data) return <Loading />;
  return <NoteEditor note={note.data} />;
}
