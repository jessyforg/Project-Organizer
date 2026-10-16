import { describe, expect, it } from 'vitest';
import { setupProfile, statusOf } from './setup';

/**
 * Database-level guards (constraints and triggers). These hold even if service code
 * is bypassed, so raw SQL is used deliberately here.
 */
describe('database guards', () => {
  const now = '2026-01-01T00:00:00.000Z';

  async function twoProjects() {
    const p = await setupProfile();
    const a = p.projects.create({ name: 'A' });
    const b = p.projects.create({ name: 'B' });
    return { p, a, b };
  }

  it('rejects a task in a project that does not exist (invariant 1)', async () => {
    const { p, a } = await twoProjects();
    const status = statusOf(p, a.id, 'todo');
    expect(() =>
      p.db
        .prepare(
          `INSERT INTO tasks (id, project_id, status_id, title, sort_key, created_at, updated_at)
           VALUES ('t1', 'missing', ?, 'x', 1, ?, ?)`,
        )
        .run(status.id, now, now),
    ).toThrow();
  });

  it('rejects a status from another project (invariant 2)', async () => {
    const { p, a, b } = await twoProjects();
    expect(() =>
      p.db
        .prepare(
          `INSERT INTO tasks (id, project_id, status_id, title, sort_key, created_at, updated_at)
           VALUES ('t1', ?, ?, 'x', 1, ?, ?)`,
        )
        .run(a.id, statusOf(p, b.id, 'todo').id, now, now),
    ).toThrow(/status must belong/);
  });

  it('rejects subtasks across projects and nested subtasks (invariant 3)', async () => {
    const { p, a, b } = await twoProjects();
    const parent = p.tasks.create({ title: 'Parent', projectId: a.id });
    const child = p.tasks.create({ title: 'Child', parentTaskId: parent.id });
    const insert = p.db.prepare(
      `INSERT INTO tasks (id, project_id, parent_task_id, status_id, title, sort_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'x', 1, ?, ?)`,
    );
    expect(() =>
      insert.run('t-cross', b.id, parent.id, statusOf(p, b.id, 'todo').id, now, now),
    ).toThrow(/subtask parent/);
    expect(() =>
      insert.run('t-nested', a.id, child.id, statusOf(p, a.id, 'todo').id, now, now),
    ).toThrow(/subtask parent/);
  });

  it('rejects giving a parent task its own parent, and self-parenting (invariant 4)', async () => {
    const { p, a } = await twoProjects();
    const parent = p.tasks.create({ title: 'Parent', projectId: a.id });
    p.tasks.create({ title: 'Child', parentTaskId: parent.id });
    const other = p.tasks.create({ title: 'Other', projectId: a.id });
    expect(() =>
      p.db.prepare('UPDATE tasks SET parent_task_id = ? WHERE id = ?').run(other.id, parent.id),
    ).toThrow(/subtask parent/);
    expect(() =>
      p.db.prepare('UPDATE tasks SET parent_task_id = id WHERE id = ?').run(other.id),
    ).toThrow();
  });

  it('rejects cross-project and self dependencies (invariant 5)', async () => {
    const { p, a, b } = await twoProjects();
    const x = p.tasks.create({ title: 'X', projectId: a.id });
    const y = p.tasks.create({ title: 'Y', projectId: b.id });
    const insert = p.db.prepare(
      'INSERT INTO task_dependencies (task_id, depends_on_task_id, created_at) VALUES (?, ?, ?)',
    );
    expect(() => insert.run(x.id, y.id, now)).toThrow(/same project/);
    expect(() => insert.run(x.id, x.id, now)).toThrow();
  });

  it('allows exactly one Inbox and one default status per project (invariant 7)', async () => {
    const { p, a } = await twoProjects();
    expect(() =>
      p.db
        .prepare(
          `INSERT INTO projects (id, name, is_inbox, created_at, updated_at) VALUES ('i2', 'Inbox 2', 1, ?, ?)`,
        )
        .run(now, now),
    ).toThrow(/UNIQUE/);
    expect(() =>
      p.db.prepare('UPDATE project_statuses SET is_default = 1 WHERE project_id = ?').run(a.id),
    ).toThrow(/UNIQUE|CHECK/);
  });

  it('keeps the Inbox active, unarchived, and out of the trash', async () => {
    const { p } = await twoProjects();
    for (const sql of [
      "UPDATE projects SET status = 'completed' WHERE is_inbox = 1",
      "UPDATE projects SET archived_at = 'x' WHERE is_inbox = 1",
      "UPDATE projects SET deleted_at = 'x', deletion_batch_id = 'b' WHERE is_inbox = 1",
    ]) {
      expect(() => p.db.prepare(sql).run()).toThrow(/CHECK/);
    }
  });

  it('rejects malformed dates and start after due', async () => {
    const { p, a } = await twoProjects();
    const task = p.tasks.create({ title: 'T', projectId: a.id });
    expect(() =>
      p.db.prepare("UPDATE tasks SET due_date = '2026/01/01' WHERE id = ?").run(task.id),
    ).toThrow(/CHECK/);
    expect(() =>
      p.db
        .prepare("UPDATE tasks SET start_date = '2026-02-01', due_date = '2026-01-01' WHERE id = ?")
        .run(task.id),
    ).toThrow(/CHECK/);
  });
});
