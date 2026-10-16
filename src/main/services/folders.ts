import type { Folder } from '@shared/domain';
import type { CreateFolderInput, RenameFolderInput } from '@shared/schemas';
import { evenlySpacedKeys, keyAfter } from '../domain/sort-keys';
import { nameKey } from '../domain/text';
import { AppError } from '../errors';
import { notFound, nowIso, withUniqueName, type ServiceContext } from './context';
import { FOLDER_SELECT, toFolder, type FolderRow } from './rows';

const DUPLICATE = 'A folder with this name already exists.';

export class FolderService {
  constructor(private readonly ctx: ServiceContext) {}

  list(): Folder[] {
    const rows = this.ctx.db
      .prepare(`${FOLDER_SELECT} ORDER BY sort_key, name_key`)
      .all() as FolderRow[];
    return rows.map(toFolder);
  }

  get(id: string): Folder {
    const row = this.ctx.db.prepare(`${FOLDER_SELECT} WHERE id = ?`).get(id) as
      FolderRow | undefined;
    if (!row) throw notFound('Folder');
    return toFolder(row);
  }

  create(input: CreateFolderInput): Folder {
    const { db } = this.ctx;
    const id = this.ctx.newId();
    const now = nowIso(this.ctx);
    const last = db.prepare('SELECT max(sort_key) AS k FROM folders').get() as { k: number | null };
    withUniqueName(DUPLICATE, () =>
      db
        .prepare(
          `INSERT INTO folders (id, name, name_key, sort_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(id, input.name, nameKey(input.name), keyAfter(last.k), now, now),
    );
    return this.get(id);
  }

  rename(input: RenameFolderInput): Folder {
    const result = withUniqueName(DUPLICATE, () =>
      this.ctx.db
        .prepare('UPDATE folders SET name = ?, name_key = ?, updated_at = ? WHERE id = ?')
        .run(input.name, nameKey(input.name), nowIso(this.ctx), input.id),
    );
    if (result.changes === 0) throw notFound('Folder');
    return this.get(input.id);
  }

  /** `ids` must list every folder exactly once, in the new order. */
  reorder(ids: string[]): Folder[] {
    const { db } = this.ctx;
    const existing = (db.prepare('SELECT id FROM folders').all() as { id: string }[]).map(
      (r) => r.id,
    );
    if (ids.length !== existing.length || new Set(ids).size !== ids.length) {
      throw new AppError('VALIDATION_FAILED', 'The new order must include every folder once.');
    }
    const known = new Set(existing);
    if (!ids.every((id) => known.has(id))) throw notFound('Folder');
    const keys = evenlySpacedKeys(ids.length);
    const update = db.prepare('UPDATE folders SET sort_key = ?, updated_at = ? WHERE id = ?');
    const now = nowIso(this.ctx);
    db.transaction(() => ids.forEach((id, i) => update.run(keys[i], now, id)))();
    return this.list();
  }

  /** Projects in the folder move to "no folder"; no project is deleted. */
  delete(id: string): void {
    const result = this.ctx.db.prepare('DELETE FROM folders WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Folder');
  }
}
