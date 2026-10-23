import { useId, useState } from 'react';
import { Link2 } from 'lucide-react';
import type { Backlink } from '@shared/domain';
import { useInvalidate, useQuery } from '../../app/data';
import { useNavigation } from '../../app/navigation';
import { useToast } from '../../app/toasts';

/**
 * Backlinks below a note (ADR-0017): the notes that link to it, and notes that mention its title
 * without a link, each with a little of the text around it. "Link" turns a mention into a link.
 */
export function NoteBacklinks({ noteId, title }: { noteId: string; title: string }) {
  const id = useId();
  const data = useQuery(`backlinks:${noteId}`, () => window.api.notes.backlinks({ id: noteId }));
  const { navigate } = useNavigation();
  const invalidate = useInvalidate();
  const toast = useToast();
  const [linking, setLinking] = useState<string | null>(null);
  const linked = data.data?.linked ?? [];
  const unlinked = data.data?.unlinked ?? [];

  const link = async (mention: Backlink) => {
    setLinking(mention.noteId);
    const result = await window.api.notes.linkMention({
      sourceId: mention.noteId,
      targetId: noteId,
    });
    setLinking(null);
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    invalidate();
    toast({ message: `Linked the mention in “${mention.title}”.` });
  };

  const entry = (backlink: Backlink) => (
    <button
      type="button"
      className="note-backlinks__open"
      onClick={() => navigate({ name: 'notes', noteId: backlink.noteId })}
    >
      <span className="note-backlinks__title">
        {backlink.title}
        {backlink.archived && <span className="label">Archived</span>}
      </span>
      <span className="note-backlinks__snippet">{backlink.snippet}</span>
    </button>
  );

  return (
    <section className="note-backlinks" aria-labelledby={`${id}-linked`}>
      <h2 id={`${id}-linked`} className="note-backlinks__heading">
        Linked from <span className="count">{linked.length}</span>
      </h2>
      {linked.length === 0 ? (
        <p className="muted small">
          No notes link here yet. Type <kbd>[[</kbd> in another note to link to “{title}”.
        </p>
      ) : (
        <ul className="note-backlinks__list">
          {linked.map((backlink) => (
            <li key={backlink.noteId}>{entry(backlink)}</li>
          ))}
        </ul>
      )}
      {unlinked.length > 0 && (
        <>
          <h3 className="note-backlinks__heading">
            Unlinked mentions <span className="count">{unlinked.length}</span>
          </h3>
          <ul className="note-backlinks__list">
            {unlinked.map((mention) => (
              <li key={mention.noteId} className="note-backlinks__mention">
                {entry(mention)}
                <button
                  type="button"
                  className="btn btn--small"
                  aria-label={`Link the mention in “${mention.title}”`}
                  disabled={linking === mention.noteId}
                  onClick={() => void link(mention)}
                >
                  <Link2 aria-hidden /> Link
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
