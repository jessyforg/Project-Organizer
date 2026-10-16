export interface ProfileSummary {
  id: string;
  displayName: string;
  createdAt: string;
  lastOpenedAt: string | null;
}

export interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  dataDirectory: string;
}
