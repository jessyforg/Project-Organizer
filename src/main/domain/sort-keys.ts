/** Gap between consecutive sort keys, leaving room to insert items without renumbering. */
export const SORT_KEY_GAP = 1024;

export function keyAfter(last: number | null): number {
  return (last ?? 0) + SORT_KEY_GAP;
}

/**
 * An integer strictly between two neighbours, or null when there is no room
 * (the caller then renumbers the siblings). `before` null means "start of list".
 */
export function keyBetween(before: number | null, after: number): number | null {
  const low = before ?? 0;
  if (after - low < 2) return null;
  return Math.floor((low + after) / 2);
}

/** Fresh evenly spaced keys for `count` items. */
export function evenlySpacedKeys(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * SORT_KEY_GAP);
}
