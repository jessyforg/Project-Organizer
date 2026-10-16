import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../errors';
import type { Logger } from '../platform/logger';
import { makeStandalone, openDatabase, type Db } from './connection';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export interface MigrateOptions {
  db: Db;
  migrations: readonly Migration[];
  snapshotDir: string;
  clock: () => Date;
  logger: Logger;
}

export interface MigrateResult {
  fromVersion: number;
  toVersion: number;
  snapshotPath: string | null;
}

interface AppliedRow {
  version: number;
  checksum: string;
}

export function checksumOf(migration: Migration): string {
  return createHash('sha256').update(migration.sql).digest('hex');
}

function assertWellFormed(migrations: readonly Migration[]): void {
  migrations.forEach((m, index) => {
    if (m.version !== index + 1) {
      throw new Error(
        `Migrations must be numbered 1..n without gaps; found ${m.version} at ${index}`,
      );
    }
  });
}

async function createVerifiedSnapshot(db: Db, file: string): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await db.backup(file);
  makeStandalone(file);
  // openDatabase runs integrity and foreign-key checks; it throws if the copy is unusable.
  openDatabase(file, { readonly: true }).close();
}

/**
 * Applies pending forward-only migrations (ADR-0005).
 * - Refuses databases written by a newer app version.
 * - Rejects edited migrations (checksum mismatch).
 * - Takes a verified snapshot before touching a database that already has data.
 * - Applies all pending migrations in one transaction, so failure leaves the database unchanged.
 */
export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
  const { db, migrations, snapshotDir, clock, logger } = options;
  assertWellFormed(migrations);
  const latest = migrations.length;

  const userVersion = db.pragma('user_version', { simple: true }) as number;
  if (userVersion > latest) {
    throw new AppError(
      'DB_NEWER_VERSION',
      'This data was created by a newer version of the app. Please update the app to open it.',
      { details: { databaseVersion: userVersion, supportedVersion: latest } },
    );
  }

  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`);

  const applied = db
    .prepare('SELECT version, checksum FROM schema_migrations ORDER BY version')
    .all() as AppliedRow[];
  for (const row of applied) {
    const known = migrations[row.version - 1];
    if (known === undefined) {
      throw new AppError(
        'DB_NEWER_VERSION',
        'This data was created by a newer version of the app.',
      );
    }
    if (checksumOf(known) !== row.checksum) {
      throw new AppError('MIGRATION_FAILED', 'An applied database migration has been modified.', {
        details: { version: row.version },
      });
    }
  }

  const fromVersion = applied.length;
  const pending = migrations.slice(fromVersion);
  if (pending.length === 0) return { fromVersion, toVersion: fromVersion, snapshotPath: null };

  let snapshotPath: string | null = null;
  if (fromVersion > 0) {
    const stamp = clock().toISOString().replace(/[:.]/g, '-');
    snapshotPath = path.join(
      snapshotDir,
      `pre-migration-v${fromVersion}-to-v${latest}-${stamp}.db`,
    );
    try {
      await createVerifiedSnapshot(db, snapshotPath);
    } catch (error) {
      throw new AppError(
        'MIGRATION_FAILED',
        'Could not create a safety snapshot before upgrading.',
        {
          cause: error,
        },
      );
    }
  }

  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
  );
  const applyAll = db.transaction(() => {
    for (const m of pending) {
      db.exec(m.sql);
      insert.run(m.version, m.name, checksumOf(m), clock().toISOString());
    }
    const violations = db.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) throw new Error('Migration left broken references');
    db.pragma(`user_version = ${latest}`);
  });

  try {
    applyAll();
  } catch (error) {
    logger.error('migration.failed', error, { fromVersion, toVersion: latest });
    throw new AppError(
      'MIGRATION_FAILED',
      'The database upgrade failed. Your data was not changed.',
      {
        cause: error,
        details: { snapshotCreated: snapshotPath !== null },
      },
    );
  }

  logger.info('migration.applied', { fromVersion, toVersion: latest });
  return { fromVersion, toVersion: latest, snapshotPath };
}
