/** Lists load in pages; this says so when there may be more, instead of hiding tasks silently. */
export const PAGE_SIZE = 500;

export function LoadMore({
  shown,
  limit,
  onMore,
}: {
  shown: number;
  limit: number;
  onMore: () => void;
}) {
  if (shown < limit) return null;
  return (
    <div className="notice" role="status">
      <p>Showing the first {shown} tasks. Use filters to narrow the list, or load more.</p>
      <button type="button" className="btn" onClick={onMore}>
        Load {PAGE_SIZE} more
      </button>
    </div>
  );
}
