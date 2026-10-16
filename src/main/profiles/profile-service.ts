import fs from 'node:fs';
import type { ProfileSummary } from '@shared/types';
import { openDatabase, type Db } from '../db/connection';
import { migrate } from '../db/migrator';
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
  onOpened?: (db: Db) => void;
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

  /** Opens and migrates the target before closing the current profile, so failure keeps the current one. */
  private async openProfile(id: string): Promise<ProfileSummary> {
    const { registry, paths, clock, logger } = this.deps;
    if (!registry.get(id)) throw new AppError('NOT_FOUND', 'Profile not found.');
    if (this.active?.id === id) {
      registry.markOpened(id, clock().toISOString());
      return this.requireSummary(id);
    }
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
      this.deps.onOpened?.(db);
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
