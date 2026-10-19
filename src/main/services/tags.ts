import type { Tag } from '@shared/domain';
import type { CreateTagInput, UpdateTagInput } from '@shared/schemas';
import { nameKey } from '../domain/text';
import { notFound, nowIso, placeholders, withUniqueName, type ServiceContext } from './context';
import { TAG_SELECT, toTag, type TagRow } from './rows';

const DUPLICATE = 'A tag with this name already exists.';

export class TagService {
  constructor(private readonly ctx: ServiceContext) {}

  list(): Tag[] {
    return (this.ctx.db.prepare(`${TAG_SELECT} ORDER BY name_key`).all() as TagRow[]).map(toTag);
  }

  get(id: string): Tag {
    const row = this.ctx.db.prepare(`${TAG_SELECT} WHERE id = ?`).get(id) as TagRow | undefined;
    if (!row) throw notFound('Tag');
    return toTag(row);
  }

  create(input: CreateTagInput): Tag {
    const id = this.ctx.newId();
    const now = nowIso(this.ctx);
    withUniqueName(DUPLICATE, () =>
      this.ctx.db
        .prepare(
          `INSERT INTO tags (id, name, name_key, color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(id, input.name, nameKey(input.name), input.color ?? null, now, now),
    );
    return this.get(id);
  }

  update(input: UpdateTagInput): Tag {
    const current = this.get(input.id);
    const name = input.name ?? current.name;
    const color = input.color === undefined ? current.color : input.color;
    withUniqueName(DUPLICATE, () =>
      this.ctx.db
        .prepare('UPDATE tags SET name = ?, name_key = ?, color = ?, updated_at = ? WHERE id = ?')
        .run(name, nameKey(name), color, nowIso(this.ctx), input.id),
    );
    return this.get(input.id);
  }

  /** Removes the tag from every task, project, and note. */
  delete(id: string): void {
    const result = this.ctx.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Tag');
  }

  setTaskTags(taskId: string, tagIds: string[]): void {
    this.replaceLinks('task_tags', 'task_id', 'tasks', 'Task', taskId, tagIds);
  }

  setProjectTags(projectId: string, tagIds: string[]): void {
    this.replaceLinks('project_tags', 'project_id', 'projects', 'Project', projectId, tagIds);
  }

  setNoteTags(noteId: string, tagIds: string[]): void {
    this.replaceLinks('note_tags', 'note_id', 'notes', 'Note', noteId, tagIds);
  }

  private replaceLinks(
    table: 'task_tags' | 'project_tags' | 'note_tags',
    ownerColumn: 'task_id' | 'project_id' | 'note_id',
    ownerTable: 'tasks' | 'projects' | 'notes',
    ownerLabel: string,
    ownerId: string,
    tagIds: string[],
  ): void {
    const { db } = this.ctx;
    const unique = [...new Set(tagIds)];
    db.transaction(() => {
      const owner = db
        .prepare(`SELECT 1 FROM ${ownerTable} WHERE id = ? AND deleted_at IS NULL`)
        .get(ownerId);
      if (!owner) throw notFound(ownerLabel);
      if (unique.length > 0) {
        const found = db
          .prepare(`SELECT count(*) AS n FROM tags WHERE id IN (${placeholders(unique.length)})`)
          .get(...unique) as { n: number };
        if (found.n !== unique.length) throw notFound('Tag');
      }
      db.prepare(`DELETE FROM ${table} WHERE ${ownerColumn} = ?`).run(ownerId);
      const insert = db.prepare(`INSERT INTO ${table} (${ownerColumn}, tag_id) VALUES (?, ?)`);
      for (const tagId of unique) insert.run(ownerId, tagId);
      db.prepare(`UPDATE ${ownerTable} SET updated_at = ? WHERE id = ?`).run(
        nowIso(this.ctx),
        ownerId,
      );
    })();
  }
}
