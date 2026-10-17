import fs from 'node:fs';
import path from 'node:path';
import { makeStandalone, openDatabase, type Db } from '../db/connection';
import { localIsoDate } from '../domain/dates';

export type SnapshotKind = 'daily' | 'pre-migration' | 'pre-restore';

export interface SnapshotInfo {
  name: string;
  kind: SnapshotKind;
  createdAt: string;
  sizeBytes: number;
}

/** How many snapshots of each kind are kept; older ones are deleted. */
export const SNAPSHOT_RETENTION: Record<SnapshotKind, number> = {
  daily: 7,
  'pre-migration': 5,
  'pre-restore': 5,
};

const NAME_PATTERN = /^(daily|pre-migration|pre-restore)-[0-9A-Za-z-]+\.db$/;

export function isSnapshotName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

function kindOf(name: string): SnapshotKind | null {
  if (!isSnapshotName(name)) return null;
  if (name.startsWith('daily-')) return 'daily';
  if (name.startsWith('pre-migration-')) return 'pre-migration';
  return 'pre-restore';
}

/**
 * Writes a consistent, verified, single-file copy of `db` to `file`.
 * VACUUM INTO takes the path as a bound parameter, so no path text enters SQL.
 */
export function writeVerifiedCopy(db: Db, file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const partial = `${file}.partial`;
  fs.rmSync(partial, { force: true });
  try {
    db.prepare('VACUUM INTO ?').run(partial);
    makeStandalone(partial);
    openDatabase(partial, { readonly: true }).close();
    fs.renameSync(partial, file);
  } catch (error) {
    fs.rmSync(partial, { force: true });
    throw error;
  }
}

/** Takes today's snapshot if there is none yet. Returns the file name, or null if skipped. */
export function takeDailySnapshot(db: Db, dir: string, now: Date): string | null {
  const name = `daily-${localIsoDate(now)}.db`;
  const file = path.join(dir, name);
  if (fs.existsSync(file)) return null;
  writeVerifiedCopy(db, file);
  return name;
}

export function listSnapshots(dir: string): SnapshotInfo[] {
  if (!fs.existsSync(dir)) return [];
  const result: SnapshotInfo[] = [];
  for (const name of fs.readdirSync(dir)) {
    const kind = kindOf(name);
    if (!kind) continue;
    const stat = fs.statSync(path.join(dir, name));
    result.push({ name, kind, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size });
  }
  return result.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name),
  );
}

/** Deletes snapshots beyond the retention count for each kind, oldest first. */
export function pruneSnapshots(dir: string): number {
  let removed = 0;
  const byKind = new Map<SnapshotKind, SnapshotInfo[]>();
  for (const snapshot of listSnapshots(dir)) {
    byKind.set(snapshot.kind, [...(byKind.get(snapshot.kind) ?? []), snapshot]);
  }
  for (const [kind, snapshots] of byKind) {
    for (const old of snapshots.slice(SNAPSHOT_RETENTION[kind])) {
      fs.rmSync(path.join(dir, old.name), { force: true });
      removed++;
    }
  }
  return removed;
}
