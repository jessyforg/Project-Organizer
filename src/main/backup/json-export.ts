import fs from 'node:fs';
import { z } from 'zod';
import type { Db } from '../db/connection';
import { COUNTED_TABLES } from './manifest';

export const EXPORT_FORMAT = 'projectforge-export';
export const EXPORT_FORMAT_VERSION = 1;

const rowSchema = z.record(z.string(), z.unknown());

/** The JSON export document. Rows keep their database column names so nothing is lost. */
export const exportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  appVersion: z.string(),
  schemaVersion: z.number().int().nonnegative(),
  exportedAt: z.string(),
  encrypted: z.literal(false),
  profile: z.object({ id: z.uuid(), name: z.string() }),
  includes: z.array(z.string()),
  data: z.object(Object.fromEntries(COUNTED_TABLES.map((t) => [t, z.array(rowSchema)]))),
});

export type ExportDocument = z.infer<typeof exportSchema>;

export function buildJsonExport(
  db: Db,
  profile: { id: string; name: string },
  appVersion: string,
  now: Date,
): ExportDocument {
  const data: Record<string, unknown[]> = {};
  for (const table of COUNTED_TABLES) {
    data[table] = db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  }
  return exportSchema.parse({
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    appVersion,
    schemaVersion: db.pragma('user_version', { simple: true }),
    exportedAt: now.toISOString(),
    encrypted: false,
    profile,
    includes: [
      'Projects, folders, workflow statuses, tasks, tags, dependencies, and settings',
      'Items in the trash (rows with a deleted_at value)',
    ],
    data,
  });
}

/** Writes the export next to its destination first, then renames it into place. */
export function writeJsonExport(document: ExportDocument, destination: string): void {
  const text = JSON.stringify(exportSchema.parse(document), null, 2);
  const partial = `${destination}.partial`;
  try {
    fs.writeFileSync(partial, text, { encoding: 'utf8', flush: true });
    fs.renameSync(partial, destination);
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw error;
  }
}
