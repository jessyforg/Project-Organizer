import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'tasks' }
  | { name: 'projects' }
  | { name: 'project'; id: string }
  /** `focus` opens the note in focus mode (Ctrl+click on a note link, ADR-0017). */
  | { name: 'notes'; noteId: string | null; projectId?: string; focus?: boolean }
  | { name: 'calendar' }
  | { name: 'search'; text: string }
  | { name: 'trash' }
  | { name: 'settings' }
  /** Development builds only (ADR-0012). */
  | { name: 'editor-lab' };

/** Runs before the route changes; resolves false to stay (for example, unsaved changes). */
export type LeaveGuard = () => Promise<boolean>;

interface NavigationValue {
  route: Route;
  navigate: (route: Route) => void;
  /** The task shown in the details panel, if any. */
  openTaskId: string | null;
  openTask: (id: string | null) => void;
  /** Registers the current screen's leave guard; pass null to remove it. */
  setLeaveGuard: (guard: LeaveGuard | null) => void;
}

const NavigationContext = createContext<NavigationValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
  const [openTaskId, openTask] = useState<string | null>(null);
  const guard = useRef<LeaveGuard | null>(null);
  const navigate = useCallback((next: Route) => {
    const check = guard.current;
    if (!check) return setRoute(next);
    void check().then((leave) => {
      if (leave) setRoute(next);
    });
  }, []);
  const setLeaveGuard = useCallback((next: LeaveGuard | null) => {
    guard.current = next;
  }, []);
  const value = useMemo(
    () => ({ route, navigate, openTaskId, openTask, setLeaveGuard }),
    [route, navigate, openTaskId, setLeaveGuard],
  );
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationValue {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation outside NavigationProvider');
  return value;
}
