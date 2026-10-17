import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppErrorInfo, Result } from '@shared/result';

/**
 * Minimal data layer. Reads go through `useQuery`; after any successful change,
 * `invalidate()` bumps a version so every visible query reloads. IPC is local and fast,
 * so reloading is simpler and safer than hand-maintained caches.
 */
interface DataContextValue {
  version: number;
  invalidate: () => void;
}

const DataContext = createContext<DataContextValue>({ version: 0, invalidate: () => undefined });

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const invalidate = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ version, invalidate }), [version, invalidate]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useInvalidate(): () => void {
  return useContext(DataContext).invalidate;
}

export interface QueryState<T> {
  data: T | undefined;
  error: AppErrorInfo | undefined;
  loading: boolean;
  reload: () => void;
}

/** Loads data and reloads whenever `key` changes or data is invalidated. Keeps old data while reloading. */
export function useQuery<T>(key: string, load: () => Promise<Result<T>>): QueryState<T> {
  const { version } = useContext(DataContext);
  const [state, setState] = useState<{ data?: T; error?: AppErrorInfo; loading: boolean }>({
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);
  // `load` is recreated every render; `key` identifies what it loads.
  const loadRef = useLatest(load);

  useEffect(() => {
    let cancelled = false;
    void loadRef.current().then(
      (result) => {
        if (cancelled) return;
        setState(
          result.ok
            ? { data: result.data, loading: false }
            : (prev) => ({ ...prev, error: result.error, loading: false }),
        );
      },
      () => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: { code: 'UNEXPECTED', message: 'The request failed.' },
            loading: false,
          }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, version, attempt, loadRef]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}

function useLatest<T>(value: T): { readonly current: T } {
  const [ref] = useState(() => ({ current: value }));
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
