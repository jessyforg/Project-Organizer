import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/db/connection';
import { migrate } from '../../../src/main/db/migrator';
import { appMigrations } from '../../../src/main/db/migrations/app';
import { profileMigrations } from '../../../src/main/db/migrations/profile';
import { nullLogger } from '../../../src/main/platform/logger';
import { createAppPaths } from '../../../src/main/platform/paths';
import { ProfileRegistry } from '../../../src/main/profiles/profile-registry';
import { ProfileService } from '../../../src/main/profiles/profile-service';
import { runProfileMaintenance } from '../../../src/main/services';
import { fakeClock, tempDir } from '../helpers';

describe('profile schema upgrade', () => {
  it('upgrades a Phase 2 (v1) profile to the current schema, keeping data and a snapshot', async () => {
    const dir = tempDir();
    const file = path.join(dir, 'profile.db');
    const snapshots = path.join(dir, 'snapshots');
    const v1 = openDatabase(file);
    await migrate({
      db: v1,
      migrations: profileMigrations.slice(0, 1),
      snapshotDir: snapshots,
      clock: fakeClock(),
      logger: nullLogger,
    });
    v1.prepare(
      "INSERT INTO settings (key, value_json, updated_at) VALUES ('theme', '\"dark\"', 'x')",
    ).run();
    v1.close();

    const db = openDatabase(file);
    const result = await migrate({
      db,
      migrations: profileMigrations,
      snapshotDir: snapshots,
      clock: fakeClock(),
      logger: nullLogger,
    });
    expect(result).toMatchObject({ fromVersion: 1, toVersion: profileMigrations.length });
    expect(fs.readdirSync(snapshots)).toHaveLength(1);
    expect(db.prepare('SELECT value_json FROM settings').get()).toEqual({ value_json: '"dark"' });
    db.close();
  });

  it('creates the Inbox when a profile is opened', async () => {
    const root = tempDir();
    const paths = createAppPaths(root);
    const appDb = openDatabase(paths.appDb);
    await migrate({
      db: appDb,
      migrations: appMigrations,
      snapshotDir: paths.appSnapshots,
      clock: fakeClock(),
      logger: nullLogger,
    });
    const clock = fakeClock();
    const service = new ProfileService({
      registry: new ProfileRegistry(appDb),
      paths,
      clock,
      newId: randomUUID,
      logger: nullLogger,
      onOpened: (db) => runProfileMaintenance({ db, clock, newId: randomUUID }, nullLogger),
    });
    await service.create('Work');
    const inbox = service.activeDb().prepare('SELECT name FROM projects WHERE is_inbox = 1').all();
    expect(inbox).toEqual([{ name: 'Inbox' }]);
    service.close();
    appDb.close();
  });
});
