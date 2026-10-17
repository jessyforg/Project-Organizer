import type { ProfileSummary } from '@shared/types';
import type { Db } from '../db/connection';
import { nameKey as profileNameKey } from '../domain/text';
import { AppError, sqliteErrorCode } from '../errors';

interface ProfileRow {
  id: string;
  display_name: string;
  created_at: string;
  last_opened_at: string | null;
}

const COLUMNS = 'id, display_name, created_at, last_opened_at';

function toSummary(row: ProfileRow): ProfileSummary {
  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: row.created_at,
    lastOpenedAt: row.last_opened_at,
  };
}

function conflict(cause: unknown): AppError {
  return new AppError('CONFLICT', 'A profile with this name already exists.', { cause });
}

/** Data access for the profile registry in app.db. */
export class ProfileRegistry {
  constructor(private readonly db: Db) {}

  list(): ProfileSummary[] {
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS} FROM profiles WHERE trashed_at IS NULL
         ORDER BY last_opened_at IS NULL, last_opened_at DESC, name_key`,
      )
      .all() as ProfileRow[];
    return rows.map(toSummary);
  }

  get(id: string): ProfileSummary | null {
    const row = this.db
      .prepare(`SELECT ${COLUMNS} FROM profiles WHERE id = ? AND trashed_at IS NULL`)
      .get(id) as ProfileRow | undefined;
    return row ? toSummary(row) : null;
  }

  isNameTaken(displayName: string, exceptId?: string): boolean {
    const row = this.db
      .prepare('SELECT id FROM profiles WHERE name_key = ? AND trashed_at IS NULL AND id IS NOT ?')
      .get(profileNameKey(displayName), exceptId ?? null);
    return row !== undefined;
  }

  lastUsed(): ProfileSummary | null {
    const row = this.db
      .prepare(
        `SELECT ${COLUMNS} FROM profiles
         WHERE trashed_at IS NULL AND last_opened_at IS NOT NULL
         ORDER BY last_opened_at DESC LIMIT 1`,
      )
      .get() as ProfileRow | undefined;
    return row ? toSummary(row) : null;
  }

  insert(profile: { id: string; displayName: string; now: string }): void {
    try {
      this.db
        .prepare(
          `INSERT INTO profiles (id, display_name, name_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          profile.id,
          profile.displayName,
          profileNameKey(profile.displayName),
          profile.now,
          profile.now,
        );
    } catch (error) {
      if (sqliteErrorCode(error) === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict(error);
      throw error;
    }
  }

  rename(id: string, displayName: string, now: string): void {
    try {
      const result = this.db
        .prepare(
          `UPDATE profiles SET display_name = ?, name_key = ?, updated_at = ?
           WHERE id = ? AND trashed_at IS NULL`,
        )
        .run(displayName, profileNameKey(displayName), now, id);
      if (result.changes === 0) throw new AppError('NOT_FOUND', 'Profile not found.');
    } catch (error) {
      if (sqliteErrorCode(error) === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict(error);
      throw error;
    }
  }

  listTrashed(): (ProfileSummary & { trashedAt: string })[] {
    const rows = this.db
      .prepare(
        `SELECT ${COLUMNS}, trashed_at FROM profiles WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC`,
      )
      .all() as (ProfileRow & { trashed_at: string })[];
    return rows.map((row) => ({ ...toSummary(row), trashedAt: row.trashed_at }));
  }

  /** Trashed profile IDs, optionally only those trashed before `before`. */
  trashedIds(before?: string): string[] {
    const rows = (
      before === undefined
        ? this.db.prepare('SELECT id FROM profiles WHERE trashed_at IS NOT NULL').all()
        : this.db
            .prepare('SELECT id FROM profiles WHERE trashed_at IS NOT NULL AND trashed_at < ?')
            .all(before)
    ) as { id: string }[];
    return rows.map((r) => r.id);
  }

  trash(id: string, now: string): void {
    const result = this.db
      .prepare(
        'UPDATE profiles SET trashed_at = ?, updated_at = ? WHERE id = ? AND trashed_at IS NULL',
      )
      .run(now, now, id);
    if (result.changes === 0) throw new AppError('NOT_FOUND', 'Profile not found.');
  }

  untrash(id: string, displayName: string, now: string): void {
    try {
      const result = this.db
        .prepare(
          `UPDATE profiles SET trashed_at = NULL, display_name = ?, name_key = ?, updated_at = ?
           WHERE id = ? AND trashed_at IS NOT NULL`,
        )
        .run(displayName, profileNameKey(displayName), now, id);
      if (result.changes === 0) throw new AppError('NOT_FOUND', 'Profile not found in the trash.');
    } catch (error) {
      if (sqliteErrorCode(error) === 'SQLITE_CONSTRAINT_UNIQUE') throw conflict(error);
      throw error;
    }
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
  }

  /** `base`, or `base (2)`, `base (3)`… — the first name not used by a live profile. */
  uniqueName(base: string): string {
    if (!this.isNameTaken(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} (${n})`;
      if (!this.isNameTaken(candidate)) return candidate;
    }
  }

  markOpened(id: string, now: string): void {
    this.db.prepare('UPDATE profiles SET last_opened_at = ? WHERE id = ?').run(now, id);
  }
}
