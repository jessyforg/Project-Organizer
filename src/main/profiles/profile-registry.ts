import type { ProfileSummary } from '@shared/types';
import type { Db } from '../db/connection';
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

/**
 * Case-insensitive uniqueness key. SQLite's NOCASE only folds ASCII, so the key is
 * computed here to treat names such as "Ñora" and "ñora" as duplicates too.
 */
export function profileNameKey(displayName: string): string {
  return displayName.trim().normalize('NFC').toLowerCase();
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

  markOpened(id: string, now: string): void {
    this.db.prepare('UPDATE profiles SET last_opened_at = ? WHERE id = ?').run(now, id);
  }
}
