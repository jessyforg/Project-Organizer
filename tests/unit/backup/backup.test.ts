import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupService, type BackupDeps } from '../../../src/main/backup/backup-service';
import { encryptInPlace, openEncrypted } from '../../../src/main/backup/cipher';
import {
  buildJsonExport,
  exportSchema,
  writeJsonExport,
} from '../../../src/main/backup/json-export';
import {
  countRows,
  writeManifest,
  BACKUP_FORMAT,
  INCLUDES,
  OMITS,
} from '../../../src/main/backup/manifest';
import {
  listSnapshots,
  pruneSnapshots,
  takeDailySnapshot,
} from '../../../src/main/backup/snapshots';
import { makeStandalone, openDatabase } from '../../../src/main/db/connection';
import { migrate } from '../../../src/main/db/migrator';
import { appMigrations } from '../../../src/main/db/migrations/app';
import { profileMigrations } from '../../../src/main/db/migrations/profile';
import { AppError } from '../../../src/main/errors';
import { nullLogger } from '../../../src/main/platform/logger';
import { createAppPaths } from '../../../src/main/platform/paths';
import { ProfileRegistry } from '../../../src/main/profiles/profile-registry';
import { ProfileService } from '../../../src/main/profiles/profile-service';
import { createProfileServices, runProfileMaintenance } from '../../../src/main/services';
import { tempDir } from '../helpers';
import { testClock } from '../services/setup';

vi.setConfig({ testTimeout: 30_000 });

const PASSWORD = 'correct horse battery';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
const SECRET_TITLE = 'Quarterly salary negotiation notes';

async function setup(overrides: Partial<BackupDeps> = {}) {
  const root = tempDir();
  const paths = createAppPaths(root);
  const time = testClock();
  const appDb = openDatabase(paths.appDb);
  await migrate({
    db: appDb,
    migrations: appMigrations,
    snapshotDir: paths.appSnapshots,
    clock: time.clock,
    logger: nullLogger,
  });
  const failOpen = { next: false };
  const profiles = new ProfileService({
    registry: new ProfileRegistry(appDb),
    paths,
    clock: time.clock,
    newId: randomUUID,
    logger: nullLogger,
    onOpened: (db, id) => {
      if (failOpen.next) {
        failOpen.next = false;
        throw new Error('simulated failure while opening');
      }
      runProfileMaintenance({ db, clock: time.clock, newId: randomUUID }, nullLogger, {
        snapshotDir: paths.profileSnapshots(id),
      });
    },
  });
  const backups = new BackupService({
    paths,
    profiles,
    clock: time.clock,
    newId: randomUUID,
    appVersion: '0.1.0-test',
    logger: nullLogger,
    ...overrides,
  });
  const services = () =>
    createProfileServices({ db: profiles.activeDb(), clock: time.clock, newId: randomUUID });
  const work = await profiles.create('Work');
  const project = services().projects.create({ name: 'Career' });
  const parent = services().tasks.create({
    title: SECRET_TITLE,
    projectId: project.id,
    priority: 'high',
  });
  services().tasks.create({ title: 'Gather offers', parentTaskId: parent.id });
  const backupFile = path.join(tempDir(), 'work.pfbackup');
  const cleanup = () => {
    profiles.close();
    appDb.close();
  };
  cleanups.push(cleanup);
  return { root, paths, time, profiles, backups, services, work, backupFile, failOpen };
}

async function codeOf(fn: () => unknown): Promise<string | undefined> {
  try {
    await fn();
  } catch (error) {
    return error instanceof AppError ? error.code : `non-AppError: ${String(error)}`;
  }
  return undefined;
}

function tmpEntries(paths: { tmp: string }): string[] {
  return fs.existsSync(paths.tmp) ? fs.readdirSync(paths.tmp) : [];
}

describe('BackupService: export and inspect', () => {
  it('writes an encrypted backup with no readable content and an accurate manifest', async () => {
    const t = await setup();
    const manifest = await t.backups.exportActive(PASSWORD, t.backupFile);
    const bytes = fs.readFileSync(t.backupFile);
    expect(bytes.includes(Buffer.from(SECRET_TITLE))).toBe(false);
    expect(bytes.subarray(0, 15).toString()).not.toBe('SQLite format 3');
    expect(manifest).toMatchObject({
      format: 'projectforge-backup',
      profileName: 'Work',
      schemaVersion: profileMigrations.length,
    });
    expect(manifest.counts['tasks']).toBe(2);
    expect(manifest.includes.length).toBeGreaterThan(0);
    expect(t.backups.inspect(t.backupFile, PASSWORD)).toEqual(manifest);
    expect(tmpEntries(t.paths)).toEqual([]);
    expect(fs.existsSync(`${t.backupFile}.partial`)).toBe(false);
  });

  it('rejects a wrong password', async () => {
    const t = await setup();
    await t.backups.exportActive(PASSWORD, t.backupFile);
    expect(await codeOf(() => t.backups.inspect(t.backupFile, 'wrong password!'))).toBe(
      'BACKUP_WRONG_PASSWORD_OR_DAMAGED',
    );
  });

  it.each([
    ['truncated', (b: Buffer) => b.subarray(0, Math.floor(b.length / 2))],
    [
      'corrupted in the middle',
      (b: Buffer) => {
        const c = Buffer.from(b);
        c.fill(0x5a, Math.floor(c.length / 2), Math.floor(c.length / 2) + 2048);
        return c;
      },
    ],
    ['empty', () => Buffer.alloc(0)],
    ['random bytes', (b: Buffer) => Buffer.alloc(b.length, 7)],
  ])('rejects a %s file', async (_label, damage) => {
    const t = await setup();
    await t.backups.exportActive(PASSWORD, t.backupFile);
    fs.writeFileSync(t.backupFile, damage(fs.readFileSync(t.backupFile)));
    const code = await codeOf(() => t.backups.inspect(t.backupFile, PASSWORD));
    expect(['BACKUP_WRONG_PASSWORD_OR_DAMAGED', 'BACKUP_INVALID']).toContain(code);
    expect(tmpEntries(t.paths)).toEqual([]);
  });

  it('rejects an encrypted file that is not a ProjectForge backup', async () => {
    const t = await setup();
    const file = path.join(tempDir(), 'other.db');
    const db = openDatabase(file);
    db.exec('CREATE TABLE x (y)');
    db.close();
    makeStandalone(file);
    encryptInPlace(file, PASSWORD);
    expect(await codeOf(() => t.backups.inspect(file, PASSWORD))).toBe('BACKUP_INVALID');
  });

  it.each([
    ['a newer backup format', { formatVersion: 99 }, false],
    ['a newer data schema', { schemaVersion: 99 }, true],
  ])('refuses %s', async (_label, patch, bumpUserVersion) => {
    const t = await setup();
    const manifest = await t.backups.exportActive(PASSWORD, t.backupFile);
    const db = openEncrypted(t.backupFile, PASSWORD);
    db.prepare("UPDATE backup_manifest SET value_json = ? WHERE key = 'manifest'").run(
      JSON.stringify({ ...manifest, ...patch }),
    );
    if (bumpUserVersion) db.pragma('user_version = 99');
    db.close();
    expect(await codeOf(() => t.backups.inspect(t.backupFile, PASSWORD))).toBe(
      'BACKUP_INCOMPATIBLE',
    );
  });

  it('detects missing records (counts differ from the manifest)', async () => {
    const t = await setup();
    await t.backups.exportActive(PASSWORD, t.backupFile);
    const db = openEncrypted(t.backupFile, PASSWORD);
    db.prepare('DELETE FROM tasks WHERE parent_task_id IS NOT NULL').run();
    db.close();
    expect(await codeOf(() => t.backups.inspect(t.backupFile, PASSWORD))).toBe('BACKUP_INVALID');
  });

  it('leaves no partial file when the write is interrupted', async () => {
    const t = await setup({
      copyFile: (_from, to) => {
        fs.writeFileSync(to, 'half a file');
        throw Object.assign(new Error('write interrupted'), { code: 'EIO' });
      },
    });
    expect(await codeOf(() => t.backups.exportActive(PASSWORD, t.backupFile))).toBe(
      'non-AppError: Error: write interrupted',
    );
    expect(fs.existsSync(t.backupFile)).toBe(false);
    expect(fs.existsSync(`${t.backupFile}.partial`)).toBe(false);
    expect(tmpEntries(t.paths)).toEqual([]);
  });

  it('reports a full disk before writing, and when the disk fills during the write', async () => {
    const full = await setup({ freeBytes: () => 0 });
    expect(await codeOf(() => full.backups.exportActive(PASSWORD, full.backupFile))).toBe(
      'NOT_ENOUGH_SPACE',
    );
    expect(fs.existsSync(full.backupFile)).toBe(false);

    const filling = await setup({
      copyFile: () => {
        throw Object.assign(new Error('no space'), { code: 'ENOSPC' });
      },
    });
    expect(await codeOf(() => filling.backups.exportActive(PASSWORD, filling.backupFile))).toBe(
      'NOT_ENOUGH_SPACE',
    );
    expect(fs.existsSync(`${filling.backupFile}.partial`)).toBe(false);
  });
});

describe('BackupService: restore', () => {
  it('test-restores into a temporary location without changing anything', async () => {
    const t = await setup();
    await t.backups.exportActive(PASSWORD, t.backupFile);
    const report = await t.backups.testRestore(t.backupFile, PASSWORD);
    expect(report.counts['tasks']).toBe(2);
    expect(report.schemaVersion).toBe(profileMigrations.length);
    expect(t.profiles.list()).toHaveLength(1);
    expect(tmpEntries(t.paths)).toEqual([]);
  });

  it('restores as a new profile with matching contents; the original is untouched', async () => {
    const t = await setup();
    await t.backups.exportActive(PASSWORD, t.backupFile);
    t.services().tasks.create({ title: 'Added after backup' });
    const restored = await t.backups.restoreAsNew(t.backupFile, PASSWORD, 'Work');
    expect(restored.displayName).toBe('Work (2)');
    expect(t.profiles.getActive()?.id).toBe(t.work.id);
    expect(t.services().tasks.list({ text: 'Added after' })).toHaveLength(1);

    await t.profiles.switchTo(restored.id);
    const titles = t
      .services()
      .tasks.list()
      .map((x) => x.title)
      .sort();
    expect(titles).toEqual(['Gather offers', SECRET_TITLE]);
    const parent = t.services().tasks.list({ parentTaskId: null })[0]!;
    expect(parent.subtaskCount).toBe(1);
  });

  it('replaces the open profile, keeping a verified copy of the previous data', async () => {
    const t = await setup();
    await t.backups.exportActive(PASSWORD, t.backupFile);
    t.services().tasks.create({ title: 'Will be replaced' });
    const summary = await t.backups.replaceActive(t.backupFile, PASSWORD);
    expect(summary.id).toBe(t.work.id);
    expect(t.services().tasks.list({ text: 'replaced' })).toEqual([]);
    expect(t.services().tasks.list()).toHaveLength(2);

    const preRestore = listSnapshots(t.paths.profileSnapshots(t.work.id)).find(
      (s) => s.kind === 'pre-restore',
    );
    expect(preRestore).toBeDefined();
    const copy = openDatabase(path.join(t.paths.profileSnapshots(t.work.id), preRestore!.name), {
      readonly: true,
    });
    expect(
      copy.prepare("SELECT count(*) AS n FROM tasks WHERE title = 'Will be replaced'").get(),
    ).toEqual({ n: 1 });
    copy.close();
  });

  it('rolls back to the original data if the restored profile cannot be opened', async () => {
    const t = await setup();
    await t.backups.exportActive(PASSWORD, t.backupFile);
    t.services().tasks.create({ title: 'Keep me' });
    t.failOpen.next = true;
    expect(await codeOf(() => t.backups.replaceActive(t.backupFile, PASSWORD))).toBe(
      'non-AppError: Error: simulated failure while opening',
    );
    expect(t.profiles.getActive()?.id).toBe(t.work.id);
    expect(t.services().tasks.list({ text: 'Keep' })).toHaveLength(1);
    const dir = t.paths.profileDir(t.work.id);
    expect(
      fs.readdirSync(dir).filter((f) => f.includes('replaced') || f.endsWith('.journal')),
    ).toEqual([]);
  });

  it('upgrades a backup made with an older schema (from Phase 2, v1)', async () => {
    const t = await setup();
    const file = path.join(tempDir(), 'old.db');
    const old = openDatabase(file);
    await migrate({
      db: old,
      migrations: profileMigrations.slice(0, 1),
      snapshotDir: tempDir(),
      clock: t.time.clock,
      logger: nullLogger,
    });
    old
      .prepare(
        "INSERT INTO settings (key, value_json, updated_at) VALUES ('theme', '\"dark\"', 'x')",
      )
      .run();
    writeManifest(old, {
      format: BACKUP_FORMAT,
      formatVersion: 1,
      appVersion: '0.0.1',
      schemaVersion: 1,
      profileId: randomUUID(),
      profileName: 'Old',
      createdAt: new Date().toISOString(),
      counts: countRows(old),
      includes: INCLUDES,
      omits: OMITS,
    });
    old.close();
    makeStandalone(file);
    encryptInPlace(file, PASSWORD);

    const report = await t.backups.testRestore(file, PASSWORD);
    expect(report.schemaVersion).toBe(profileMigrations.length);
    const restored = await t.backups.restoreAsNew(file, PASSWORD, 'Old');
    await t.profiles.switchTo(restored.id);
    expect(t.services().settings.get().theme).toBe('dark');
    expect(t.services().projects.list()[0]?.isInbox).toBe(true);
  });
});

describe('interrupted database replacement', () => {
  async function interrupted(newFileUsable: boolean) {
    const t = await setup();
    const id = t.work.id;
    t.services().tasks.create({ title: 'Original data' });
    t.profiles.close();
    const live = t.paths.profileDb(id);
    // State after a crash between "move old aside" and "verify new file".
    fs.renameSync(live, `${live}.replaced`);
    if (newFileUsable) {
      fs.copyFileSync(`${live}.replaced`, live);
      const db = openDatabase(live);
      db.prepare("UPDATE tasks SET title = 'New data' WHERE title = 'Original data'").run();
      db.close();
      makeStandalone(live);
    } else {
      fs.writeFileSync(live, Buffer.alloc(8192, 9));
    }
    fs.writeFileSync(path.join(t.paths.profileDir(id), 'replace.journal'), '{}');
    await t.profiles.switchTo(id);
    return t;
  }

  it('keeps the new file when it is usable', async () => {
    const t = await interrupted(true);
    expect(t.services().tasks.list({ text: 'New data' })).toHaveLength(1);
    expect(fs.readdirSync(t.paths.profileDir(t.work.id)).some((f) => f.includes('replaced'))).toBe(
      false,
    );
  });

  it('puts the original back when the new file is damaged', async () => {
    const t = await interrupted(false);
    expect(t.services().tasks.list({ text: 'Original data' })).toHaveLength(1);
  });
});

describe('snapshots and recovery', () => {
  it('takes one daily snapshot per day and keeps the last 7', async () => {
    const t = await setup();
    const dir = t.paths.profileSnapshots(t.work.id);
    const db = t.profiles.activeDb();
    expect(listSnapshots(dir).filter((s) => s.kind === 'daily')).toHaveLength(1);
    expect(takeDailySnapshot(db, dir, t.time.clock())).toBeNull();
    for (let i = 1; i <= 10; i++) {
      t.time.advanceDays(1);
      takeDailySnapshot(db, dir, t.time.clock());
    }
    pruneSnapshots(dir);
    expect(listSnapshots(dir).filter((s) => s.kind === 'daily')).toHaveLength(7);
  });

  it('recovers a damaged profile from a snapshot, keeping the damaged file', async () => {
    const t = await setup();
    const id = t.work.id;
    t.time.advanceDays(1);
    takeDailySnapshot(t.profiles.activeDb(), t.paths.profileSnapshots(id), t.time.clock());
    t.profiles.close();
    fs.writeFileSync(t.paths.profileDb(id), Buffer.alloc(8192, 3));
    expect(await codeOf(() => t.profiles.switchTo(id))).toBe('DB_INTEGRITY');

    const [snapshot] = t.profiles.listSnapshots(id);
    await t.profiles.restoreSnapshot(id, snapshot!.name);
    expect(t.services().tasks.list({ text: 'salary' })).toHaveLength(1);
    expect(
      fs
        .readdirSync(t.paths.profileDir(id))
        .some((f) => f.startsWith('profile.db.before-snapshot-')),
    ).toBe(true);
    expect(await codeOf(() => t.profiles.restoreSnapshot(id, '../../app.db'))).toBe(
      'VALIDATION_FAILED',
    );
  });
});

describe('profile trash (R15)', () => {
  it('trashes, restores with a new name if needed, and deletes permanently', async () => {
    const t = await setup();
    await t.profiles.trash(t.work.id);
    expect(t.profiles.getActive()).toBeNull();
    expect(t.profiles.list()).toEqual([]);
    await t.profiles.create('Work');
    const restored = await t.profiles.restoreTrashed(t.work.id);
    expect(restored.displayName).toBe('Work (2)');

    await t.profiles.trash(t.work.id);
    await t.profiles.deletePermanently(t.work.id);
    expect(fs.existsSync(t.paths.profileDir(t.work.id))).toBe(false);
    expect(t.profiles.listTrashed()).toEqual([]);
  });

  it('purges trashed profiles after 30 days', async () => {
    const t = await setup();
    await t.profiles.trash(t.work.id);
    t.time.advanceDays(29);
    expect(await t.profiles.purgeTrashed()).toBe(0);
    t.time.advanceDays(2);
    expect(await t.profiles.purgeTrashed()).toBe(1);
    expect(fs.existsSync(t.paths.profileDir(t.work.id))).toBe(false);
  });
});

describe('JSON export (R21)', () => {
  it('exports every table, including trashed rows, in a validated document', async () => {
    const t = await setup();
    const doomed = t.services().tasks.create({ title: 'In the trash' });
    t.services().trash.trashTask(doomed.id);
    const doc = buildJsonExport(
      t.profiles.activeDb(),
      { id: t.work.id, name: 'Work' },
      '0.1.0',
      new Date(),
    );
    expect(exportSchema.safeParse(doc).success).toBe(true);
    expect(doc.data['tasks']).toHaveLength(3);
    expect(doc.encrypted).toBe(false);

    const file = path.join(tempDir(), 'export.json');
    writeJsonExport(doc, file);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({
      format: 'projectforge-export',
    });
    expect(fs.existsSync(`${file}.partial`)).toBe(false);
  });
});
