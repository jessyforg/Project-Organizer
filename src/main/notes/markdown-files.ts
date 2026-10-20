import fs from 'node:fs';
import { noteToMarkdownFile } from '@shared/markdown-file';

/** Writes a note as a Markdown file: next to its destination first, then renamed into place. */
export function writeNoteMarkdown(
  note: { title: string; body: string },
  destination: string,
): void {
  const partial = `${destination}.partial`;
  try {
    fs.writeFileSync(partial, noteToMarkdownFile(note.title, note.body), {
      encoding: 'utf8',
      flush: true,
    });
    fs.renameSync(partial, destination);
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw error;
  }
}
