import { useId, useState, type FormEvent } from 'react';
import { Download, FileJson, Upload } from 'lucide-react';
import type { ChosenFile, ProfileSummary } from '@shared/types';
import { useInvalidate } from '../../app/data';
import { useToast } from '../../app/toasts';
import { ConfirmDialog, Dialog } from '../../components/ui';
import { RestoreDialog } from './RestoreFlow';

const MIN_PASSWORD = 10;

/** Settings section: encrypted backup, unencrypted JSON export, and restore (R19, R21). */
export function BackupPanel({ onProfilesChanged }: { onProfilesChanged: () => Promise<void> }) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [exporting, setExporting] = useState(false);
  const [confirmJson, setConfirmJson] = useState(false);
  const [restoreFile, setRestoreFile] = useState<ChosenFile | null>(null);

  const exportJson = async () => {
    setConfirmJson(false);
    const result = await window.api.export.json();
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    if (result.data.saved) toast({ message: `Exported to ${result.data.fileName}.` });
  };

  const chooseBackup = async () => {
    const result = await window.api.backup.chooseFile();
    if (!result.ok) return toast({ message: result.error.message, tone: 'error' });
    if (result.data) setRestoreFile(result.data);
  };

  const restored = async (profile: ProfileSummary, how: 'new' | 'replace') => {
    setRestoreFile(null);
    if (how === 'replace') {
      invalidate();
      toast({ message: 'Backup restored. The previous data was saved as a snapshot.' });
      return;
    }
    await onProfilesChanged();
    toast({
      message: `Restored as the profile “${profile.displayName}”.`,
      actions: [
        {
          label: 'Open profile',
          run: async () => {
            const r = await window.api.profiles.switch({ id: profile.id });
            if (!r.ok) toast({ message: r.error.message, tone: 'error' });
            await onProfilesChanged();
          },
        },
      ],
    });
  };

  return (
    <section className="section" aria-labelledby="backup-heading">
      <h2 id="backup-heading">Backup and restore</h2>
      <p className="muted small">
        Backups are encrypted with a password you choose. The app also keeps automatic daily copies
        of this profile for 7 days in its data folder.
      </p>
      <div className="page__actions">
        <button type="button" className="btn btn--primary" onClick={() => setExporting(true)}>
          <Download aria-hidden /> Create backup…
        </button>
        <button type="button" className="btn" onClick={() => void chooseBackup()}>
          <Upload aria-hidden /> Restore from a backup…
        </button>
        <button type="button" className="btn" onClick={() => setConfirmJson(true)}>
          <FileJson aria-hidden /> Export as JSON…
        </button>
      </div>
      <Dialog open={exporting} onClose={() => setExporting(false)} label="Create backup">
        <ExportForm onDone={() => setExporting(false)} />
      </Dialog>
      <ConfirmDialog
        open={confirmJson}
        title="Export unencrypted data?"
        body="The JSON file is not encrypted. Anyone who can open it can read your projects, tasks, and notes. Use “Create backup” for an encrypted copy."
        confirmLabel="Export as JSON"
        onCancel={() => setConfirmJson(false)}
        onConfirm={() => void exportJson()}
      />
      <RestoreDialog
        file={restoreFile}
        canReplace
        onClose={() => setRestoreFile(null)}
        onRestored={(profile, how) => void restored(profile, how)}
      />
    </section>
  );
}

function ExportForm({ onDone }: { onDone: () => void }) {
  const id = useId();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError('The two passwords do not match.');
    setError(null);
    setBusy(true);
    const result = await window.api.backup.export({ password });
    setBusy(false);
    if (!result.ok) return setError(result.error.message);
    if (!result.data.saved) return;
    onDone();
    toast({ message: `Backup saved and verified: ${result.data.fileName}.` });
  };

  return (
    <form className="dialog__form" onSubmit={(e) => void submit(e)} noValidate aria-busy={busy}>
      <h2>Create an encrypted backup</h2>
      <p className="muted small">
        Keep this password somewhere safe. Without it, the backup cannot be opened, and nobody can
        recover it for you.
      </p>
      <div className="field">
        <label htmlFor={`${id}-password`}>Backup password</label>
        <input
          id={`${id}-password`}
          className="input"
          type="password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="field__hint">
          At least {MIN_PASSWORD} characters. A short sentence works well.
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${id}-confirm`}>Repeat the password</label>
        <input
          id={`${id}-confirm`}
          className="input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {busy && <p aria-live="polite">Creating and verifying the backup…</p>}
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onDone} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          Choose where to save…
        </button>
      </div>
    </form>
  );
}
