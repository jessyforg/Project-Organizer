import { z } from 'zod';
import { APP_LINK_KINDS, type AppLinkKind, type AppLinkTarget } from '@shared/app-links';
import type { SwitcherItem } from '@shared/domain';
import type { SwitcherQuery } from '@shared/schemas';
import { toFtsQuery } from '../domain/fts';
import { nowIso, placeholders, type ServiceContext } from './context';

/** Results shown at most, across all kinds. */
const RESULT_LIMIT = 30;
/** Recently opened items kept per profile (ADR-0018). */
export const RECENT_LIMIT = 10;
/** Stored in the profile's `settings` table; the settings service ignores keys it does not know. */
const RECENT_KEY = 'recentItems';

const recentSchema = z.array(z.strictObject({ kind: z.enum(APP_LINK_KINDS), id: z.string() }));

interface Row {
  kind: AppLinkKind;
  id: string;
  title: string;
  project_name: string | null;
  folder_name: string | null;
  archived: number;
  completed: number;
  updated_at: string;
  icon: string | null;
  rank: number;
}

/** SQL fragments filled in by the caller: how to rank by a title column, and what to match. */
type Fragment = (column: string, ftsClause: string) => string;

/**
 * One query per kind, with the same columns. Each leaves out trashed items and items whose
 * project is trashed, and archived ones unless `@archived` is 1.
 */
const SELECT: Record<AppLinkKind, (rank: Fragment, match: Fragment) => string> = {
  project: (rank, match) => `
    SELECT 'project' AS kind, p.id, p.name AS title, NULL AS project_name, f.name AS folder_name,
           p.archived_at IS NOT NULL AS archived, 0 AS completed, p.updated_at, p.icon,
           ${rank('p.name', '')} AS rank
    FROM projects p LEFT JOIN folders f ON f.id = p.folder_id
    WHERE p.deleted_at IS NULL
      AND ${match('p.name', 'p.id IN (SELECT project_id FROM projects_fts WHERE projects_fts MATCH @fts)')}
      AND (@archived OR p.archived_at IS NULL)`,
  note: (rank, match) => `
    SELECT 'note' AS kind, n.id, n.title, p.name AS project_name, nf.name AS folder_name,
           (n.archived_at IS NOT NULL OR p.archived_at IS NOT NULL) AS archived, 0 AS completed,
           n.updated_at, n.icon, ${rank('n.title', '')} AS rank
    FROM notes n JOIN projects p ON p.id = n.project_id
    LEFT JOIN note_folders nf ON nf.id = n.folder_id
    WHERE n.deleted_at IS NULL AND p.deleted_at IS NULL
      AND ${match('n.title', 'n.id IN (SELECT note_id FROM notes_fts WHERE notes_fts MATCH @fts)')}
      AND (@archived OR (n.archived_at IS NULL AND p.archived_at IS NULL))`,
  task: (rank, match) => `
    SELECT 'task' AS kind, t.id, t.title, p.name AS project_name, NULL AS folder_name,
           p.archived_at IS NOT NULL AS archived, s.category = 'done' AS completed,
           t.updated_at, NULL AS icon, ${rank('t.title', '')} AS rank
    FROM tasks t JOIN projects p ON p.id = t.project_id
    JOIN project_statuses s ON s.id = t.status_id
    WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL
      AND ${match('t.title', 't.id IN (SELECT task_id FROM tasks_fts WHERE tasks_fts MATCH @fts)')}
      AND (@archived OR p.archived_at IS NULL)`,
};

const ID_COLUMN: Record<AppLinkKind, string> = { project: 'p.id', note: 'n.id', task: 't.id' };

/** `%` and `_` are wildcards in LIKE; escape them (and the escape character) as plain text. */
function likeEscape(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function toItem(row: Row): SwitcherItem {
  return {
    kind: row.kind,
    id: row.id,
    title: row.title,
    projectName: row.project_name,
    folderName: row.folder_name,
    archived: row.archived === 1,
    completed: row.completed === 1,
    icon: row.icon,
  };
}

/** The quick switcher (ADR-0018): jump to a project, note, or task by name, or to a recent one. */
export class SwitcherService {
  constructor(private readonly ctx: ServiceContext) {}

  /**
   * Full-text matches on titles and bodies, plus titles containing the whole text. Titles that
   * start with the text come first, then titles that contain it, then the rest; ties go to the
   * most recently updated.
   */
  search(query: SwitcherQuery): SwitcherItem[] {
    const text = query.text.normalize('NFC').trim();
    if (!text) return [];
    const fts = toFtsQuery(text);
    const like = likeEscape(text);
    const rank: Fragment = (column) =>
      `CASE WHEN ${column} LIKE @prefix ESCAPE '\\' THEN 0
            WHEN ${column} LIKE @contains ESCAPE '\\' THEN 1 ELSE 2 END`;
    const match: Fragment = (column, ftsClause) =>
      fts === null
        ? `${column} LIKE @contains ESCAPE '\\'`
        : `(${column} LIKE @contains ESCAPE '\\' OR ${ftsClause})`;
    const params = {
      prefix: `${like}%`,
      contains: `%${like}%`,
      archived: query.includeArchived ? 1 : 0,
      ...(fts === null ? {} : { fts }),
    };
    const rows = APP_LINK_KINDS.flatMap(
      (kind) =>
        this.ctx.db
          .prepare(
            `SELECT * FROM (${SELECT[kind](rank, match)})
             ORDER BY rank, updated_at DESC, id LIMIT ${RESULT_LIMIT}`,
          )
          .all(params) as Row[],
    );
    return rows
      .sort((a, b) => a.rank - b.rank || b.updated_at.localeCompare(a.updated_at))
      .slice(0, RESULT_LIMIT)
      .map(toItem);
  }

  /** The most recently opened items, newest first, without trashed or deleted ones. */
  recent(query: { includeArchived?: boolean | undefined }): SwitcherItem[] {
    const stored = this.readRecent();
    const found = new Map<string, SwitcherItem>();
    const archived = query.includeArchived ? 1 : 0;
    for (const kind of APP_LINK_KINDS) {
      const ids = stored.filter((r) => r.kind === kind).map((r) => r.id);
      if (ids.length === 0) continue;
      const sql = SELECT[kind](
        () => '0',
        () => `${ID_COLUMN[kind]} IN (${placeholders(ids.length)})`,
      );
      const rows = this.ctx.db.prepare(sql).all(...ids, { archived }) as Row[];
      for (const row of rows) found.set(`${kind}:${row.id}`, toItem(row));
    }
    return stored.flatMap((r) => found.get(`${r.kind}:${r.id}`) ?? []);
  }

  /** Moves an item to the front of the recent list, keeping the newest {@link RECENT_LIMIT}. */
  recordOpened(target: AppLinkTarget): void {
    const next = [
      { kind: target.kind, id: target.id },
      ...this.readRecent().filter((r) => !(r.kind === target.kind && r.id === target.id)),
    ].slice(0, RECENT_LIMIT);
    this.ctx.db
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(RECENT_KEY, JSON.stringify(next), nowIso(this.ctx));
  }

  /** A damaged stored list counts as empty; the next recording replaces it. */
  private readRecent(): AppLinkTarget[] {
    const row = this.ctx.db
      .prepare('SELECT value_json FROM settings WHERE key = ?')
      .get(RECENT_KEY) as { value_json: string } | undefined;
    if (!row) return [];
    try {
      const parsed = recentSchema.safeParse(JSON.parse(row.value_json));
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }
}
