import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  FolderKanban,
  FolderPlus,
  Keyboard,
  ListChecks,
  Moon,
  NotebookPen,
  Plus,
  Settings,
  SquarePen,
  Sun,
  Trash2,
} from 'lucide-react';
import type { ProfileSettings, SwitcherItem } from '@shared/domain';
import { useCreateNote } from '../features/notes/useCreateNote';
import { ProjectDialog } from '../features/projects/ProjectDialog';
import { CommandPalette, type PaletteMode, type PaletteOption } from './CommandPalette';
import { useInvalidate } from './data';
import { useFocusMode } from './focus';
import { useNavigation, type Route } from './navigation';
import { usePaletteSources } from './palette-registry';
import { useToast } from './toasts';

/**
 * The command palette with its actions (ADR-0018): the open screen's own actions first, then
 * the ones every screen has. Also records what is opened, for the quick switcher.
 */
export function PaletteHost({
  mode,
  setMode,
  newTask,
  showShortcuts,
  theme,
}: {
  mode: PaletteMode | null;
  setMode: (mode: PaletteMode | null) => void;
  newTask: () => void;
  showShortcuts: () => void;
  theme: ProfileSettings['theme'];
}) {
  const { route, navigate, openTask } = useNavigation();
  const { setFocused } = useFocusMode();
  const [creatingProject, setCreatingProject] = useState(false);
  const createNote = useCreateNote();
  const sources = usePaletteSources();
  const invalidate = useInvalidate();
  const toast = useToast();
  useRecordOpened();

  // A chosen action runs once the palette has closed and returned focus, so a dialog it opens
  // is not stacked on the palette.
  const pending = useRef<(() => void) | null>(null);
  const choose = useCallback(
    (run: () => void) => {
      pending.current = run;
      setMode(null);
    },
    [setMode],
  );
  useEffect(() => {
    if (mode !== null || !pending.current) return;
    const run = pending.current;
    pending.current = null;
    run();
  }, [mode]);

  const setTheme = async (next: 'light' | 'dark') => {
    const result = await window.api.settings.update({ theme: next });
    if (!result.ok) toast({ message: result.error.message, tone: 'error' });
    invalidate();
  };

  const actions = (): PaletteOption[] => {
    const fromScreen = sources().flatMap((source) =>
      source.items().map((item, index): PaletteOption => ({
        key: `${source.group}:${index}`,
        label: item.label,
        group: source.group,
        ...(item.icon ? { icon: item.icon } : {}),
        ...(item.shortcut ? { shortcut: item.shortcut } : {}),
        ...(item.danger ? { danger: true } : {}),
        run: item.onSelect,
      })),
    );
    const action = (
      group: string,
      label: string,
      icon: PaletteOption['icon'],
      run: () => void,
      shortcut?: string,
    ): PaletteOption => ({
      key: `${group}:${label}`,
      label,
      group,
      ...(icon ? { icon } : {}),
      ...(shortcut ? { shortcut } : {}),
      run,
    });
    const go = (label: string, icon: PaletteOption['icon'], target: Route, shortcut?: string) =>
      action('Go to', `Go to ${label}`, icon, () => navigate(target), shortcut);
    return [
      ...fromScreen,
      action('Create', 'New task', Plus, newTask, 'Ctrl+N'),
      action('Create', 'New note', SquarePen, () => void createNote()),
      action('Create', 'New project', FolderPlus, () => setCreatingProject(true)),
      go('Today', Sun, { name: 'dashboard' }, 'Ctrl+1'),
      go('My tasks', ListChecks, { name: 'tasks' }, 'Ctrl+2'),
      go('Calendar', CalendarDays, { name: 'calendar' }),
      go('Projects', FolderKanban, { name: 'projects' }, 'Ctrl+3'),
      go('Notes', NotebookPen, { name: 'notes', noteId: null }),
      go('Trash', Trash2, { name: 'trash' }, 'Ctrl+4'),
      go('Settings', Settings, { name: 'settings' }, 'Ctrl+,'),
      isDark(theme)
        ? action('General', 'Switch to light theme', Sun, () => void setTheme('light'))
        : action('General', 'Switch to dark theme', Moon, () => void setTheme('dark')),
      action('General', 'Show keyboard shortcuts', Keyboard, showShortcuts, 'Ctrl+/'),
    ];
  };

  const openItem = (item: SwitcherItem, ctrl: boolean) => {
    if (item.kind === 'project') return navigate({ name: 'project', id: item.id });
    if (item.kind === 'task') return openTask(item.id);
    // Ctrl+Enter opens a note in focus mode; if that note is already open, it just enters it.
    if (route.name === 'notes' && route.noteId === item.id) {
      if (ctrl) setFocused(true);
      return;
    }
    navigate({ name: 'notes', noteId: item.id, ...(ctrl ? { focus: true } : {}) });
  };

  return (
    <>
      <CommandPalette
        mode={mode}
        onClose={() => setMode(null)}
        onChoose={choose}
        actions={actions}
        openItem={openItem}
        search={(text) => navigate({ name: 'search', text })}
      />
      <ProjectDialog open={creatingProject} onClose={() => setCreatingProject(false)} />
    </>
  );
}

/** The theme in use, following Windows when it is "system". */
export function isDark(theme: ProfileSettings['theme']): boolean {
  return (
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true)
  );
}

/** Records each project, note, and task opened, for the quick switcher's recent items. */
function useRecordOpened(): void {
  const { route, openTaskId } = useNavigation();
  const projectId = route.name === 'project' ? route.id : null;
  const noteId = route.name === 'notes' ? route.noteId : null;
  useEffect(() => {
    if (projectId) void window.api.switcher.recordOpened({ kind: 'project', id: projectId });
  }, [projectId]);
  useEffect(() => {
    if (noteId) void window.api.switcher.recordOpened({ kind: 'note', id: noteId });
  }, [noteId]);
  useEffect(() => {
    if (openTaskId) void window.api.switcher.recordOpened({ kind: 'task', id: openTaskId });
  }, [openTaskId]);
}
