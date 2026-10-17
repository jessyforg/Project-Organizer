export interface ProfileSummary {
  id: string;
  displayName: string;
  createdAt: string;
  lastOpenedAt: string | null;
}

export interface TrashedProfile extends ProfileSummary {
  trashedAt: string;
}

export interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  dataDirectory: string;
}

/** What a backup file says about itself (stored inside the encrypted file). */
export interface BackupInfo {
  format: string;
  formatVersion: number;
  appVersion: string;
  schemaVersion: number;
  profileId: string;
  profileName: string;
  createdAt: string;
  counts: Record<string, number>;
  includes: string[];
  omits: string[];
}

export interface RestoreTestReport {
  manifest: BackupInfo;
  schemaVersion: number;
  counts: Record<string, number>;
}

export interface SnapshotInfo {
  name: string;
  kind: 'daily' | 'pre-migration' | 'pre-restore';
  createdAt: string;
  sizeBytes: number;
}

/** Result of a save dialog: `saved` is false when the user cancelled. */
export type SaveResult = { saved: false } | { saved: true; fileName: string };

/** A file chosen in the main process, referred to by an opaque token (never a path). */
export interface ChosenFile {
  token: string;
  fileName: string;
}
