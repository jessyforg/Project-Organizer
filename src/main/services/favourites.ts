import type { ColorToken, FavouriteItem } from '@shared/domain';
import type { FavouriteTarget } from '@shared/schemas';
import { evenlySpacedKeys, keyAfter } from '../domain/sort-keys';
import { AppError } from '../errors';
import { notFound, nowIso, type ServiceContext } from './context';

interface Row {
  id: string;
  kind: 'project' | 'note';
  item_id: string;
  title: string;
  icon: string | null;
  color: string | null;
  archived: number;
}

const COLUMN = { project: 'project_id', note: 'note_id' } as const;

/**
 * Starred projects and notes, in the sidebar's order (ADR-0019). A favourite whose item, or
 * whose note's project, is in the trash keeps its row but is not listed, so restoring the item
 * brings the star back; deleting the item for good deletes the favourite with it.
 */
export class FavouriteService {
  constructor(private readonly ctx: ServiceContext) {}

  list(): FavouriteItem[] {
    const rows = this.ctx.db
      .prepare(
        `SELECT * FROM (
           SELECT f.id, 'project' AS kind, p.id AS item_id, p.name AS title, p.icon, p.color,
                  p.archived_at IS NOT NULL AS archived, f.sort_key
           FROM favourites f JOIN projects p ON p.id = f.project_id
           WHERE p.deleted_at IS NULL
           UNION ALL
           SELECT f.id, 'note', n.id, n.title, n.icon, NULL,
                  n.archived_at IS NOT NULL OR p.archived_at IS NOT NULL, f.sort_key
           FROM favourites f JOIN notes n ON n.id = f.note_id JOIN projects p ON p.id = n.project_id
           WHERE n.deleted_at IS NULL AND p.deleted_at IS NULL)
         ORDER BY sort_key, id`,
      )
      .all() as Row[];
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      itemId: row.item_id,
      title: row.title,
      icon: row.icon,
      color: row.color as ColorToken | null,
      archived: row.archived === 1,
    }));
  }

  /** Stars an item (at the end of the list) or removes its star. Repeating either does nothing. */
  set(input: FavouriteTarget & { starred: boolean }): FavouriteItem[] {
    const { db } = this.ctx;
    const column = COLUMN[input.kind];
    if (!input.starred) {
      db.prepare(`DELETE FROM favourites WHERE ${column} = ?`).run(input.id);
      return this.list();
    }
    this.requireLive(input);
    const existing = db.prepare(`SELECT 1 FROM favourites WHERE ${column} = ?`).get(input.id);
    if (!existing) {
      const last = db.prepare('SELECT max(sort_key) AS key FROM favourites').get() as {
        key: number | null;
      };
      db.prepare(
        `INSERT INTO favourites (id, ${column}, sort_key, created_at) VALUES (?, ?, ?, ?)`,
      ).run(this.ctx.newId(), input.id, keyAfter(last.key), nowIso(this.ctx));
    }
    return this.list();
  }

  /**
   * Puts the listed favourites in this order; the list must name each of them once. They swap
   * their keys among themselves, so hidden ones (items in the trash) keep their place.
   */
  reorder(ids: string[]): FavouriteItem[] {
    const { db } = this.ctx;
    const listed = this.list().map((f) => f.id);
    if (ids.length !== listed.length || new Set(ids).size !== ids.length) {
      throw new AppError('VALIDATION_FAILED', 'The new order must include every favourite once.');
    }
    const known = new Set(listed);
    if (!ids.every((id) => known.has(id))) throw notFound('Favourite');
    const update = db.prepare('UPDATE favourites SET sort_key = ? WHERE id = ?');
    db.transaction(() => {
      let rows = db.prepare('SELECT id, sort_key FROM favourites ORDER BY sort_key, id').all() as {
        id: string;
        sort_key: number;
      }[];
      // Equal keys cannot be swapped into a definite order; number everything afresh first.
      if (new Set(rows.map((r) => r.sort_key)).size !== rows.length) {
        const fresh = evenlySpacedKeys(rows.length);
        rows = rows.map((row, i) => ({ id: row.id, sort_key: fresh[i]! }));
        for (const row of rows) update.run(row.sort_key, row.id);
      }
      const keys = rows.filter((row) => known.has(row.id)).map((row) => row.sort_key);
      ids.forEach((id, i) => update.run(keys[i], id));
    })();
    return this.list();
  }

  private requireLive({ kind, id }: FavouriteTarget): void {
    const sql =
      kind === 'project'
        ? 'SELECT 1 FROM projects WHERE id = ? AND deleted_at IS NULL'
        : `SELECT 1 FROM notes n JOIN projects p ON p.id = n.project_id
           WHERE n.id = ? AND n.deleted_at IS NULL AND p.deleted_at IS NULL`;
    if (!this.ctx.db.prepare(sql).get(id)) throw notFound(kind === 'project' ? 'Project' : 'Note');
  }
}
