import { importProblem, noteFromMarkdownFile } from '@shared/markdown-file';
import { LIMITS } from '@shared/schemas';

export interface ReadResult {
  notes: { title: string; body: string }[];
  skipped: { fileName: string; reason: string }[];
}

/** Reads picked, dropped, or pasted files as notes, explaining any it skips (ADR-0014). */
export async function readMarkdownFiles(files: File[]): Promise<ReadResult> {
  const result: ReadResult = { notes: [], skipped: [] };
  for (const file of files) {
    const problem =
      result.notes.length >= LIMITS.importFiles
        ? `Only ${LIMITS.importFiles} files can be imported at a time.`
        : importProblem(file.name, file.size);
    if (problem) {
      result.skipped.push({ fileName: file.name, reason: problem });
      continue;
    }
    try {
      result.notes.push(noteFromMarkdownFile(file.name, await file.text()));
    } catch {
      result.skipped.push({ fileName: file.name, reason: 'The file could not be read.' });
    }
  }
  return result;
}

/** One sentence for the toast after an import. */
export function importSummary(imported: number, skipped: ReadResult['skipped']): string {
  const made = imported === 1 ? 'Imported 1 note.' : `Imported ${imported} notes.`;
  if (skipped.length === 0) return made;
  const details = skipped.map((s) => `${s.fileName}: ${s.reason}`).join(' ');
  return `${imported > 0 ? made : 'Nothing was imported.'} Skipped ${skipped.length}: ${details}`;
}
