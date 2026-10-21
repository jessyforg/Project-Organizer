import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ProfileSettings } from '@shared/domain';
import type { ProfileSummary } from '@shared/types';
import { Dialog, Loading } from '../components/ui';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { NotesPage } from '../features/notes/NotesPage';
import { ProjectPage } from '../features/projects/ProjectPage';
import { ProjectsPage } from '../features/projects/ProjectsPage';
import { SearchPage } from '../features/search/SearchPage';
import { SettingsPage, ShortcutTable } from '../features/settings/SettingsPage';
import { MyTasksPage } from '../features/tasks/MyTasksPage';
import { TaskDetails } from '../features/tasks/TaskDetails';
import { TrashPage } from '../features/trash/TrashPage';
import { applyPalette } from '../theme/palettes';
import { useQuery } from './data';
import { useFocusMode } from './focus';
import { useNavigation, type Route } from './navigation';
import { useQuickAdd } from './quick-add';
import { useShortcuts } from './shortcuts';
import { Sidebar } from './Sidebar';

/** Development builds only (ADR-0012); production builds leave out the editor and its library. */
const EditorLabPage = import.meta.env.DEV
  ? lazy(async () => ({
      default: (await import('../features/editor/EditorLabPage')).EditorLabPage,
    }))
  : null;

const GO_TO: Record<1 | 2 | 3 | 4, Route> = {
  1: { name: 'dashboard' },
  2: { name: 'tasks' },
  3: { name: 'projects' },
  4: { name: 'trash' },
};

export function Shell({
  active,
  profiles,
  onProfilesChanged,
}: {
  active: ProfileSummary;
  profiles: ProfileSummary[];
  onProfilesChanged: () => Promise<void>;
}) {
  const { route, navigate, openTaskId, openTask } = useNavigation();
  const quickAdd = useQuickAdd();
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const { focused } = useFocusMode();
  useTheme();

  const handlers = useMemo(
    () => ({
      newTask: () => quickAdd(route.name === 'project' ? { projectId: route.id } : undefined),
      search: () => searchRef.current?.focus(),
      goTo: (index: 1 | 2 | 3 | 4) => navigate(GO_TO[index]),
      settings: () => navigate({ name: 'settings' }),
      help: () => setHelpOpen(true),
      closeDetails: () => openTask(null),
    }),
    [quickAdd, route, navigate, openTask],
  );
  useShortcuts(handlers);

  // Move focus to the page when the route changes, for keyboard and screen-reader users.
  const routeKey = route.name === 'project' ? `project:${route.id}` : route.name;
  useEffect(() => {
    if (route.name !== 'search') mainRef.current?.focus();
  }, [routeKey, route.name]);

  return (
    <div className={focused ? 'shell shell--focus' : 'shell'}>
      {!focused && <Sidebar ref={searchRef} profile={active} />}
      <main className="main" ref={mainRef} tabIndex={-1} style={{ outline: 'none' }}>
        {route.name === 'dashboard' && <DashboardPage />}
        {route.name === 'tasks' && <MyTasksPage />}
        {route.name === 'projects' && <ProjectsPage />}
        {route.name === 'project' && <ProjectPage projectId={route.id} />}
        {route.name === 'calendar' && <CalendarPage />}
        {route.name === 'notes' && <NotesPage noteId={route.noteId} projectId={route.projectId} />}
        {route.name === 'search' && <SearchPage text={route.text} />}
        {route.name === 'trash' && <TrashPage />}
        {EditorLabPage && route.name === 'editor-lab' && (
          <Suspense fallback={<Loading />}>
            <EditorLabPage />
          </Suspense>
        )}
        {route.name === 'settings' && (
          <SettingsPage active={active} profiles={profiles} onProfilesChanged={onProfilesChanged} />
        )}
      </main>
      {openTaskId && <TaskDetails taskId={openTaskId} />}
      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} label="Keyboard shortcuts">
        <div className="dialog__form">
          <h2>Keyboard shortcuts</h2>
          <ShortcutTable />
          <div className="dialog__actions">
            <button type="button" className="btn btn--primary" onClick={() => setHelpOpen(false)}>
              Close
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

/** Applies the profile's theme and colours, following Windows when the theme is "system". */
function useTheme(): void {
  const settings = useQuery('settings', () => window.api.settings.get());
  const theme = settings.data?.theme ?? 'system';
  const accent = settings.data?.accent ?? 'blue';
  const surface = settings.data?.surface ?? 'cool';
  useEffect(() => {
    const apply = () => applyAppearance({ theme, accent, surface });
    apply();
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', apply);
    return () => media?.removeEventListener('change', apply);
  }, [theme, accent, surface]);
}

/** The theme and colour palette together (ADR-0015). */
export function applyAppearance({ theme, accent, surface }: ProfileSettings): void {
  applyTheme(theme);
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true);
  applyPalette(accent, surface, dark ? 'dark' : 'light');
}

export function applyTheme(theme: 'system' | 'light' | 'dark'): void {
  if (theme === 'system') delete document.documentElement.dataset['theme'];
  else document.documentElement.dataset['theme'] = theme;
}
