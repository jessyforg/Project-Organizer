import { z } from 'zod';
import type { Db } from '../db/connection';

export const BACKUP_FORMAT = 'projectforge-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_EXTENSION = 'pfbackup';

/** Tables whose row counts are recorded in the manifest and compared on restore. */
export const COUNTED_TABLES = [
  'folders',
  'projects',
  'project_statuses',
  'tasks',
  'tags',
  'task_tags',
  'project_tags',
  'task_dependencies',
  'settings',
] as const;

export const manifestSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  formatVersion: z.number().int().positive(),
  appVersion: z.string(),
  schemaVersion: z.number().int().nonnegative(),
  profileId: z.uuid(),
  profileName: z.string(),
  createdAt: z.string(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  /** What the backup contains, stated explicitly (invariant 15). */
  includes: z.array(z.string()),
  omits: z.array(z.string()),
});

export type BackupManifest = z.infer<typeof manifestSchema>;

export const INCLUDES = [
  'Projects, folders, and workflow statuses',
  'Tasks and subtasks, including items in the trash',
  'Tags and dependencies',
  'Profile settings',
];
export const OMITS = ['The profile’s automatic snapshots', 'App-wide settings outside the profile'];

export function countRows(db: Db): Record<string, number> {
  const existing = new Set(
    (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((r) => r.name),
  );
  const counts: Record<string, number> = {};
  for (const table of COUNTED_TABLES) {
    counts[table] = existing.has(table)
      ? (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
      : 0;
  }
  return counts;
}

export function writeManifest(db: Db, manifest: BackupManifest): void {
  db.exec(
    'CREATE TABLE backup_manifest (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL) STRICT',
  );
  db.prepare("INSERT INTO backup_manifest (key, value_json) VALUES ('manifest', ?)").run(
    JSON.stringify(manifest),
  );
}

/** Reads and validates the manifest; returns null if it is missing or malformed. */
export function readManifest(db: Db): BackupManifest | null {
  try {
    const row = db
      .prepare("SELECT value_json FROM backup_manifest WHERE key = 'manifest'")
      .get() as { value_json: string } | undefined;
    if (!row) return null;
    const parsed = manifestSchema.safeParse(JSON.parse(row.value_json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
