/**
 * The Katha mark (ADR-0026): the banig weave in one colour (currentColor), drawn on the 16 px
 * grid of brand/katha-tile-16.svg so it stays sharp at its usual 16 px size. Decorative: the
 * product name always appears next to it.
 */
const VERTICAL: [number, number][] = [
  [3, 2],
  [3, 10],
  [7, 6],
  [11, 2],
  [11, 10],
];
const HORIZONTAL: [number, number][] = [
  [2, 7],
  [6, 3],
  [6, 11],
  [10, 7],
];

export function BrandMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
      {VERTICAL.map(([x, y]) => (
        <rect key={`v${x},${y}`} x={x} y={y} width="2" height="4" rx="0.5" />
      ))}
      {HORIZONTAL.map(([x, y]) => (
        <rect key={`h${x},${y}`} x={x} y={y} width="4" height="2" rx="0.5" />
      ))}
    </svg>
  );
}
