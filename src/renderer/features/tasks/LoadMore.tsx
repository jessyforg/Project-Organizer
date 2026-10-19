/** Lists load in pages; this says so when there may be more, instead of hiding items silently. */
export const PAGE_SIZE = 500;

export function LoadMore({
  shown,
  limit,
  onMore,
  noun = 'tasks',
}: {
  shown: number;
  limit: number;
  onMore: () => void;
  noun?: string;
}) {
  if (shown < limit) return null;
  return (
    <div className="notice" role="status">
      <p>
        Showing the first {shown} {noun}. Use filters to narrow the list, or load more.
      </p>
      <button type="button" className="btn" onClick={onMore}>
        Load {PAGE_SIZE} more
      </button>
    </div>
  );
}
