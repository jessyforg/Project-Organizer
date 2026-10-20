import type { NoteFolder } from '@shared/domain';
import type { CreateFolderInput, RenameFolderInput } from '@shared/schemas';
import { nameKey } from '../domain/text';
import { notFound, nowIso, withUniqueName, type ServiceContext } from './context';
import { NOTE_FOLDER_SELECT, toNoteFolder, type NoteFolderRow } from './rows';

const DUPLICATE = 'A note folder with this name already exists.';

/** Folders on the Notes screen (ADR-0014). They are flat, sorted by name, and never trashed. */
export class NoteFolderService {
  constructor(private readonly ctx: ServiceContext) {}

  list(): NoteFolder[] {
    const rows = this.ctx.db
      .prepare(`${NOTE_FOLDER_SELECT} ORDER BY f.name_key, f.id`)
      .all() as NoteFolderRow[];
    return rows.map(toNoteFolder);
  }

  get(id: string): NoteFolder {
    const row = this.ctx.db.prepare(`${NOTE_FOLDER_SELECT} WHERE f.id = ?`).get(id) as
      NoteFolderRow | undefined;
    if (!row) throw notFound('Note folder');
    return toNoteFolder(row);
  }

  create(input: CreateFolderInput): NoteFolder {
    const id = this.ctx.newId();
    const now = nowIso(this.ctx);
    withUniqueName(DUPLICATE, () =>
      this.ctx.db
        .prepare(
          `INSERT INTO note_folders (id, name, name_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(id, input.name, nameKey(input.name), now, now),
    );
    return this.get(id);
  }

  rename(input: RenameFolderInput): NoteFolder {
    const result = withUniqueName(DUPLICATE, () =>
      this.ctx.db
        .prepare('UPDATE note_folders SET name = ?, name_key = ?, updated_at = ? WHERE id = ?')
        .run(input.name, nameKey(input.name), nowIso(this.ctx), input.id),
    );
    if (result.changes === 0) throw notFound('Note folder');
    return this.get(input.id);
  }

  /** Its notes, including any in the trash, move out of the folder; no note is deleted. */
  delete(id: string): void {
    const result = this.ctx.db.prepare('DELETE FROM note_folders WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Note folder');
  }
}
