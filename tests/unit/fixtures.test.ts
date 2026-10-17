import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeStandalone, openDatabase } from '../../src/main/db/connection';
import { migrate } from '../../src/main/db/migrator';
import { appMigrations } from '../../src/main/db/migrations/app';
import { profileMigrations } from '../../src/main/db/migrations/profile';
import { nullLogger } from '../../src/main/platform/logger';
import { createProfileServices } from '../../src/main/services';
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
