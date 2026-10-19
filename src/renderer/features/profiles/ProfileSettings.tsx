import { useState } from 'react';
import type { ProfileSummary, TrashedProfile } from '@shared/types';
import { useQuery } from '../../app/data';
import { useToast } from '../../app/toasts';
import { ConfirmDialog } from '../../components/ui';
import { formatTimestamp } from '../../lib/format';
import { ProfileNameForm } from './ProfileNameForm';

type Confirm =
  { kind: 'trash'; profile: ProfileSummary } | { kind: 'delete'; profile: TrashedProfile } | null;

export function ProfileSettings({
  active,
  profiles,
  onChanged,
}: {
  active: ProfileSummary;
  profiles: ProfileSummary[];
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const trashed = useQuery('profiles:trashed', () => window.api.profiles.listTrashed());
  const others = profiles.filter((profile) => profile.id !== active.id);

  const run = async (promise: Promise<{ ok: boolean; error?: { message: string } }>) => {
    const result = await promise;
    if (!result.ok && result.error) toast({ message: result.error.message, tone: 'error' });
    trashed.reload();
    await onChanged();
  };

  const confirmAction = async () => {
    const target = confirm;
    setConfirm(null);
    if (!target) return;
    if (target.kind === 'trash') await run(window.api.profiles.trash({ id: target.profile.id }));
    else await run(window.api.profiles.deletePermanently({ id: target.profile.id }));
  };

  return (
    <section className="panel settings-card" aria-labelledby="profiles-heading">
      <div className="settings-card__intro">
        <h2 id="profiles-heading">Profiles</h2>
        <p>
          Each profile keeps its own projects, tasks, and notes in a separate file. Profiles are not
          password-protected: anyone using your Windows account can open them.
        </p>
      </div>

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
          <h3>Other profiles</h3>
          <ul className="mini-list">
            {others.map((profile) => (
              <li key={profile.id}>
                <span style={{ flex: 1 }}>{profile.displayName}</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void run(window.api.profiles.switch({ id: profile.id }))}
                >
                  Switch
                </button>
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={() => setConfirm({ kind: 'trash', profile })}
                >
                  Move to trash
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ProfileNameForm
        label="New profile"
        submitLabel="Create"
        onSubmit={(displayName) => window.api.profiles.create({ displayName })}
        onDone={onChanged}
      />

      <div className="settings-row">
        <div className="settings-row__text">
          <h3>Remove this profile</h3>
          <p>It moves to the trash below and can be restored for 30 days.</p>
        </div>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => setConfirm({ kind: 'trash', profile: active })}
        >
          Move this profile to trash
        </button>
      </div>

      {trashed.data && trashed.data.length > 0 && (
        <>
          <h3>Profiles in the trash</h3>
          <ul className="mini-list">
            {trashed.data.map((profile) => (
              <li key={profile.id}>
                <span style={{ flex: 1 }}>
                  {profile.displayName}{' '}
                  <span className="muted small">moved {formatTimestamp(profile.trashedAt)}</span>
                </span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void run(window.api.profiles.restoreTrashed({ id: profile.id }))}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="btn btn--quiet"
                  onClick={() => setConfirm({ kind: 'delete', profile })}
                >
                  Delete permanently
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === 'delete'
            ? `Delete “${confirm.profile.displayName}” permanently?`
            : `Move “${confirm?.profile.displayName ?? ''}” to the trash?`
        }
        body={
          confirm?.kind === 'delete'
            ? 'All of its projects, tasks, and automatic copies are deleted. This cannot be undone. Backups you saved elsewhere are not affected.'
            : 'You can restore it from Settings for 30 days. After that it is deleted permanently.'
        }
        confirmLabel={confirm?.kind === 'delete' ? 'Delete permanently' : 'Move to trash'}
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => void confirmAction()}
      />
    </section>
  );
}
