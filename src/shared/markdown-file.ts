import { LIMITS } from './schemas';

/**
 * Notes as standalone Markdown files (ADR-0014). Export writes the title as a level-1 heading
 * followed by the body; import reads such a heading back as the title, so the two round-trip.
 */

const FALLBACK_TITLE = 'Imported note';
const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;
const TITLE_HEADING = /^#[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

export function noteToMarkdownFile(title: string, body: string): string {
  if (body.trim() === '') return `# ${title}\n`;
  return `# ${title}\n\n${body.endsWith('\n') ? body : `${body}\n`}`;
}

/** Why a file cannot be imported, or null when it can. */
export function importProblem(fileName: string, sizeInBytes: number): string | null {
  if (!MARKDOWN_EXTENSION.test(fileName)) return 'Only .md and .markdown files can be imported.';
  if (sizeInBytes > LIMITS.description) return 'It is larger than 1 MB.';
  return null;
}

/** Reads a note from a file's text: a leading `# Heading` becomes the title. */
export function noteFromMarkdownFile(
  fileName: string,
  text: string,
): { title: string; body: string } {
  const lines = withoutBom(text).replace(/\r\n?/g, '\n').split('\n');
  const first = lines.findIndex((line) => line.trim() !== '');
  const heading = first === -1 ? null : TITLE_HEADING.exec(lines[first]!);
  if (heading) {
    const rest = lines.slice(first + 1);
    while (rest.length > 0 && rest[0]!.trim() === '') rest.shift();
    return { title: limitTitle(heading[1]!.trim()), body: rest.join('\n') };
  }
  const fromName = fileName.replace(MARKDOWN_EXTENSION, '').trim();
  return { title: limitTitle(fromName || FALLBACK_TITLE), body: lines.join('\n') };
}

/** A default file name for an exported note that is safe on Windows. */
export function markdownFileName(title: string): string {
  const forbidden = '<>:"/\\|?*';
  let safe = [...title]
    .map((ch) => (ch.charCodeAt(0) < 32 || forbidden.includes(ch) ? '-' : ch))
    .join('')
    .slice(0, 120)
    .trim()
    .replace(/[. ]+$/, '');
  if (safe === '') safe = 'Note';
  // Windows reserves these device names, with or without an extension.
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(safe)) safe = `${safe} note`;
  return `${safe}.md`;
}

function limitTitle(title: string): string {
  return title.slice(0, LIMITS.title);
}

/** Text editors on Windows often start UTF-8 files with a byte order mark. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
function withoutBom(text: string): string {
  return text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
}
