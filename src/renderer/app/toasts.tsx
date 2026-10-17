import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ToastInput {
  message: string;
  tone?: 'info' | 'error';
  actions?: ToastAction[];
}

interface Toast extends ToastInput {
  id: number;
}

const DISMISS_MS = 6000;

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

/** Short-lived messages in a polite live region. Toasts with actions stay until dismissed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );

  const push = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-3), { ...toast, id }]);
      if (!toast.actions?.length) setTimeout(() => dismiss(id), DISMISS_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.tone === 'error' ? ' toast--error' : ''}`}>
            <p>{toast.message}</p>
            <div className="toast__actions">
              {toast.actions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="btn btn--primary"
                  onClick={() => {
                    dismiss(toast.id);
                    void action.run();
                  }}
                >
                  {action.label}
                </button>
              ))}
              <button type="button" className="btn btn--quiet" onClick={() => dismiss(toast.id)}>
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: ToastInput) => void {
  return useContext(ToastContext);
}

/** Shows an error toast for a failed result; returns the data or undefined. */
export function useResultHandler() {
  const toast = useToast();
  return useMemo(
    () =>
      <T,>(result: { ok: true; data: T } | { ok: false; error: { message: string } }) => {
        if (result.ok) return result.data;
        toast({ message: result.error.message, tone: 'error' });
        return undefined;
      },
    [toast],
  );
}
