import { useId, useState, type FormEvent } from 'react';
import type { Result } from '@shared/result';

interface Props {
  label: string;
  submitLabel: string;
  initialValue?: string;
  onSubmit: (displayName: string) => Promise<Result<unknown>>;
  onDone: () => Promise<void>;
}

export function ProfileNameForm({
  label,
  submitLabel,
  initialValue = '',
  onSubmit,
  onDone,
}: Props) {
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await onSubmit(value);
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setValue(initialValue);
    await onDone();
  };

  return (
    <form className="inline-form" onSubmit={(event) => void handleSubmit(event)}>
      <label htmlFor={inputId}>{label}</label>
      <div className="row">
        <input
          id={inputId}
          value={value}
          maxLength={100}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
        />
        <button type="submit" disabled={busy}>
          {submitLabel}
        </button>
      </div>
      {error && (
        <p id={errorId} className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
