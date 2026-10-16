import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/db/connection';
import { migrate, type Migration } from '../../../src/main/db/migrator';
import { appMigrations } from '../../../src/main/db/migrations/app';
import { profileMigrations } from '../../../src/main/db/migrations/profile';
import { AppError } from '../../../src/main/errors';
import { nullLogger } from '../../../src/main/platform/logger';
import { fakeClock, tempDir } from '../helpers';

const v1: Migration = {
  version: 1,
  name: 'notes',
  sql: 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT) STRICT;',
};
const v2: Migration = {
  version: 2,
  name: 'tags',
  sql: 'CREATE TABLE tags (id INTEGER PRIMARY KEY) STRICT;',
};
const v3Broken: Migration = {
  version: 3,
  name: 'broken',
  sql: 'CREATE TABLE ok (id INTEGER); THIS IS NOT SQL;',
};

function setup() {
  const dir = tempDir();
  const file = path.join(dir, 'test.db');
  const snapshotDir = path.join(dir, 'snapshots');
  const run = async (migrations: readonly Migration[]) => {
    const db = openDatabase(file);
    try {
      return await migrate({ db, migrations, snapshotDir, clock: fakeClock(), logger: nullLogger });
    } finally {
      db.close();
    }
  };
  const tables = () => {
    const db = openDatabase(file);
    const names = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    const version = db.pragma('user_version', { simple: true });
    db.close();
    return { names, version };
  };
  return { file, snapshotDir, run, tables };
}

async function expectAppError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

describe('migrate', () => {
  it('applies all migrations to a new database without a snapshot', async () => {
    const t = setup();
    const result = await t.run([v1, v2]);
    expect(result).toEqual({ fromVersion: 0, toVersion: 2, snapshotPath: null });
    expect(t.tables()).toEqual({ names: ['notes', 'schema_migrations', 'tags'], version: 2 });
  });

  it('is idempotent when nothing is pending', async () => {
    const t = setup();
    await t.run([v1]);
    const result = await t.run([v1]);
    expect(result).toEqual({ fromVersion: 1, toVersion: 1, snapshotPath: null });
  });

  it('takes a verified snapshot before upgrading an existing database', async () => {
    const t = setup();
    await t.run([v1]);
    const db = openDatabase(t.file);
    db.prepare("INSERT INTO notes (body) VALUES ('keep me')").run();
    db.close();

    const result = await t.run([v1, v2]);
    expect(result.snapshotPath).not.toBeNull();
    const snapshot = openDatabase(result.snapshotPath as string, { readonly: true });
    expect(snapshot.prepare('SELECT body FROM notes').get()).toEqual({ body: 'keep me' });
    expect(snapshot.pragma('user_version', { simple: true })).toBe(1);
    snapshot.close();
  });

  it('rolls back every pending migration when one fails, leaving data unchanged', async () => {
    const t = setup();
    await t.run([v1]);
    const db = openDatabase(t.file);
    db.prepare("INSERT INTO notes (body) VALUES ('original')").run();
    db.close();

    await expectAppError(t.run([v1, v2, v3Broken]), 'MIGRATION_FAILED');

    expect(t.tables()).toEqual({ names: ['notes', 'schema_migrations'], version: 1 });
    const check = openDatabase(t.file);
    expect(check.prepare('SELECT body FROM notes').all()).toEqual([{ body: 'original' }]);
    check.close();
    expect(fs.readdirSync(t.snapshotDir)).toHaveLength(1);
  });

  it('refuses a database created by a newer app version without modifying it', async () => {
    const t = setup();
    await t.run([v1, v2]);
    const before = fs.readFileSync(t.file);
    await expectAppError(t.run([v1]), 'DB_NEWER_VERSION');
    expect(t.tables().version).toBe(2);
    expect(fs.readFileSync(t.file).length).toBe(before.length);
  });

  it('rejects an applied migration whose SQL was edited', async () => {
    const t = setup();
    await t.run([v1]);
    const edited = { ...v1, sql: v1.sql + ' -- edited' };
    await expectAppError(t.run([edited]), 'MIGRATION_FAILED');
  });

  it('rejects migration lists with gaps', async () => {
    const t = setup();
    await expect(t.run([v2])).rejects.toThrow(/without gaps/);
  });

  it('applies the real app and profile migrations', async () => {
    for (const migrations of [appMigrations, profileMigrations]) {
      const t = setup();
      const result = await t.run(migrations);
      expect(result.toVersion).toBe(migrations.length);
    }
  });
});
