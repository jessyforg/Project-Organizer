import type { AppLinkInfo, Backlink, StatusCategory } from '@shared/domain';
import { appLinkUrl, snippetAround, type AppLinkKind, type AppLinkTarget } from '@shared/app-links';
import type { ResolveLinksInput } from '@shared/schemas';
import { placeholders, type ServiceContext } from './context';

/** At most this many linking notes are listed. */
const LINKING_LIMIT = 100;

export interface BacklinkRow {
  id: string;
  title: string;
  body: string;
  archived_at: string | null;
  updated_at: string;
}

/** A linking or mentioning note, with plain text around position `at` of its body. */
export function toBacklink(row: BacklinkRow, at: number): Backlink {
  return {
    noteId: row.id,
    title: row.title,
    snippet: snippetAround(row.body, at),
    archived: row.archived_at !== null,
    updatedAt: row.updated_at,
  };
}

interface Row {
  id: string;
  label: string;
  archived_at: string | null;
  project_id: string | null;
  due_date?: string | null;
  status_name?: string;
  status_category?: StatusCategory;
}

const QUERIES: Record<AppLinkKind, (count: number) => string> = {
  note: (n) => `
    SELECT x.id, x.title AS label, x.archived_at, x.project_id
    FROM notes x JOIN projects p ON p.id = x.project_id
    WHERE x.id IN (${placeholders(n)}) AND x.deleted_at IS NULL AND p.deleted_at IS NULL`,
  task: (n) => `
    SELECT x.id, x.title AS label, p.archived_at, x.project_id, x.due_date,
           s.name AS status_name, s.category AS status_category
    FROM tasks x
    JOIN projects p ON p.id = x.project_id
    JOIN project_statuses s ON s.id = x.status_id
    WHERE x.id IN (${placeholders(n)}) AND x.deleted_at IS NULL AND p.deleted_at IS NULL`,
  project: (n) => `
    SELECT x.id, x.name AS label, x.archived_at, NULL AS project_id
    FROM projects x WHERE x.id IN (${placeholders(n)}) AND x.deleted_at IS NULL`,
};

/**
 * Current titles of the items notes link to (ADR-0017), so a link always shows today's name and
 * a link to something deleted or trashed shows as missing.
 */
export class LinkService {
  constructor(private readonly ctx: ServiceContext) {}

  /**
   * Notes that link to `target`, most recently updated first, with the text around the link.
   * Trashed notes (and notes in trashed projects) are left out; `excludeNoteId` too.
   */
  mentionedIn(target: AppLinkTarget, excludeNoteId: string | null = null): Backlink[] {
    const rows = this.ctx.db
      .prepare(
        `SELECT n.id, n.title, n.body, n.archived_at, n.updated_at
         FROM note_links l
         JOIN notes n ON n.id = l.source_note_id
         JOIN projects p ON p.id = n.project_id
         WHERE l.target_kind = ? AND l.target_id = ?
           AND n.deleted_at IS NULL AND p.deleted_at IS NULL AND n.id IS NOT ?
         ORDER BY n.updated_at DESC, n.id LIMIT ?`,
      )
      .all(target.kind, target.id, excludeNoteId, LINKING_LIMIT) as BacklinkRow[];
    const address = `](${appLinkUrl(target)})`;
    return rows.map((row) => {
      const end = row.body.indexOf(address);
      return toBacklink(row, end < 0 ? 0 : row.body.lastIndexOf('[', end));
    });
  }

  resolve({ targets }: ResolveLinksInput): AppLinkInfo[] {
    const found = new Map<string, AppLinkInfo>();
    for (const kind of Object.keys(QUERIES) as AppLinkKind[]) {
      const ids = [...new Set(targets.filter((t) => t.kind === kind).map((t) => t.id))];
      if (ids.length === 0) continue;
      const rows = this.ctx.db.prepare(QUERIES[kind](ids.length)).all(...ids) as Row[];
      for (const row of rows) {
        found.set(`${kind}/${row.id}`, {
          kind,
          id: row.id,
          label: row.label,
          missing: false,
          archived: row.archived_at !== null,
          projectId: row.project_id,
          ...(kind === 'task'
            ? {
                dueDate: row.due_date ?? null,
                status: { name: row.status_name ?? '', category: row.status_category ?? 'todo' },
              }
            : {}),
        });
      }
    }
    return targets.map(
      (t) =>
        found.get(`${t.kind}/${t.id}`) ?? {
          kind: t.kind,
          id: t.id,
          label: '',
          missing: true,
          archived: false,
          projectId: null,
        },
    );
  }
}
