import type { Migration } from '../migrator';

/** Migrations for app.db (profile registry). Never edit an applied migration; add a new one. */
export const appMigrations: readonly Migration[] = [
  {
    version: 1,
    name: 'profile_registry',
    sql: `
      CREATE TABLE profiles (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
        name_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_opened_at TEXT,
        trashed_at TEXT
      ) STRICT;
      CREATE UNIQUE INDEX profiles_name_key_live ON profiles (name_key) WHERE trashed_at IS NULL;
      CREATE INDEX profiles_last_opened ON profiles (last_opened_at);

      CREATE TABLE app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `,
  },
];
