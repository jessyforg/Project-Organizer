import fs from 'node:fs';
import path from 'node:path';
import { TRASH_RETENTION_DAYS } from '@shared/domain';
import type { ProfileSummary } from '@shared/types';
import { openDatabase, type Db } from '../db/connection';
import { migrate } from '../db/migrator';
import { daysBefore } from '../domain/dates';
import { isSnapshotName, listSnapshots, type SnapshotInfo } from '../backup/snapshots';
import { profileMigrations } from '../db/migrations/profile';
import { AppError } from '../errors';
import type { Logger } from '../platform/logger';
import type { AppPaths } from '../platform/paths';
import type { ProfileRegistry } from './profile-registry';

export interface ProfileServiceDeps {
  registry: ProfileRegistry;
  paths: AppPaths;
  clock: () => Date;
  newId: () => string;
  logger: Logger;
  /** Runs after a profile database is opened and migrated; a failure aborts the open. */
  onOpened?: (db: Db, profileId: string) => void;
}

interface ActiveProfile {
  id: string;
  db: Db;
}

/**
 * Owns the profile lifecycle and the single open profile database.
 * Each profile is a separate database file, so isolation holds by construction (ADR-0004).
 */
export class ProfileService {
  private active: ActiveProfile | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: ProfileServiceDeps) {}

  list(): ProfileSummary[] {
    return this.deps.registry.list();
  }

  getActive(): ProfileSummary | null {
    return this.active ? this.deps.registry.get(this.active.id) : null;
  }

  /** The open profile database, for services added in later phases. */
  activeDb(): Db {
    if (!this.active) throw new AppError('NOT_FOUND', 'No profile is open.');
    return this.active.db;
  }

  create(displayName: string): Promise<ProfileSummary> {
    return this.exclusive(async () => {
      const { registry, paths, clock, newId, logger } = this.deps;
      if (registry.isNameTaken(displayName)) {
        throw new AppError('CONFLICT', 'A profile with this name already exists.');
      }
      const id = newId();
      const dir = paths.profileDir(id);
      fs.mkdirSync(paths.profiles, { recursive: true });
      fs.mkdirSync(dir);
      try {
        const db = openDatabase(paths.profileDb(id));
        try {
          await migrate({
            db,
            migrations: profileMigrations,
            snapshotDir: paths.profileSnapshots(id),
            clock,
            logger,
          });
        } finally {
          db.close();
        }
        registry.insert({ id, displayName, now: clock().toISOString() });
      } catch (error) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw error;
      }
      logger.info('profile.created', { profileId: id });
      return this.openProfile(id);
    });
  }

  switchTo(id: string): Promise<ProfileSummary> {
    return this.exclusive(() => this.openProfile(id));
  }

  rename(id: string, displayName: string): Promise<ProfileSummary> {
    return this.exclusive(() => {
      const { registry, clock, logger } = this.deps;
      registry.rename(id, displayName, clock().toISOString());
      logger.info('profile.renamed', { profileId: id });
      const summary = registry.get(id);
      if (!summary) throw new AppError('NOT_FOUND', 'Profile not found.');
      return Promise.resolve(summary);
    });
  }

  /** Reopens the most recently used profile. Failure is logged and leaves no profile open. */
  openLastUsed(): Promise<ProfileSummary | null> {
    return this.exclusive(async () => {
      const last = this.deps.registry.lastUsed();
      if (!last) return null;
      try {
        return await this.openProfile(last.id);
      } catch (error) {
        this.deps.logger.error('profile.reopen_failed', error, { profileId: last.id });
        return null;
      }
    });
  }

  close(): void {
    this.active?.db.close();
    this.active = null;
  }

  // ---- Profile trash (R15) ----

  listTrashed(): (ProfileSummary & { trashedAt: string })[] {
    return this.deps.registry.listTrashed();
  }

  /** Moves a profile to the trash. If it is open, it is closed first. Files are kept. */
  trash(id: string): Promise<void> {
    return this.exclusive(() => {
      if (this.active?.id === id) this.close();
      this.deps.registry.trash(id, this.deps.clock().toISOString());
      this.deps.logger.info('profile.trashed', { profileId: id });
      return Promise.resolve();
    });
  }

  /** Restores a trashed profile, renaming it if its name is now taken. */
  restoreTrashed(id: string): Promise<ProfileSummary> {
    return this.exclusive(() => {
      const { registry, clock } = this.deps;
      const trashed = registry.listTrashed().find((p) => p.id === id);
      if (!trashed) throw new AppError('NOT_FOUND', 'Profile not found in the trash.');
      registry.untrash(id, registry.uniqueName(trashed.displayName), clock().toISOString());
      return Promise.resolve(this.requireSummary(id));
    });
  }

  /** Permanently deletes a trashed profile and its files. */
  deletePermanently(id: string): Promise<void> {
    return this.exclusive(() => {
      if (!this.deps.registry.trashedIds().includes(id)) {
        throw new AppError('NOT_FOUND', 'Profile not found in the trash.');
      }
      this.removeProfileFiles(id);
      return Promise.resolve();
    });
  }

  /** Permanently deletes profiles trashed more than 30 days ago. */
  purgeTrashed(): Promise<number> {
    return this.exclusive(() => {
      const cutoff = daysBefore(this.deps.clock(), TRASH_RETENTION_DAYS);
      const ids = this.deps.registry.trashedIds(cutoff);
      for (const id of ids) this.removeProfileFiles(id);
      return Promise.resolve(ids.length);
    });
  }

  // ---- Database replacement (restore, snapshot recovery) ----

  listSnapshots(id: string): SnapshotInfo[] {
    if (!this.deps.registry.get(id)) throw new AppError('NOT_FOUND', 'Profile not found.');
    return listSnapshots(this.deps.paths.profileSnapshots(id));
  }

  /**
   * Replaces a profile's database with one of its automatic snapshots, keeping the current
   * file as `profile.db.before-snapshot-<time>` so nothing is lost. Used to recover a damaged profile.
   */
  restoreSnapshot(id: string, name: string): Promise<ProfileSummary> {
    return this.exclusive(async () => {
      const { paths, clock } = this.deps;
      if (!this.deps.registry.get(id)) throw new AppError('NOT_FOUND', 'Profile not found.');
      if (!isSnapshotName(name)) throw new AppError('VALIDATION_FAILED', 'Unknown snapshot.');
      const source = path.join(paths.profileSnapshots(id), name);
      if (!fs.existsSync(source)) throw new AppError('NOT_FOUND', 'Snapshot not found.');
      fs.mkdirSync(paths.tmp, { recursive: true });
      const staged = path.join(paths.tmp, `${this.deps.newId()}.db`);
      try {
        fs.copyFileSync(source, staged);
        openDatabase(staged, { readonly: true }).close();
        const stamp = clock().toISOString().replace(/[:.]/g, '-');
        return await this.replaceUnlocked(id, staged, `profile.db.before-snapshot-${stamp}`);
      } finally {
        fs.rmSync(staged, { force: true });
      }
    });
  }

  /** Swaps in a prepared database file for a profile; see `replaceUnlocked`. */
  replaceDatabase(id: string, stagedFile: string): Promise<ProfileSummary> {
    return this.exclusive(() => this.replaceUnlocked(id, stagedFile));
  }

  /** Registers a prepared database as a brand-new profile (used by "restore as new profile"). */
  registerRestored(stagedFile: string, displayName: string): Promise<ProfileSummary> {
    return this.exclusive(() => {
      const { registry, paths, clock, newId, logger } = this.deps;
      const id = newId();
      const dir = paths.profileDir(id);
      fs.mkdirSync(dir, { recursive: true });
      try {
        fs.renameSync(stagedFile, paths.profileDb(id));
        registry.insert({
          id,
          displayName: registry.uniqueName(displayName),
          now: clock().toISOString(),
        });
      } catch (error) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw error;
      }
      logger.info('profile.restored_as_new', { profileId: id });
      return Promise.resolve(this.requireSummary(id));
    });
  }

  /**
   * Atomic replacement with crash recovery:
   * 1. close the profile if open; 2. write a journal; 3. move the live files aside;
   * 4. move the staged file in; 5. open it (migrations and checks run);
   * 6. on success remove (or keep, if `keepOldAs`) the old file and the journal;
   *    on failure put the old file back and reopen it.
   * If the app stops mid-way, `recoverInterruptedReplace` finishes or undoes the swap on next open.
   */
  private async replaceUnlocked(
    id: string,
    stagedFile: string,
    keepOldAs?: string,
  ): Promise<ProfileSummary> {
    const { paths, logger } = this.deps;
    if (!this.deps.registry.get(id)) throw new AppError('NOT_FOUND', 'Profile not found.');
    const live = paths.profileDb(id);
    const replaced = `${live}.replaced`;
    const journal = path.join(paths.profileDir(id), 'replace.journal');
    const wasActive = this.active?.id === id;
    if (wasActive) this.close();

    fs.writeFileSync(journal, JSON.stringify({ startedAt: this.deps.clock().toISOString() }), {
      flush: true,
    });
    moveDatabaseFiles(live, replaced);
    fs.renameSync(stagedFile, live);
    try {
      const summary = await this.openProfile(id, { recover: false });
      if (keepOldAs) moveDatabaseFiles(replaced, path.join(paths.profileDir(id), keepOldAs));
      else removeDatabaseFiles(replaced);
      fs.rmSync(journal, { force: true });
      logger.info('profile.database_replaced', { profileId: id });
      return summary;
    } catch (error) {
      removeDatabaseFiles(live);
      moveDatabaseFiles(replaced, live);
      fs.rmSync(journal, { force: true });
      logger.error('profile.database_replace_failed', error, { profileId: id });
      if (wasActive) {
        await this.openProfile(id, { recover: false }).catch((reopenError: unknown) =>
          logger.error('profile.reopen_after_failed_replace', reopenError, { profileId: id }),
        );
      }
      throw error;
    }
  }

  /** Finishes or undoes a replacement interrupted by a crash (see `replaceUnlocked`). */
  private recoverInterruptedReplace(id: string): void {
    const { paths, logger } = this.deps;
    const live = paths.profileDb(id);
    const replaced = `${live}.replaced`;
    const journal = path.join(paths.profileDir(id), 'replace.journal');
    if (!fs.existsSync(journal)) return;
    if (fs.existsSync(replaced)) {
      let newFileUsable = false;
      if (fs.existsSync(live)) {
        try {
          openDatabase(live).close();
          newFileUsable = true;
        } catch {
          newFileUsable = false;
        }
      }
      if (newFileUsable) {
        removeDatabaseFiles(replaced);
      } else {
        removeDatabaseFiles(live);
        moveDatabaseFiles(replaced, live);
      }
      logger.warn('profile.replace_recovered', { profileId: id, keptNew: newFileUsable });
    }
    fs.rmSync(journal, { force: true });
  }

  private removeProfileFiles(id: string): void {
    fs.rmSync(this.deps.paths.profileDir(id), { recursive: true, force: true });
    this.deps.registry.remove(id);
    this.deps.logger.info('profile.deleted', { profileId: id });
  }

  /** Opens and migrates the target before closing the current profile, so failure keeps the current one. */
  private async openProfile(
    id: string,
    options: { recover?: boolean } = {},
  ): Promise<ProfileSummary> {
    const { registry, paths, clock, logger } = this.deps;
    if (!registry.get(id)) throw new AppError('NOT_FOUND', 'Profile not found.');
    if (this.active?.id === id) {
      registry.markOpened(id, clock().toISOString());
      return this.requireSummary(id);
    }
    // Recovery must not run while a replacement is in progress: it would treat the
    // in-progress journal as a crash and discard the original data.
    if (options.recover ?? true) this.recoverInterruptedReplace(id);
    const file = paths.profileDb(id);
    if (!fs.existsSync(file)) {
      throw new AppError('NOT_FOUND', 'The data file for this profile is missing.');
    }
    const db = openDatabase(file);
    try {
      await migrate({
        db,
        migrations: profileMigrations,
        snapshotDir: paths.profileSnapshots(id),
        clock,
        logger,
      });
      this.deps.onOpened?.(db, id);
    } catch (error) {
      db.close();
      throw error;
    }
    this.close();
    this.active = { id, db };
    registry.markOpened(id, clock().toISOString());
    logger.info('profile.opened', { profileId: id });
    return this.requireSummary(id);
  }

  private requireSummary(id: string): ProfileSummary {
    const summary = this.deps.registry.get(id);
    if (!summary) throw new AppError('NOT_FOUND', 'Profile not found.');
    return summary;
  }

  /** Serialises lifecycle operations so overlapping IPC calls cannot interleave. */
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

const SIDE_FILES = ['', '-wal', '-shm'];

function moveDatabaseFiles(from: string, to: string): void {
  for (const suffix of SIDE_FILES) {
    if (fs.existsSync(from + suffix)) fs.renameSync(from + suffix, to + suffix);
  }
}

function removeDatabaseFiles(file: string): void {
  for (const suffix of SIDE_FILES) fs.rmSync(file + suffix, { force: true });
}
