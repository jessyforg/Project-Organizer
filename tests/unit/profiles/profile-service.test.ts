import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/db/connection';
import { migrate } from '../../../src/main/db/migrator';
import { appMigrations } from '../../../src/main/db/migrations/app';
import { AppError } from '../../../src/main/errors';
import { nullLogger } from '../../../src/main/platform/logger';
import { createAppPaths } from '../../../src/main/platform/paths';
import { ProfileRegistry } from '../../../src/main/profiles/profile-registry';
import { ProfileService } from '../../../src/main/profiles/profile-service';
import { fakeClock, tempDir } from '../helpers';

async function setup(root = tempDir()) {
  const paths = createAppPaths(root);
  fs.mkdirSync(root, { recursive: true });
  const appDb = openDatabase(paths.appDb);
  await migrate({
    db: appDb,
    migrations: appMigrations,
    snapshotDir: paths.appSnapshots,
    clock: fakeClock(),
    logger: nullLogger,
  });
  const service = new ProfileService({
    registry: new ProfileRegistry(appDb),
    paths,
    clock: fakeClock(),
    newId: randomUUID,
    logger: nullLogger,
  });
  const dispose = () => {
    service.close();
    appDb.close();
  };
  return { root, paths, service, dispose };
}

async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  return error instanceof AppError ? error.code : undefined;
}

describe('ProfileService', () => {
  it('creates a profile in its own directory and opens it', async () => {
    const { paths, service, dispose } = await setup();
    const profile = await service.create('Work');
    expect(profile.displayName).toBe('Work');
    expect(service.getActive()?.id).toBe(profile.id);
    expect(fs.existsSync(paths.profileDb(profile.id))).toBe(true);
    dispose();
  });

  it('rejects duplicate names case-insensitively, including non-ASCII letters', async () => {
    const { service, dispose } = await setup();
    await service.create('Ñora');
    expect(await errorCode(service.create('ñora'))).toBe('CONFLICT');
    expect(await errorCode(service.create('  ÑORA  '.trim()))).toBe('CONFLICT');
    expect(service.list()).toHaveLength(1);
    dispose();
  });

  it('does not leave a directory behind when creation fails', async () => {
    const { paths, service, dispose } = await setup();
    await service.create('Work');
    await service.create('Work').catch(() => undefined);
    expect(fs.readdirSync(paths.profiles)).toHaveLength(1);
    dispose();
  });

  it('keeps profile data isolated in separate database files', async () => {
    const { service, dispose } = await setup();
    const a = await service.create('A');
    service
      .activeDb()
      .prepare("INSERT INTO settings (key, value_json, updated_at) VALUES ('k', '\"a\"', 'now')")
      .run();
    const b = await service.create('B');
    expect(service.getActive()?.id).toBe(b.id);
    expect(service.activeDb().prepare('SELECT count(*) AS n FROM settings').get()).toEqual({
      n: 0,
    });
    await service.switchTo(a.id);
    expect(service.activeDb().prepare('SELECT value_json FROM settings').get()).toEqual({
      value_json: '"a"',
    });
    dispose();
  });

  it('renames without changing the ID', async () => {
    const { service, dispose } = await setup();
    const p = await service.create('Old');
    const renamed = await service.rename(p.id, 'New');
    expect(renamed).toMatchObject({ id: p.id, displayName: 'New' });
    dispose();
  });

  it('rejects renaming to another profile’s name', async () => {
    const { service, dispose } = await setup();
    await service.create('Home');
    const work = await service.create('Work');
    expect(await errorCode(service.rename(work.id, 'HOME'))).toBe('CONFLICT');
    dispose();
  });

  it('reopens the last used profile after a restart', async () => {
    const first = await setup();
    await first.service.create('A');
    const b = await first.service.create('B');
    const a = first.service.list().find((p) => p.displayName === 'A');
    await first.service.switchTo(a!.id);
    await first.service.switchTo(b.id);
    first.dispose();

    const second = await setup(first.root);
    const reopened = await second.service.openLastUsed();
    expect(reopened?.id).toBe(b.id);
    second.dispose();
  });

  it('keeps the current profile open when switching to a missing one fails', async () => {
    const { paths, service, dispose } = await setup();
    const a = await service.create('A');
    const b = await service.create('B');
    service.close();
    await service.switchTo(a.id);
    fs.rmSync(paths.profileDir(b.id), { recursive: true });
    expect(await errorCode(service.switchTo(b.id))).toBe('NOT_FOUND');
    expect(service.getActive()?.id).toBe(a.id);
    dispose();
  });

  it('returns null from openLastUsed when no profile was opened before', async () => {
    const { service, dispose } = await setup();
    expect(await service.openLastUsed()).toBeNull();
    dispose();
  });
});
