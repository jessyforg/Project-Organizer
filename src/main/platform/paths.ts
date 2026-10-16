import path from 'node:path';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DataRootInput {
  appDataDir: string;
  productName: string;
  isPackaged: boolean;
  /** Honoured only in unpackaged builds, so tests can use a temporary directory. */
  overrideDir?: string | undefined;
}

/** Packaged: %APPDATA%\<productName>. Development: %APPDATA%\<productName>-dev. */
export function resolveDataRoot(input: DataRootInput): string {
  if (!input.isPackaged && input.overrideDir) return path.resolve(input.overrideDir);
  const folder = input.isPackaged ? input.productName : `${input.productName}-dev`;
  return path.join(input.appDataDir, folder);
}

export interface AppPaths {
  root: string;
  appDb: string;
  appSnapshots: string;
  logs: string;
  electronData: string;
  profiles: string;
  profileDir(profileId: string): string;
  profileDb(profileId: string): string;
  profileSnapshots(profileId: string): string;
}

export function createAppPaths(root: string): AppPaths {
  const profiles = path.join(root, 'profiles');
  const profileDir = (profileId: string) => {
    // IDs become directory names; reject anything that is not a UUID to prevent path traversal.
    if (!UUID_PATTERN.test(profileId)) throw new Error('Invalid profile ID');
    return path.join(profiles, profileId);
  };
  return {
    root,
    appDb: path.join(root, 'app.db'),
    appSnapshots: path.join(root, 'snapshots'),
    logs: path.join(root, 'logs'),
    electronData: path.join(root, 'electron'),
    profiles,
    profileDir,
    profileDb: (id) => path.join(profileDir(id), 'profile.db'),
    profileSnapshots: (id) => path.join(profileDir(id), 'snapshots'),
  };
}
