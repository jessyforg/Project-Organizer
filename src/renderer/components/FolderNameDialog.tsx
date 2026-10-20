import { useState } from 'react';
import type { Result } from '@shared/result';
import { useInvalidate } from '../app/data';
import { Dialog } from './ui';

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
    <Dialog
      open={state !== null}
      onClose={onClose}
      label={renaming ? 'Rename folder' : 'New folder'}
    >
      {state && (
        <FolderNameForm initial={state.name} renaming={renaming} onSave={onSave} onDone={onClose} />
      )}
    </Dialog>
  );
}

function FolderNameForm({
  initial,
  renaming,
  onSave,
  onDone,
}: {
  initial: string | undefined;
  renaming: boolean;
  onSave: (name: string) => Promise<Result<unknown>>;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidate();
  return (
    <form
      className="dialog__form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError('Enter a folder name.');
        void (async () => {
          const result = await onSave(name);
          if (!result.ok) return setError(result.error.message);
          invalidate();
          onDone();
        })();
      }}
    >
      <h2>{renaming ? 'Rename folder' : 'New folder'}</h2>
      <div className="field">
        <label htmlFor="folder-name">Folder name</label>
        <input
          id="folder-name"
          className="input"
          value={name}
          maxLength={200}
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
          {renaming ? 'Rename folder' : 'Create folder'}
        </button>
      </div>
    </form>
  );
}
