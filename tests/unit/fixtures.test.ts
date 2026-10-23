import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeStandalone, openDatabase } from '../../src/main/db/connection';
import { migrate } from '../../src/main/db/migrator';
import { appMigrations } from '../../src/main/db/migrations/app';
import { profileMigrations } from '../../src/main/db/migrations/profile';
import { nullLogger } from '../../src/main/platform/logger';
import { createProfileServices, runProfileMaintenance } from '../../src/main/services';
import { ensureInbox } from '../../src/main/services/projects';
import { fakeClock, tempDir } from './helpers';

/**
 * Upgrade tests against committed databases from earlier schema versions (TESTING.md §3).
 * Committed files catch accidental edits to old migrations, which fixtures generated at
 * test time would not. Regenerate only when adding a new released version:
 *   REGENERATE_FIXTURES=1 npx vitest run tests/unit/fixtures.test.ts
 */
const DIR = path.resolve(__dirname, '../fixtures');
const clock = fakeClock('2026-10-17T00:00:00.000Z');

// Released in 0.4.0 and 0.5.0: archived notes. Holds an app link written as Markdown, so the
// upgrade to v6 must build the link index from it.
const V5_TARGET = '5c4b3a29-1807-4f6e-9d5c-4b3a2f1e0d9c';
const V5_SOURCE = '6d5c4b3a-2918-4a7f-8e6d-5c4b3a2f1e0d';
function fillV5(db: ReturnType<typeof openDatabase>) {
  ensureInbox({ db, clock, newId: randomUUID });
  const inbox = db.prepare('SELECT id FROM projects WHERE is_inbox = 1').get() as { id: string };
  const note = db.prepare(
    `INSERT INTO notes (id, project_id, title, body, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'x', 'x')`,
  );
  note.run(V5_TARGET, inbox.id, 'Roadmap', 'Where we are going', null);
  note.run(V5_SOURCE, inbox.id, 'Weekly', `See [Roadmap](projectforge://note/${V5_TARGET}).`, null);
  note.run(randomUUID(), inbox.id, 'Old', 'Archived note', 'x');
}

async function build(
  file: string,
  migrations: typeof profileMigrations,
  fill: (db: ReturnType<typeof openDatabase>) => void,
) {
  fs.rmSync(file, { force: true });
  const db = openDatabase(file);
  await migrate({ db, migrations, snapshotDir: tempDir(), clock, logger: nullLogger });
  fill(db);
  db.close();
  makeStandalone(file);
}

if (process.env['REGENERATE_FIXTURES']) {
  it('regenerates fixtures', async () => {
    fs.mkdirSync(DIR, { recursive: true });
    await build(path.join(DIR, 'app-v1.db'), appMigrations.slice(0, 1), (db) => {
      db.prepare(
        `INSERT INTO profiles (id, display_name, name_key, created_at, updated_at, last_opened_at)
         VALUES ('6f1c2a7e-4b8d-4c1e-9a3f-2d5e6b7c8d9e', 'Ñora', 'ñora', 'x', 'x', 'x')`,
      ).run();
    });
    await build(path.join(DIR, 'profile-v1.db'), profileMigrations.slice(0, 1), (db) => {
      db.prepare(
        "INSERT INTO settings (key, value_json, updated_at) VALUES ('theme', '\"dark\"', 'x')",
      ).run();
    });
    await build(path.join(DIR, 'profile-v2.db'), profileMigrations.slice(0, 2), (db) => {
      const ctx = { db, clock, newId: randomUUID };
      ensureInbox(ctx);
      const s = createProfileServices(ctx);
      const folder = s.folders.create({ name: 'Work' });
      const tag = s.tags.create({ name: 'Bug', color: 'red' });
      const project = s.projects.create({ name: 'Website', folderId: folder.id, tagIds: [tag.id] });
      const a = s.tasks.create({
        title: 'Design',
        projectId: project.id,
        priority: 'high',
        dueDate: '2026-11-01',
      });
      const b = s.tasks.create({ title: 'Build', projectId: project.id, tagIds: [tag.id] });
      s.tasks.create({ title: 'Wireframes', parentTaskId: a.id });
      s.dependencies.add({ taskId: b.id, dependsOnTaskId: a.id });
      s.tasks.setCompleted(s.tasks.create({ title: 'Domain', projectId: project.id }).id, true);
      s.trash.trashTask(s.tasks.create({ title: 'Old idea', projectId: project.id }).id);
      s.settings.update({ theme: 'dark' });
    });
    // Released in 0.2.0. Filled with SQL because today's services expect later columns.
    await build(path.join(DIR, 'profile-v3.db'), profileMigrations.slice(0, 3), (db) => {
      ensureInbox({ db, clock, newId: randomUUID });
      const inbox = db.prepare('SELECT id FROM projects WHERE is_inbox = 1').get() as {
        id: string;
      };
      db.prepare(
        `INSERT INTO tags (id, name, name_key, color, created_at, updated_at)
         VALUES ('3c0d5b2a-1f4e-4a7b-9c8d-0e1f2a3b4c5d', 'Idea', 'idea', 'blue', 'x', 'x')`,
      ).run();
      db.prepare(
        `INSERT INTO notes (id, project_id, title, body, created_at, updated_at)
         VALUES ('9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', ?, 'Roadmap',
                 '# Roadmap\n\n- [ ] Ship folders', 'x', 'x')`,
      ).run(inbox.id);
      db.prepare(
        `INSERT INTO note_tags (note_id, tag_id)
         VALUES ('9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', '3c0d5b2a-1f4e-4a7b-9c8d-0e1f2a3b4c5d')`,
      ).run();
    });
    // Released in the 0.3.0 installer: note folders.
    await build(path.join(DIR, 'profile-v4.db'), profileMigrations.slice(0, 4), (db) => {
      ensureInbox({ db, clock, newId: randomUUID });
      const inbox = db.prepare('SELECT id FROM projects WHERE is_inbox = 1').get() as {
        id: string;
      };
      db.prepare(
        `INSERT INTO note_folders (id, name, name_key, created_at, updated_at)
         VALUES ('4e3d2c1b-0a9f-4e8d-9c7b-6a5f4e3d2c1b', 'Plans', 'plans', 'x', 'x')`,
      ).run();
      db.prepare(
        `INSERT INTO notes (id, project_id, folder_id, title, body, created_at, updated_at)
         VALUES ('8a7b6c5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d', ?, '4e3d2c1b-0a9f-4e8d-9c7b-6a5f4e3d2c1b',
                 'Retro', 'What went well', 'x', 'x')`,
      ).run(inbox.id);
    });
    await build(path.join(DIR, 'profile-v5.db'), profileMigrations.slice(0, 5), fillV5);
  });
} else {
  describe('upgrades from committed fixtures', () => {
    const copy = (name: string) => {
      const file = path.join(tempDir(), name);
      fs.copyFileSync(path.join(DIR, name), file);
      return file;
    };

    it.each([
      ['app-v1.db', appMigrations],
      ['profile-v1.db', profileMigrations],
      ['profile-v2.db', profileMigrations],
      ['profile-v3.db', profileMigrations],
      ['profile-v4.db', profileMigrations],
      ['profile-v5.db', profileMigrations],
    ] as const)(
      '%s upgrades to the current schema with integrity intact',
      async (name, migrations) => {
        const db = openDatabase(copy(name));
        const result = await migrate({
          db,
          migrations,
          snapshotDir: tempDir(),
          clock,
          logger: nullLogger,
        });
        expect(result.toVersion).toBe(migrations.length);
        expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
        expect(db.pragma('foreign_key_check')).toEqual([]);
        db.close();
      },
    );

    it('keeps profile v2 data and its relationships', async () => {
      const db = openDatabase(copy('profile-v2.db'));
      await migrate({
        db,
        migrations: profileMigrations,
        snapshotDir: tempDir(),
        clock,
        logger: nullLogger,
      });
      const s = createProfileServices({ db, clock, newId: randomUUID });
      const website = s.projects.list().find((p) => p.name === 'Website')!;
      expect(website.tagIds).toHaveLength(1);
      const titles = s.tasks
        .list({ projectId: website.id })
        .map((t) => t.title)
        .sort();
      expect(titles).toEqual(['Build', 'Design', 'Domain', 'Wireframes']);
      const build = s.tasks.list({ text: 'Build' })[0]!;
      expect(build.prerequisiteIds).toHaveLength(1);
      expect(s.trash.list().map((e) => e.title)).toEqual(['Old idea']);
      expect(s.projects.progress(website.id)).toEqual({ done: 1, total: 3, ratio: 1 / 3 });
      expect(s.settings.get().theme).toBe('dark');
      // Schema v3: notes work on an upgraded profile and are searchable.
      s.notes.create({ title: 'After upgrade', projectId: website.id, body: 'Launch checklist' });
      expect(s.search.search('checklist').notes.map((n) => n.title)).toEqual(['After upgrade']);
      db.close();
    });

    it('keeps profile v3 notes and tags, and adds note folders (schema v4)', async () => {
      const db = openDatabase(copy('profile-v3.db'));
      await migrate({
        db,
        migrations: profileMigrations,
        snapshotDir: tempDir(),
        clock,
        logger: nullLogger,
      });
      const s = createProfileServices({ db, clock, newId: randomUUID });
      const [roadmap] = s.notes.list();
      expect(roadmap).toMatchObject({
        title: 'Roadmap',
        folderId: null,
        tagIds: [expect.any(String)],
      });
      expect(s.notes.get(roadmap!.id).body).toBe('# Roadmap\n\n- [ ] Ship folders');
      const folder = s.noteFolders.create({ name: 'Plans' });
      s.notes.setFolder({ id: roadmap!.id, folderId: folder.id });
      expect(s.noteFolders.list()).toEqual([expect.objectContaining({ noteCount: 1 })]);
      expect(s.search.search('folders').notes.map((n) => n.title)).toEqual(['Roadmap']);
      db.close();
    });

    it('keeps profile v4 note folders, and adds note archiving (schema v5)', async () => {
      const db = openDatabase(copy('profile-v4.db'));
      await migrate({
        db,
        migrations: profileMigrations,
        snapshotDir: tempDir(),
        clock,
        logger: nullLogger,
      });
      const s = createProfileServices({ db, clock, newId: randomUUID });
      const [retro] = s.notes.list();
      expect(retro).toMatchObject({ title: 'Retro', archivedAt: null });
      expect(s.noteFolders.list()).toEqual([
        expect.objectContaining({ name: 'Plans', noteCount: 1 }),
      ]);
      s.notes.archive(retro!.id);
      expect(s.notes.list()).toEqual([]);
      expect(s.noteFolders.list()[0]!.noteCount).toBe(0);
      db.close();
    });

    it('keeps profile v5 notes, and builds the link index on opening (schema v6)', async () => {
      const db = openDatabase(copy('profile-v5.db'));
      await migrate({
        db,
        migrations: profileMigrations,
        snapshotDir: tempDir(),
        clock,
        logger: nullLogger,
      });
      const ctx = { db, clock, newId: randomUUID };
      runProfileMaintenance(ctx, nullLogger);
      const s = createProfileServices(ctx);
      expect(s.notes.list({ archived: 'only' }).map((n) => n.title)).toEqual(['Old']);
      expect(s.notes.backlinks(V5_TARGET).linked).toEqual([
        expect.objectContaining({ noteId: V5_SOURCE, snippet: 'See Roadmap.' }),
      ]);
      db.close();
    });

    it('keeps app v1 profile names, including non-ASCII ones', async () => {
      const db = openDatabase(copy('app-v1.db'));
      await migrate({
        db,
        migrations: appMigrations,
        snapshotDir: tempDir(),
        clock,
        logger: nullLogger,
      });
      expect(db.prepare('SELECT display_name FROM profiles').all()).toEqual([
        { display_name: 'Ñora' },
      ]);
      db.close();
    });
  });
}
