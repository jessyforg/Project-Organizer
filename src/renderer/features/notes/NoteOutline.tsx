import type { OutlineEntry } from './outline';

/**
 * The outline panel beside a note (ADR-0017): its headings 1–3, indented by level. Choosing one
 * jumps there; the heading containing the cursor is marked as the current location.
 */
export function NoteOutline({
  id,
  entries,
  current,
  onGo,
}: {
  id: string;
  entries: OutlineEntry[];
  current: number;
  onGo: (index: number) => void;
}) {
  return (
    <nav id={id} className="note-outline" aria-label="Outline">
      <h2 className="note-outline__title">Outline</h2>
      {entries.length === 0 ? (
        <p className="muted small">Add a heading to build an outline.</p>
      ) : (
        <ol className="note-outline__list">
          {entries.map((entry, index) => (
            <li key={`${index}-${entry.at}`}>
              <button
                type="button"
                className="note-outline__item"
                data-level={entry.level}
                aria-current={index === current ? 'location' : undefined}
                onClick={() => onGo(index)}
              >
                {entry.text}
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}
