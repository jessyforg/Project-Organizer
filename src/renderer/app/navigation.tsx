import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'tasks' }
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'search'; text: string }
  | { name: 'trash' }
  | { name: 'settings' };

interface NavigationValue {
  route: Route;
  navigate: (route: Route) => void;
  /** The task shown in the details panel, if any. */
  openTaskId: string | null;
  openTask: (id: string | null) => void;
}

const NavigationContext = createContext<NavigationValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>({ name: 'dashboard' });
  const [openTaskId, openTask] = useState<string | null>(null);
  const value = useMemo(
    () => ({ route, navigate: setRoute, openTaskId, openTask }),
    [route, openTaskId],
  );
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationValue {
  const value = useContext(NavigationContext);
  if (!value) throw new Error('useNavigation outside NavigationProvider');
  return value;
}
