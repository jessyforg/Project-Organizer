import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { afterEach } from 'vitest';
import { openDatabase, type Db } from '../../../src/main/db/connection';
import { migrate } from '../../../src/main/db/migrator';
import { profileMigrations } from '../../../src/main/db/migrations/profile';
import { localIsoDate } from '../../../src/main/domain/dates';
import { nullLogger } from '../../../src/main/platform/logger';
import {
  createProfileServices,
  type ProfileServices,
  type ServiceContext,
} from '../../../src/main/services';
import { ensureInbox } from '../../../src/main/services/projects';
import { tempDir } from '../helpers';

const open: Db[] = [];
afterEach(() => {
  for (const db of open.splice(0)) db.close();
});

/** A controllable clock: each reading advances 1 ms so timestamps stay ordered. */
export function testClock(start = '2026-03-10T09:00:00.000Z') {
  let t = Date.parse(start);
  return {
    clock: () => new Date(t++),
    advanceDays: (days: number) => {
      t += days * 86_400_000;
    },
    today: () => localIsoDate(new Date(t)),
  };
}

export type TestProfile = ProfileServices & {
  db: Db;
  ctx: ServiceContext;
  time: ReturnType<typeof testClock>;
  inboxId: string;
};

/** A migrated profile database in a temporary folder, with all services. */
export async function setupProfile(): Promise<TestProfile> {
  const db = openDatabase(path.join(tempDir(), 'profile.db'));
  open.push(db);
  const time = testClock();
  await migrate({
    db,
    migrations: profileMigrations,
    snapshotDir: path.join(tempDir(), 'snapshots'),
    clock: time.clock,
    logger: nullLogger,
  });
  const ctx: ServiceContext = { db, clock: time.clock, newId: randomUUID };
  const inboxId = ensureInbox(ctx);
  return { db, ctx, time, inboxId, ...createProfileServices(ctx) };
}

export function statusOf(p: TestProfile, projectId: string, category: string) {
  const status = p.statuses.listForProject(projectId).find((s) => s.category === category);
  if (!status) throw new Error(`No ${category} status`);
  return status;
}

export async function expectAppError(fn: () => unknown, code: string): Promise<void> {
  let caught: unknown;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  if (caught === undefined) throw new Error(`Expected ${code}, but nothing was thrown`);
  const actual = (caught as { code?: string }).code;
  if (actual !== code) {
    const detail = caught instanceof Error ? caught.message : 'a non-Error value';
    throw new Error(`Expected ${code}, got ${actual ?? detail}`);
  }
}
