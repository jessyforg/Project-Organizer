import { useEffect, useRef, type ReactNode } from 'react';
import type { ColorToken, Priority, Progress } from '@shared/domain';
import type { AppErrorInfo } from '@shared/result';
import { describeProgress, percent, PRIORITY_LABEL } from '../lib/format';

export function PriorityLabel({ priority }: { priority: Priority | null }) {
  if (priority === null) return null;
  return (
    <span className={`priority priority--${priority}`}>
      <span className="priority__pip" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </span>
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function Swatch({ color }: { color: ColorToken | null }) {
  return (
    <span
      className="swatch"
      aria-hidden="true"
      style={{ ['--swatch' as string]: color ? `var(--c-${color})` : undefined }}
    />
  );
}

export function ProgressMeter({ progress, label }: { progress: Progress; label?: string }) {
  const value = progress.ratio === null ? 0 : Math.round(progress.ratio * 100);
  return (
    <div className="meter">
      <div
        className="meter__track"
        role="progressbar"
        aria-label={label ?? 'Progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.ratio === null ? undefined : value}
        aria-valuetext={describeProgress(progress)}
      >
        <div className="meter__fill" style={{ width: `${value}%` }} />
      </div>
      <span className="meter__text">
        {describeProgress(progress)}
        {progress.ratio !== null && ` (${percent(progress)})`}
      </span>
    </div>
  );
}

export function ErrorNotice({ error, onRetry }: { error: AppErrorInfo; onRetry?: () => void }) {
  return (
    <div className="notice notice--error" role="alert">
      <p>{error.message}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Loading() {
  return (
    <p className="muted" aria-live="polite">
      Loading…
    </p>
  );
}

/**
 * Modal dialog built on the native <dialog> element, which provides focus trapping,
 * Escape to close, and an accessible modal role.
 */
export function Dialog({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-label={label} onClose={onClose}>
      {open && children}
    </dialog>
  );
}

/** A yes/no confirmation; the confirm button states the action. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} label={title}>
      <form
        className="dialog__form"
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <h2>{title}</h2>
        <div className="dialog__body">{body}</div>
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="submit"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
