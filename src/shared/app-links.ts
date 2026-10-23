/**
 * Links between notes, tasks, and projects (ADR-0017, stages 4–5). In a note's Markdown they are
 * ordinary links with an app address, `[Title](projectforge://note/<id>)`, so they survive
 * renames (the id is fixed) and exported notes stay readable. These rules are shared by the main
 * process (the link index) and the renderer (the editor and the preview), so both agree on what
 * counts as a link.
 */

export const APP_LINK_KINDS = ['note', 'task', 'project'] as const;
export type AppLinkKind = (typeof APP_LINK_KINDS)[number];

export interface AppLinkTarget {
  kind: AppLinkKind;
  id: string;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const URL_PATTERN = `projectforge://(note|task|project)/(${UUID})`;
const URL = new RegExp(`^${URL_PATTERN}$`);
/** A whole Markdown link to an app address; the label may contain escaped brackets. */
export const APP_LINK_MARKDOWN = new RegExp(`\\[((?:\\\\.|[^\\]\\\\\\n])*)\\]\\(${URL_PATTERN}\\)`);

export function appLinkUrl({ kind, id }: AppLinkTarget): string {
  return `projectforge://${kind}/${id}`;
}

export function parseAppLinkUrl(href: string | null | undefined): AppLinkTarget | null {
  const match = URL.exec(href ?? '');
  return match ? { kind: match[1] as AppLinkKind, id: match[2]! } : null;
}

/** A link label as Markdown: brackets and backslashes escaped. */
export function escapeLinkLabel(label: string): string {
  return label.replace(/[\\[\]]/g, '\\$&');
}

export function unescapeLinkLabel(label: string): string {
  return label.replace(/\\([\\[\]])/g, '$1');
}

/** `[label](projectforge://kind/id)` */
export function appLinkMarkdown(target: AppLinkTarget, label: string): string {
  return `[${escapeLinkLabel(label)}](${appLinkUrl(target)})`;
}

/** Replaces each character of the matches with a space, keeping positions. */
function blank(text: string, pattern: RegExp): string {
  return text.replace(pattern, (match) => match.replace(/[^\n]/g, ' '));
}

const FENCED_CODE = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1[ \t]*$|(?![\s\S]))/gm;
const INLINE_CODE = /(`+)[^`\n][\s\S]*?\1/g;

/** The Markdown with code blanked out: links and words inside code do not count. */
export function withoutCode(markdown: string): string {
  return blank(blank(markdown, FENCED_CODE), INLINE_CODE);
}

/** The distinct app links in a note's Markdown, in order, ignoring any inside code. */
export function extractAppLinks(markdown: string): AppLinkTarget[] {
  const seen = new Set<string>();
  const links: AppLinkTarget[] = [];
  for (const match of withoutCode(markdown).matchAll(new RegExp(APP_LINK_MARKDOWN, 'g'))) {
    const key = `${match[2]}/${match[3]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ kind: match[2] as AppLinkKind, id: match[3]! });
  }
  return links;
}

/** The Markdown with code, links, images, and web addresses blanked out (plain prose only). */
function proseOnly(markdown: string): string {
  return blank(
    blank(blank(withoutCode(markdown), /!?\[(?:\\.|[^\]\\\n])*\]\([^)\n]*\)/g), /<[^>\n]*>/g),
    /\b(?:https?|mailto):[^\s)]+/g,
  );
}

const WORD = /[\p{L}\p{N}_]/u;

/**
 * Where `title` appears as plain prose (not in code, links, or addresses) as a whole word,
 * ignoring case: [start, end) of the first occurrence, or null.
 */
export function findPlainMention(markdown: string, title: string): [number, number] | null {
  const needle = title.trim().toLowerCase();
  if (needle.length === 0) return null;
  const haystack = proseOnly(markdown).toLowerCase();
  let from = 0;
  for (;;) {
    const start = haystack.indexOf(needle, from);
    if (start < 0) return null;
    const end = start + needle.length;
    const before = haystack[start - 1];
    const after = haystack[end];
    if ((!before || !WORD.test(before)) && (!after || !WORD.test(after))) return [start, end];
    from = start + 1;
  }
}

/** Plain text around `at` for a short preview: links show their labels, Markdown is dropped. */
export function snippetAround(markdown: string, at: number, radius = 70): string {
  // Links become their labels first, across the whole text, so the window never cuts one in
  // half; `at` moves with the text before it.
  let plain = '';
  let last = 0;
  let mapped = at;
  for (const match of markdown.matchAll(/!?\[((?:\\.|[^\]\\\n])*)\]\([^)\n]*\)/g)) {
    const index = match.index;
    const label = unescapeLinkLabel(match[1] ?? '');
    plain += markdown.slice(last, index);
    if (at >= index + match[0].length) mapped -= match[0].length - label.length;
    else if (at >= index) mapped = plain.length;
    plain += label;
    last = index + match[0].length;
  }
  plain += markdown.slice(last);
  const start = Math.max(0, mapped - radius);
  const end = Math.min(plain.length, mapped + radius);
  const text = plain
    .slice(start, end)
    .replace(/[#>*_`~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${start > 0 ? '…' : ''}${text}${end < plain.length ? '…' : ''}`;
}

// ---------- Attachments (stage 6) ----------

const FILE_URL = new RegExp(`^projectforge://file/(${UUID})$`);
const FILE_REFERENCE = new RegExp(`\\]\\(projectforge://file/(${UUID})\\)`, 'g');

/** `projectforge://file/<id>`: an image or file stored with the profile. */
export function fileUrl(id: string): string {
  return `projectforge://file/${id}`;
}

export function parseFileUrl(href: string | null | undefined): string | null {
  return FILE_URL.exec(href ?? '')?.[1] ?? null;
}

/**
 * The files a note's Markdown refers to (images and file links), including any inside code:
 * keeping a file a note shows as code costs little, and losing one it needs would be worse.
 */
export function extractFileIds(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(FILE_REFERENCE)].map((m) => m[1]!))];
}
