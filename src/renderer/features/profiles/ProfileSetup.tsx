import { useState } from 'react';
import type { ProfileSummary } from '@shared/types';
import { ProfileNameForm } from './ProfileNameForm';

interface Props {
  profiles: ProfileSummary[];
  onChanged: () => Promise<void>;
}

/** Shown when no profile is open: on first launch, or if the last profile could not be opened. */
export function ProfileSetup({ profiles, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const firstRun = profiles.length === 0;

  const open = async (id: string) => {
    setError(null);
    const result = await window.api.profiles.switch({ id });
    if (!result.ok) return setError(result.error.message);
    await onChanged();
  };

  return (
    <main className="setup">
      <h1>{firstRun ? 'Welcome to ProjectForge' : 'Choose a profile'}</h1>
      <p className="muted">
        {firstRun
          ? 'Create a profile to get started. Your data is stored only on this computer.'
          : 'Open an existing profile or create a new one.'}
      </p>

      {!firstRun && (
        <ul className="profile-list" aria-label="Profiles">
          {profiles.map((profile) => (
            <li key={profile.id}>
              <span>{profile.displayName}</span>
              <button type="button" onClick={() => void open(profile.id)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ProfileNameForm
        label="Profile name"
        submitLabel="Create profile"
        onSubmit={(displayName) => window.api.profiles.create({ displayName })}
        onDone={onChanged}
      />
    </main>
  );
}
