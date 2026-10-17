import { useEffect, useState } from 'react';
import type { AppErrorInfo } from '@shared/result';
import type { ChosenFile, ProfileSummary, SnapshotInfo, TrashedProfile } from '@shared/types';
import { formatTimestamp } from '../../lib/format';
import { RestoreDialog } from '../backup/RestoreFlow';
import { ProfileNameForm } from './ProfileNameForm';

const SNAPSHOT_LABEL: Record<SnapshotInfo['kind'], string> = {
  daily: 'Daily copy',
  'pre-migration': 'Copy made before an app update',
  'pre-restore': 'Copy made before a restore',
};

/**
 * Shown when no profile is open: on first launch, after a profile was moved to the trash,
 * or when the last profile could not be opened (then it offers recovery from automatic copies).
 */
export function ProfileSetup({
  profiles,
  onChanged,
}: {
  profiles: ProfileSummary[];
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<{ profile: ProfileSummary; info: AppErrorInfo } | null>(null);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [trashed, setTrashed] = useState<TrashedProfile[]>([]);
  const [restoreFile, setRestoreFile] = useState<ChosenFile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const firstRun = profiles.length === 0 && trashed.length === 0;

  useEffect(() => {
    let cancelled = false;
    void window.api.profiles.listTrashed().then((result) => {
      if (!cancelled && result.ok) setTrashed(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [profiles]);

  const open = async (profile: ProfileSummary) => {
    setError(null);
    setSnapshots([]);
    const result = await window.api.profiles.switch({ id: profile.id });
    if (result.ok) return onChanged();
    setError({ profile, info: result.error });
    const list = await window.api.profiles.snapshots({ id: profile.id });
    if (list.ok) setSnapshots(list.data);
  };

  const recover = async (profile: ProfileSummary, snapshot: SnapshotInfo) => {
    const result = await window.api.profiles.restoreSnapshot({
      id: profile.id,
      name: snapshot.name,
    });
    if (!result.ok) return setMessage(result.error.message);
    await onChanged();
  };

  const chooseBackup = async () => {
    const result = await window.api.backup.chooseFile();
    if (!result.ok) return setMessage(result.error.message);
    if (result.data) setRestoreFile(result.data);
  };

  const restoreTrashed = async (profile: TrashedProfile) => {
    const result = await window.api.profiles.restoreTrashed({ id: profile.id });
    if (!result.ok) return setMessage(result.error.message);
    await onChanged();
  };

  return (
    <main className="setup">
      <h1>{firstRun ? 'Welcome to ProjectForge' : 'Choose a profile'}</h1>
      <p className="muted">
        {firstRun
          ? 'Create a profile to get started. Your data is stored only on this computer.'
          : 'Open a profile, create a new one, or restore one from a backup.'}
      </p>

      {profiles.length > 0 && (
        <ul className="mini-list" aria-label="Profiles">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <span style={{ flex: 1 }}>{profile.displayName}</span>
              <button type="button" className="btn" onClick={() => void open(profile)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="notice notice--error" role="alert" style={{ display: 'grid' }}>
          <p>
            “{error.profile.displayName}” could not be opened: {error.info.message} Its data file
            has not been changed or deleted.
          </p>
          {snapshots.length > 0 ? (
            <>
              <p>You can restore one of its automatic copies. The current file is kept too.</p>
              <ul className="mini-list">
                {snapshots.map((snapshot) => (
                  <li key={snapshot.name}>
                    <span style={{ flex: 1 }}>
                      {SNAPSHOT_LABEL[snapshot.kind]}, {formatTimestamp(snapshot.createdAt)}
                    </span>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void recover(error.profile, snapshot)}
                    >
                      Restore this copy
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>There are no automatic copies of this profile. Restore it from a backup instead.</p>
          )}
        </div>
      )}
      {message && (
        <p className="field__error" role="alert">
          {message}
        </p>
      )}

      <ProfileNameForm
        label="Profile name"
        submitLabel="Create profile"
        onSubmit={(displayName) => window.api.profiles.create({ displayName })}
        onDone={onChanged}
      />

      <div>
        <button type="button" className="btn" onClick={() => void chooseBackup()}>
          Restore from a backup…
        </button>
      </div>

      {trashed.length > 0 && (
        <section className="section" aria-label="Profiles in the trash">
          <h2>Profiles in the trash</h2>
          <ul className="mini-list">
            {trashed.map((profile) => (
              <li key={profile.id}>
                <span style={{ flex: 1 }}>{profile.displayName}</span>
                <button type="button" className="btn" onClick={() => void restoreTrashed(profile)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RestoreDialog
        file={restoreFile}
        canReplace={false}
        onClose={() => setRestoreFile(null)}
        onRestored={(profile) => {
          setRestoreFile(null);
          void window.api.profiles.switch({ id: profile.id }).then(() => onChanged());
        }}
      />
    </main>
  );
}
