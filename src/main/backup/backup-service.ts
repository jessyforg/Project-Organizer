import fs from 'node:fs';
import path from 'node:path';
import type { ProfileSummary } from '@shared/types';
import { makeStandalone, openDatabase, type Db } from '../db/connection';
import { migrate } from '../db/migrator';
import { profileMigrations } from '../db/migrations/profile';
import { AppError } from '../errors';
import type { Logger } from '../platform/logger';
import type { AppPaths } from '../platform/paths';
import type { ProfileService } from '../profiles/profile-service';
import { encryptInPlace, decryptInPlace, openEncrypted } from './cipher';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  countRows,
  INCLUDES,
  OMITS,
  readManifest,
  writeManifest,
  type BackupManifest,
} from './manifest';
import { pruneSnapshots, writeVerifiedCopy } from './snapshots';

export const MIN_PASSWORD_LENGTH = 10;

export interface BackupDeps {
  paths: AppPaths;
  profiles: ProfileService;
  clock: () => Date;
  newId: () => string;
  appVersion: string;
  logger: Logger;
  /** Free bytes on the volume holding `dir`. Injectable to simulate a full disk in tests. */
  freeBytes?: (dir: string) => number;
  /** File copy used for the final write. Injectable to simulate interrupted writes in tests. */
  copyFile?: (from: string, to: string) => void;
}

export interface RestoreTestReport {
  manifest: BackupManifest;
  /** Schema version after upgrading the restored copy to this app version. */
  schemaVersion: number;
  counts: Record<string, number>;
}

const defaultFreeBytes = (dir: string) => {
  const stats = fs.statfsSync(dir);
  return stats.bavail * stats.bsize;
};

function sizeOf(file: string): number {
  let total = 0;
  for (const suffix of ['', '-wal']) {
    if (fs.existsSync(file + suffix)) total += fs.statSync(file + suffix).size;
  }
  return total;
}

function sameCounts(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => (a[k] ?? 0) === (b[k] ?? 0));
}

/**
 * Encrypted profile backups (ADR-0006). Every operation works on copies in a private
 * staging folder; the live database and the user's backup file are never modified in place.
 */
export class BackupService {
  constructor(private readonly deps: BackupDeps) {}

  /** Writes a verified, encrypted backup of the open profile to `destination`. */
  async exportActive(password: string, destination: string): Promise<BackupManifest> {
    const { profiles, paths, clock, appVersion, logger } = this.deps;
    const active = profiles.getActive();
    if (!active) throw new AppError('NOT_FOUND', 'Open a profile before making a backup.');
    const work = this.workDir();
    const partial = `${destination}.partial`;
    try {
      this.ensureSpace(work, sizeOf(paths.profileDb(active.id)) * 2);
      const staged = path.join(work, 'backup.db');
      await profiles.activeDb().backup(staged);
      makeStandalone(staged);

      const plain = openDatabase(staged);
      let manifest: BackupManifest;
      try {
        manifest = {
          format: BACKUP_FORMAT,
          formatVersion: BACKUP_FORMAT_VERSION,
          appVersion,
          schemaVersion: plain.pragma('user_version', { simple: true }) as number,
          profileId: active.id,
          profileName: active.displayName,
          createdAt: clock().toISOString(),
          counts: countRows(plain),
          includes: INCLUDES,
          omits: OMITS,
        };
        writeManifest(plain, manifest);
      } finally {
        plain.close();
      }
      encryptInPlace(staged, password);
      this.validate(staged, password, manifest);

      this.ensureSpace(path.dirname(destination), fs.statSync(staged).size);
      (this.deps.copyFile ?? fs.copyFileSync)(staged, partial);
      // Verify the written file itself before reporting success.
      this.validate(partial, password, manifest);
      fs.renameSync(partial, destination);
      logger.info('backup.exported', { tasks: manifest.counts['tasks'] ?? 0 });
      return manifest;
    } catch (error) {
      fs.rmSync(partial, { force: true });
      throw this.translate(error);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  /** Decrypts and checks a backup without changing anything; returns its manifest. */
  inspect(file: string, password: string): BackupManifest {
    const work = this.workDir();
    try {
      const copy = this.copyIn(file, work);
      return this.validate(copy, password);
    } catch (error) {
      throw this.translate(error);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  /** Full restore into a temporary location, then discarded: proves the backup is restorable. */
  async testRestore(file: string, password: string): Promise<RestoreTestReport> {
    const work = this.workDir();
    try {
      const prepared = await this.prepare(file, password, work);
      return prepared.report;
    } catch (error) {
      throw this.translate(error);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  /** Restores a backup as a separate new profile; existing profiles are untouched. */
  async restoreAsNew(file: string, password: string, displayName: string): Promise<ProfileSummary> {
    const work = this.workDir();
    try {
      const prepared = await this.prepare(file, password, work);
      return await this.deps.profiles.registerRestored(prepared.staged, displayName);
    } catch (error) {
      throw this.translate(error);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  /**
   * Replaces the open profile's data with a backup. A verified copy of the current data is
   * saved first (`pre-restore-*.db` snapshot), and the swap itself is atomic and recoverable.
   */
  async replaceActive(file: string, password: string): Promise<ProfileSummary> {
    const { profiles, paths, clock, logger } = this.deps;
    const active = profiles.getActive();
    if (!active) throw new AppError('NOT_FOUND', 'Open the profile you want to replace first.');
    const work = this.workDir();
    try {
      const prepared = await this.prepare(file, password, work);
      const snapshotDir = paths.profileSnapshots(active.id);
      const stamp = clock().toISOString().replace(/[:.]/g, '-');
      writeVerifiedCopy(profiles.activeDb(), path.join(snapshotDir, `pre-restore-${stamp}.db`));
      pruneSnapshots(snapshotDir);
      const summary = await profiles.replaceDatabase(active.id, prepared.staged);
      logger.info('backup.restored_replace', { profileId: active.id });
      return summary;
    } catch (error) {
      throw this.translate(error);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  /** Copy → validate → strip manifest → decrypt → upgrade schema → final checks. */
  private async prepare(
    file: string,
    password: string,
    work: string,
  ): Promise<{ staged: string; report: RestoreTestReport }> {
    const copy = this.copyIn(file, work);
    const manifest = this.validate(copy, password);
    const encrypted = openEncrypted(copy, password);
    try {
      encrypted.exec('DROP TABLE backup_manifest');
    } finally {
      encrypted.close();
    }
    decryptInPlace(copy, password);

    const db = openDatabase(copy);
    let report: RestoreTestReport;
    try {
      await migrate({
        db,
        migrations: profileMigrations,
        snapshotDir: path.join(work, 'snapshots'),
        clock: this.deps.clock,
        logger: this.deps.logger,
      });
      report = {
        manifest,
        schemaVersion: db.pragma('user_version', { simple: true }) as number,
        counts: countRows(db),
      };
    } finally {
      db.close();
    }
    makeStandalone(copy);
    // A final open runs integrity and foreign-key checks on the restored, upgraded file.
    openDatabase(copy).close();
    makeStandalone(copy);
    if (
      !sameCounts(report.counts, manifest.counts) &&
      report.schemaVersion === manifest.schemaVersion
    ) {
      throw new AppError('BACKUP_INVALID', 'The restored data does not match the backup contents.');
    }
    return { staged: copy, report };
  }

  /** Opens an encrypted backup and checks everything; returns the manifest. */
  private validate(file: string, password: string, expected?: BackupManifest): BackupManifest {
    const db: Db = openEncrypted(file, password);
    try {
      if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
        throw new AppError('BACKUP_WRONG_PASSWORD_OR_DAMAGED', 'The backup file is damaged.');
      }
      const manifest = readManifest(db);
      if (!manifest) {
        throw new AppError('BACKUP_INVALID', 'This file is not a ProjectForge backup.');
      }
      if (manifest.formatVersion > BACKUP_FORMAT_VERSION) {
        throw new AppError(
          'BACKUP_INCOMPATIBLE',
          'This backup was made by a newer version of the app. Update the app to restore it.',
        );
      }
      if (manifest.schemaVersion > profileMigrations.length) {
        throw new AppError(
          'BACKUP_INCOMPATIBLE',
          'This backup contains data from a newer version of the app. Update the app to restore it.',
        );
      }
      if ((db.pragma('user_version', { simple: true }) as number) !== manifest.schemaVersion) {
        throw new AppError('BACKUP_INVALID', 'The backup contents do not match its description.');
      }
      if (!sameCounts(countRows(db), manifest.counts)) {
        throw new AppError('BACKUP_INVALID', 'The backup is incomplete: record counts differ.');
      }
      if ((db.pragma('foreign_key_check') as unknown[]).length > 0) {
        throw new AppError('BACKUP_INVALID', 'The backup contains broken references.');
      }
      if (expected && JSON.stringify(expected) !== JSON.stringify(manifest)) {
        throw new AppError('BACKUP_INVALID', 'The written backup does not match what was saved.');
      }
      return manifest;
    } finally {
      db.close();
    }
  }

  private copyIn(file: string, work: string): string {
    let size: number;
    try {
      size = fs.statSync(file).size;
    } catch (error) {
      throw new AppError('NOT_FOUND', 'The backup file could not be read.', { cause: error });
    }
    if (size === 0)
      throw new AppError('BACKUP_WRONG_PASSWORD_OR_DAMAGED', 'The backup file is empty.');
    this.ensureSpace(work, size * 3);
    const copy = path.join(work, 'restore.db');
    fs.copyFileSync(file, copy);
    return copy;
  }

  private workDir(): string {
    const dir = path.join(this.deps.paths.tmp, this.deps.newId());
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private ensureSpace(dir: string, bytes: number): void {
    const margin = 10 * 1024 * 1024;
    const free = (this.deps.freeBytes ?? defaultFreeBytes)(dir);
    if (free < bytes + margin) {
      throw new AppError(
        'NOT_ENOUGH_SPACE',
        'There is not enough free disk space. Free up some space and try again.',
      );
    }
  }

  private translate(error: unknown): unknown {
    if (error instanceof AppError) return error;
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === 'ENOSPC') {
      return new AppError(
        'NOT_ENOUGH_SPACE',
        'The disk is full. Free up some space and try again.',
        {
          cause: error,
        },
      );
    }
    if (code === 'EACCES' || code === 'EPERM' || code === 'EBUSY') {
      return new AppError(
        'IO_ERROR',
        'The file could not be written or read. Check that it is not open elsewhere.',
        {
          cause: error,
        },
      );
    }
    return error;
  }
}
