import { appLinkMarkdown, extractAppLinks, findPlainMention } from '@shared/app-links';
import type { Backlink, Note, NoteBacklinks, NoteSummary } from '@shared/domain';
import {
  LIMITS,
  type CreateNoteInput,
  type ImportNotesInput,
  type LinkMentionInput,
  type MoveNoteInput,
  type NoteListQuery,
  type NoteSort,
  type SetNoteFolderInput,
  type UpdateNoteInput,
} from '@shared/schemas';
import { toFtsQuery } from '../domain/fts';
import { AppError } from '../errors';
import { notFound, nowIso, placeholders, type ServiceContext } from './context';
import { LinkService, toBacklink, type BacklinkRow } from './links';
import { ensureInbox, requireLiveProject } from './projects';
import { NOTE_SELECT, NOTE_SUMMARY_SELECT, toNote, toNoteSummary, type NoteRow } from './rows';

const DEFAULT_PAGE_SIZE = 500;
const ORDER: Record<NoteSort, string> = {
  updated: 'n.updated_at DESC, n.id',
  created: 'n.created_at DESC, n.id',
  title: 'n.title COLLATE NOCASE, n.id',
};
const COPY_SUFFIX = ' (copy)';
/** Titles this short (or the default one) would match too many words to suggest as mentions. */
const MIN_MENTION_TITLE = 3;
const DEFAULT_TITLE = 'Untitled note';
const BACKLINK_LIMIT = 100;

interface NewNote {
  projectId: string | undefined;
  folderId: string | null | undefined;
  title: string;
  body: string;
  tagIds: string[];
}

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

  /** Most recently updated first unless sorted otherwise. Text search covers titles and bodies. */
  list(query: NoteListQuery = {}): NoteSummary[] {
    const where = ['n.deleted_at IS NULL', 'p.deleted_at IS NULL'];
    const params: unknown[] = [];
    const add = (clause: string, ...values: unknown[]) => {
      where.push(clause);
      params.push(...values);
    };
    if (!query.includeArchived) add('p.archived_at IS NULL');
    const archived = query.archived ?? 'exclude';
    if (archived === 'exclude') add('n.archived_at IS NULL');
    else if (archived === 'only') add('n.archived_at IS NOT NULL');
    if (query.projectId) add('n.project_id = ?', query.projectId);
    if (query.folderId === null) add('n.folder_id IS NULL');
    else if (query.folderId) add('n.folder_id = ?', query.folderId);
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
         ORDER BY ${ORDER[query.sort ?? 'updated']} LIMIT ?`,
      )
      .all(...params, query.limit ?? DEFAULT_PAGE_SIZE) as NoteRow[];
    return rows.map(toNoteSummary);
  }

  create(input: CreateNoteInput): Note {
    const id = this.ctx.db.transaction(() =>
      this.insert({
        projectId: input.projectId,
        folderId: input.folderId,
        title: input.title,
        body: input.body ?? '',
        tagIds: input.tagIds ?? [],
      }),
    )();
    return this.get(id);
  }

  /** A copy with the same body, project, folder, and tags, titled "… (copy)" (ADR-0014). */
  duplicate(id: string): Note {
    const source = this.get(id);
    const title = source.title.slice(0, LIMITS.title - COPY_SUFFIX.length) + COPY_SUFFIX;
    const copyId = this.ctx.db.transaction(() =>
      this.insert({ ...source, title }, 'Unarchive the project before duplicating its notes.'),
    )();
    return this.get(copyId);
  }

  /** Creates notes read from Markdown files, all or none (ADR-0014). */
  import(input: ImportNotesInput): Note[] {
    const ids = this.ctx.db.transaction(() => {
      const projectId = input.projectId ?? ensureInbox(this.ctx);
      return input.notes.map((note) =>
        this.insert({ ...note, projectId, folderId: input.folderId, tagIds: [] }),
      );
    })();
    return ids.map((id) => this.get(id));
  }

  /** Hides the note from lists and makes it read-only (ADR-0015). */
  archive(id: string): Note {
    const current = this.get(id);
    if (current.archivedAt !== null) return current;
    const now = nowIso(this.ctx);
    this.ctx.db
      .prepare('UPDATE notes SET archived_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
    return this.get(id);
  }

  unarchive(id: string): Note {
    const current = this.get(id);
    if (current.archivedAt === null) return current;
    this.ctx.db
      .prepare('UPDATE notes SET archived_at = NULL, updated_at = ? WHERE id = ?')
      .run(nowIso(this.ctx), id);
    return this.get(id);
  }

  /** Puts the note in a folder, or with null, in no folder. */
  setFolder(input: SetNoteFolderInput): Note {
    const current = this.get(input.id);
    if (current.folderId === input.folderId) return current;
    if (input.folderId !== null) this.requireFolder(input.folderId);
    this.ctx.db
      .prepare('UPDATE notes SET folder_id = ?, updated_at = ? WHERE id = ?')
      .run(input.folderId, nowIso(this.ctx), input.id);
    return this.get(input.id);
  }

  /** Saves the title and/or body. An unchanged note keeps its `updated_at`. */
  update(input: UpdateNoteInput): Note {
    const current = this.get(input.id);
    if (current.archivedAt !== null) {
      throw new AppError('CONFLICT', 'Unarchive the note before editing it.');
    }
    const title = input.title ?? current.title;
    const body = input.body ?? current.body;
    if (title === current.title && body === current.body) return current;
    this.ctx.db.transaction(() => {
      this.ctx.db
        .prepare('UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?')
        .run(title, body, nowIso(this.ctx), input.id);
      if (body !== current.body) this.syncLinks(input.id, body);
    })();
    return this.get(input.id);
  }

  /**
   * Notes that link to this one, and notes that mention its title without a link (ADR-0017).
   * Trashed notes are left out; archived ones are listed among links but not mentions, since
   * linking a mention edits the note.
   */
  backlinks(id: string): NoteBacklinks {
    const target = this.get(id);
    const { db } = this.ctx;
    const live = 'n.deleted_at IS NULL AND p.deleted_at IS NULL AND n.id <> ?';
    const linked = new LinkService(this.ctx).mentionedIn({ kind: 'note', id }, id);

    const title = target.title.trim();
    const fts = toFtsQuery(title);
    if (title.length < MIN_MENTION_TITLE || title === DEFAULT_TITLE || fts === null) {
      return { linked, unlinked: [] };
    }
    const linkedIds = new Set(linked.map((b) => b.noteId));
    const candidates = db
      .prepare(
        `SELECT n.id, n.title, n.body, n.archived_at, n.updated_at
         FROM notes n JOIN projects p ON p.id = n.project_id
         WHERE ${live} AND n.archived_at IS NULL
           AND n.id IN (SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?)
         ORDER BY n.updated_at DESC, n.id LIMIT ?`,
      )
      .all(id, fts, BACKLINK_LIMIT) as BacklinkRow[];
    const unlinked: Backlink[] = [];
    for (const row of candidates) {
      if (linkedIds.has(row.id)) continue;
      const at = findPlainMention(row.body, title);
      if (at) unlinked.push(toBacklink(row, at[0]));
    }
    return { linked, unlinked };
  }

  /** Turns the first plain mention of the target's title in the source note into a link. */
  linkMention(input: LinkMentionInput): Note {
    const source = this.get(input.sourceId);
    if (source.archivedAt !== null) {
      throw new AppError('CONFLICT', 'Unarchive the note before editing it.');
    }
    const target = this.get(input.targetId);
    const at = findPlainMention(source.body, target.title);
    if (!at) {
      throw new AppError('CONFLICT', `“${source.title}” no longer mentions “${target.title}”.`);
    }
    const [start, end] = at;
    const linked = appLinkMarkdown({ kind: 'note', id: target.id }, source.body.slice(start, end));
    return this.update({
      id: source.id,
      body: source.body.slice(0, start) + linked + source.body.slice(end),
    });
  }

  /**
   * Builds the link index when notes hold links it lacks: links written before it existed, for
   * example in imported Markdown or a profile upgraded from schema v5. Runs when a profile opens.
   */
  rebuildLinkIndexIfNeeded(): number {
    const { db } = this.ctx;
    if (db.prepare('SELECT 1 FROM note_links LIMIT 1').get()) return 0;
    const rows = db
      .prepare("SELECT id, body FROM notes WHERE body LIKE '%projectforge://%'")
      .all() as { id: string; body: string }[];
    db.transaction(() => rows.forEach((row) => this.syncLinks(row.id, row.body)))();
    return rows.length;
  }

  /** Replaces the note's entries in the link index with the links in `body`. */
  private syncLinks(noteId: string, body: string): void {
    const { db } = this.ctx;
    db.prepare('DELETE FROM note_links WHERE source_note_id = ?').run(noteId);
    const insert = db.prepare(
      'INSERT INTO note_links (source_note_id, target_kind, target_id) VALUES (?, ?, ?)',
    );
    for (const target of extractAppLinks(body)) insert.run(noteId, target.kind, target.id);
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

  /** Inserts one note and its tags; call inside a transaction. */
  private insert(
    note: NewNote,
    archivedMessage = 'Unarchive the project before adding notes to it.',
  ): string {
    const { db } = this.ctx;
    const id = this.ctx.newId();
    const projectId = note.projectId ?? ensureInbox(this.ctx);
    this.requireOpenProject(projectId, archivedMessage);
    if (note.folderId) this.requireFolder(note.folderId);
    const now = nowIso(this.ctx);
    db.prepare(
      `INSERT INTO notes (id, project_id, folder_id, title, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, projectId, note.folderId ?? null, note.title, note.body, now, now);
    this.syncLinks(id, note.body);
    const insertTag = db.prepare('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)');
    for (const tagId of new Set(note.tagIds)) {
      if (!db.prepare('SELECT 1 FROM tags WHERE id = ?').get(tagId)) throw notFound('Tag');
      insertTag.run(id, tagId);
    }
    return id;
  }

  private requireFolder(folderId: string): void {
    if (!this.ctx.db.prepare('SELECT 1 FROM note_folders WHERE id = ?').get(folderId)) {
      throw notFound('Note folder');
    }
  }

  private requireOpenProject(projectId: string, archivedMessage: string): void {
    const project = requireLiveProject(this.ctx.db, projectId);
    if (project.archived_at !== null) throw new AppError('CONFLICT', archivedMessage);
  }
}
