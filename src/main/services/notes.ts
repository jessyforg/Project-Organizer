import type { Note, NoteSummary } from '@shared/domain';
import type {
  CreateNoteInput,
  MoveNoteInput,
  NoteListQuery,
  UpdateNoteInput,
} from '@shared/schemas';
import { toFtsQuery } from '../domain/fts';
import { AppError } from '../errors';
import { notFound, nowIso, placeholders, type ServiceContext } from './context';
import { ensureInbox, requireLiveProject } from './projects';
import { NOTE_SELECT, NOTE_SUMMARY_SELECT, toNote, toNoteSummary, type NoteRow } from './rows';

const DEFAULT_PAGE_SIZE = 500;

/** Markdown notes (R26 / L1.5). Each note belongs to a project; the Inbox holds loose notes. */
export class NoteService {
  constructor(private readonly ctx: ServiceContext) {}

  get(id: string): Note {
    const row = this.ctx.db
      .prepare(`${NOTE_SELECT} WHERE n.id = ? AND n.deleted_at IS NULL`)
      .get(id) as NoteRow | undefined;
    if (!row) throw notFound('Note');
    return toNote(row);
  }

  /** Most recently updated first. Text search covers titles and bodies. */
  list(query: NoteListQuery = {}): NoteSummary[] {
    const where = ['n.deleted_at IS NULL', 'p.deleted_at IS NULL'];
    const params: unknown[] = [];
    const add = (clause: string, ...values: unknown[]) => {
      where.push(clause);
      params.push(...values);
    };
    if (!query.includeArchived) add('p.archived_at IS NULL');
    if (query.projectId) add('n.project_id = ?', query.projectId);
    if (query.tagIds?.length) {
      add(
        `EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id
                 AND nt.tag_id IN (${placeholders(query.tagIds.length)}))`,
        ...query.tagIds,
      );
    }
    const fts = query.text === undefined ? null : toFtsQuery(query.text);
    if (fts !== null) add('n.id IN (SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?)', fts);

    const rows = this.ctx.db
      .prepare(
        `${NOTE_SUMMARY_SELECT} WHERE ${where.join(' AND ')}
         ORDER BY n.updated_at DESC, n.id LIMIT ?`,
      )
      .all(...params, query.limit ?? DEFAULT_PAGE_SIZE) as NoteRow[];
    return rows.map(toNoteSummary);
  }

  create(input: CreateNoteInput): Note {
    const { db } = this.ctx;
    const id = this.ctx.newId();
    db.transaction(() => {
      const projectId = input.projectId ?? ensureInbox(this.ctx);
      this.requireOpenProject(projectId, 'Unarchive the project before adding notes to it.');
      const now = nowIso(this.ctx);
      db.prepare(
        `INSERT INTO notes (id, project_id, title, body, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, projectId, input.title, input.body ?? '', now, now);
      const insert = db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)');
      for (const tagId of new Set(input.tagIds ?? [])) {
        if (!db.prepare('SELECT 1 FROM tags WHERE id = ?').get(tagId)) throw notFound('Tag');
        insert.run(id, tagId);
      }
    })();
    return this.get(id);
  }

  /** Saves the title and/or body. An unchanged note keeps its `updated_at`. */
  update(input: UpdateNoteInput): Note {
    const current = this.get(input.id);
    const title = input.title ?? current.title;
    const body = input.body ?? current.body;
    if (title === current.title && body === current.body) return current;
    this.ctx.db
      .prepare('UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?')
      .run(title, body, nowIso(this.ctx), input.id);
    return this.get(input.id);
  }

  move(input: MoveNoteInput): Note {
    const current = this.get(input.id);
    if (current.projectId === input.projectId) return current;
    this.requireOpenProject(input.projectId, 'Notes cannot be moved into an archived project.');
    this.ctx.db
      .prepare('UPDATE notes SET project_id = ?, updated_at = ? WHERE id = ?')
      .run(input.projectId, nowIso(this.ctx), input.id);
    return this.get(input.id);
  }

  private requireOpenProject(projectId: string, archivedMessage: string): void {
    const project = requireLiveProject(this.ctx.db, projectId);
    if (project.archived_at !== null) throw new AppError('CONFLICT', archivedMessage);
  }
}
