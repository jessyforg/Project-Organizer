import { useState } from 'react';
import type { Result } from '@shared/result';
import { LIMITS } from '@shared/schemas';
import { useInvalidate } from '../app/data';
import { Dialog } from './ui';

/** A dialog with one name field: creating or renaming a folder, renaming a note, and so on. */
export function NameDialog({
  open,
  title,
  fieldLabel,
  submitLabel,
  initial,
  maxLength = LIMITS.name,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  fieldLabel: string;
  submitLabel: string;
  initial: string;
  maxLength?: number;
  onSave: (name: string) => Promise<Result<unknown>>;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} label={title}>
      {open && (
        <NameForm
          title={title}
          fieldLabel={fieldLabel}
          submitLabel={submitLabel}
          initial={initial}
          maxLength={maxLength}
          onSave={onSave}
          onDone={onClose}
        />
      )}
    </Dialog>
  );
}

/**
 * Names a new folder or renames one; used for project folders and note folders. `state` is
 * null while closed; with a `name`, the dialog renames.
 */
export function FolderNameDialog({
  state,
  onSave,
  onClose,
}: {
  state: { name: string | undefined } | null;
  onSave: (name: string) => Promise<Result<unknown>>;
  onClose: () => void;
}) {
  const renaming = state?.name !== undefined;
  return (
    <NameDialog
      open={state !== null}
      title={renaming ? 'Rename folder' : 'New folder'}
      fieldLabel="Folder name"
      submitLabel={renaming ? 'Rename folder' : 'Create folder'}
      initial={state?.name ?? ''}
      onSave={onSave}
      onClose={onClose}
    />
  );
}

function NameForm({
  title,
  fieldLabel,
  submitLabel,
  initial,
  maxLength,
  onSave,
  onDone,
}: {
  title: string;
  fieldLabel: string;
  submitLabel: string;
  initial: string;
  maxLength: number;
  onSave: (name: string) => Promise<Result<unknown>>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidate();
  return (
    <form
      className="dialog__form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError(`Enter a ${fieldLabel.toLowerCase()}.`);
        void (async () => {
          const result = await onSave(name);
          if (!result.ok) return setError(result.error.message);
          invalidate();
          onDone();
        })();
      }}
    >
      <h2>{title}</h2>
      <div className="field">
        <label htmlFor="name-dialog-field">{fieldLabel}</label>
        <input
          id="name-dialog-field"
          className="input"
          value={name}
          maxLength={maxLength}
          autoFocus
          aria-invalid={error !== null}
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="dialog__actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
