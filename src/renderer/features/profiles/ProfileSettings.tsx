import { useState } from 'react';
import type { ProfileSummary } from '@shared/types';
import { ProfileNameForm } from './ProfileNameForm';

interface Props {
  active: ProfileSummary;
  profiles: ProfileSummary[];
  onChanged: () => Promise<void>;
}

export function ProfileSettings({ active, profiles, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const others = profiles.filter((profile) => profile.id !== active.id);

  const switchTo = async (id: string) => {
    setError(null);
    const result = await window.api.profiles.switch({ id });
    if (!result.ok) return setError(result.error.message);
    await onChanged();
  };

  return (
    <section className="panel" aria-labelledby="profiles-heading">
      <h2 id="profiles-heading">Profiles</h2>

      <ProfileNameForm
        key={active.id}
        label="Rename current profile"
        submitLabel="Rename"
        initialValue={active.displayName}
        onSubmit={(displayName) => window.api.profiles.rename({ id: active.id, displayName })}
        onDone={onChanged}
      />

      {others.length > 0 && (
        <>
          <h3>Switch profile</h3>
          <ul className="profile-list">
            {others.map((profile) => (
              <li key={profile.id}>
                <span>{profile.displayName}</span>
                <button type="button" onClick={() => void switchTo(profile.id)}>
                  Switch
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <ProfileNameForm
        label="New profile"
        submitLabel="Create"
        onSubmit={(displayName) => window.api.profiles.create({ displayName })}
        onDone={onChanged}
      />
    </section>
  );
}
