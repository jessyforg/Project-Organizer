import { useId, useState, type FormEvent } from 'react';
import type { BackupInfo, ChosenFile, ProfileSummary } from '@shared/types';
import { ConfirmDialog, Dialog } from '../../components/ui';
import { formatTimestamp, plural } from '../../lib/format';

type Step =
  | { name: 'password' }
  | { name: 'ready'; info: BackupInfo; password: string }
  | { name: 'working'; message: string };

/**
 * Restoring a backup: choose file (main-process dialog) → enter password → review what the
 * backup contains → test it, restore it as a new profile, or replace the open profile.
 */
export function RestoreDialog({
  file,
  canReplace,
  onClose,
  onRestored,
}: {
  file: ChosenFile | null;
  /** Replacing is offered only when a profile is open. */
  canReplace: boolean;
  onClose: () => void;
  onRestored: (profile: ProfileSummary, how: 'new' | 'replace') => void;
}) {
  return (
    <Dialog open={file !== null} onClose={onClose} label="Restore from a backup">
      {file && (
        <RestoreSteps
          key={file.token}
          file={file}
          canReplace={canReplace}
          onClose={onClose}
          onRestored={onRestored}
        />
      )}
    </Dialog>
  );
}

function RestoreSteps({
  file,
  canReplace,
  onClose,
  onRestored,
}: {
  file: ChosenFile;
  canReplace: boolean;
  onClose: () => void;
  onRestored: (profile: ProfileSummary, how: 'new' | 'replace') => void;
}) {
  const id = useId();
  const [step, setStep] = useState<Step>({ name: 'password' });
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);

  const check = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) return setError('Enter the backup password.');
    setError(null);
    setStep({ name: 'working', message: 'Checking the backup…' });
    const result = await window.api.backup.inspect({ token: file.token, password });
    if (!result.ok) {
      setStep({ name: 'password' });
      return setError(result.error.message);
    }
    setNewName(`${result.data.profileName} (restored)`);
    setStep({ name: 'ready', info: result.data, password });
  };

  if (step.name === 'working') {
    return (
      <div className="dialog__form" aria-busy="true">
        <h2>Restore from a backup</h2>
        <p aria-live="polite">{step.message}</p>
      </div>
    );
  }

  if (step.name === 'password') {
    return (
      <form className="dialog__form" onSubmit={(e) => void check(e)} noValidate>
        <h2>Restore from a backup</h2>
        <p className="muted">File: {file.fileName}</p>
        <div className="field">
          <label htmlFor={`${id}-password`}>Backup password</label>
          <input
            id={`${id}-password`}
            className="input"
            type="password"
            autoComplete="off"
            autoFocus
            value={password}
            aria-invalid={error !== null}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary">
            Check backup
          </button>
        </div>
      </form>
    );
  }

  const { info } = step;
  const run = async (message: string, action: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    setStep({ name: 'working', message });
    await action();
  };

  const testRestore = () =>
    run('Restoring into a temporary copy and checking it…', async () => {
      const result = await window.api.backup.testRestore({
        token: file.token,
        password: step.password,
      });
      setStep(step);
      if (!result.ok) return setError(result.error.message);
      const counts = result.data.counts;
      setNotice(
        `Test restore passed: ${plural(counts['projects'] ?? 0, 'project')} and ${plural(counts['tasks'] ?? 0, 'task')} were restored and checked. Nothing was changed.`,
      );
    });

  const restoreAsNew = () =>
    run('Restoring as a new profile…', async () => {
      const result = await window.api.backup.restoreAsNew({
        token: file.token,
        password: step.password,
        displayName: newName,
      });
      if (!result.ok) {
        setStep(step);
        return setError(result.error.message);
      }
      onRestored(result.data, 'new');
    });

  const replace = () =>
    run('Saving a copy of the current data and restoring…', async () => {
      setConfirmReplace(false);
      const result = await window.api.backup.replaceActive({
        token: file.token,
        password: step.password,
      });
      if (!result.ok) {
        setStep(step);
        return setError(result.error.message);
      }
      onRestored(result.data, 'replace');
    });

  return (
    <div className="dialog__form">
      <h2>Backup of “{info.profileName}”</h2>
      <dl className="facts">
        <div>
          <dt>Created</dt>
          <dd>{formatTimestamp(info.createdAt)}</dd>
        </div>
        <div>
          <dt>Projects</dt>
          <dd>{info.counts['projects'] ?? 0}</dd>
        </div>
        <div>
          <dt>Tasks</dt>
          <dd>{info.counts['tasks'] ?? 0}</dd>
        </div>
        <div>
          <dt>Made with version</dt>
          <dd>{info.appVersion}</dd>
        </div>
      </dl>
      <div className="small muted">
        <p>Contains: {info.includes.join('; ')}.</p>
        <p>Not included: {info.omits.join('; ')}.</p>
      </div>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="field">
        <label htmlFor={`${id}-name`}>Name for the restored profile</label>
        <input
          id={`${id}-name`}
          className="input"
          value={newName}
          maxLength={100}
          onChange={(e) => setNewName(e.target.value)}
        />
      </div>
      <div className="dialog__actions" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn" onClick={() => void testRestore()}>
          Test restore
        </button>
        {canReplace && (
          <button type="button" className="btn btn--danger" onClick={() => setConfirmReplace(true)}>
            Replace current profile
          </button>
        )}
        <button type="button" className="btn btn--primary" onClick={() => void restoreAsNew()}>
          Restore as new profile
        </button>
      </div>
      <ConfirmDialog
        open={confirmReplace}
        title="Replace the current profile’s data?"
        body="Everything in the open profile is replaced by the backup. A verified copy of the current data is saved first in the profile’s snapshots folder, so this can be undone."
        confirmLabel="Replace data"
        danger
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => void replace()}
      />
    </div>
  );
}
