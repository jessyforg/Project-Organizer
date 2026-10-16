const MAX_TERMS = 10;

/**
 * Turns free text into a safe FTS5 query: every word becomes a quoted prefix term,
 * so characters such as quotes, `*`, `-`, `:`, `OR`, or `NEAR` are never interpreted
 * as query syntax. Returns null when there is nothing to search for.
 */
export function toFtsQuery(input: string): string | null {
  const terms = input
    .normalize('NFC')
    .split(/\s+/)
    .map((term) => term.replace(/"/g, ''))
    .filter((term) => term.length > 0)
    .slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term}"*`).join(' ');
}
