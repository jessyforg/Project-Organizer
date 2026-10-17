import { useEffect } from 'react';

/** Fixed shortcuts (R23). They use Ctrl combinations that Windows and screen readers leave free. */
export const SHORTCUTS = [
  { keys: 'Ctrl+N', description: 'New task' },
  { keys: 'Ctrl+K', description: 'Search' },
  { keys: 'Ctrl+1', description: 'Go to Today' },
  { keys: 'Ctrl+2', description: 'Go to My tasks' },
  { keys: 'Ctrl+3', description: 'Go to Projects' },
  { keys: 'Ctrl+4', description: 'Go to Trash' },
  { keys: 'Ctrl+,', description: 'Open settings' },
  { keys: 'Ctrl+/', description: 'Show keyboard shortcuts' },
  { keys: 'Esc', description: 'Close task details' },
] as const;

export interface ShortcutHandlers {
  newTask: () => void;
  search: () => void;
  goTo: (index: 1 | 2 | 3 | 4) => void;
  settings: () => void;
  help: () => void;
  closeDetails: () => void;
}

export function useShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Let open dialogs handle their own keys (Escape closes them natively).
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape' && !event.ctrlKey && !event.altKey) {
        handlers.closeDetails();
        return;
      }
      if (!event.ctrlKey || event.altKey || event.metaKey) return;
      const key = event.key.toLowerCase();
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };
      if (key === 'n') run(handlers.newTask);
      else if (key === 'k') run(handlers.search);
      else if (key === ',') run(handlers.settings);
      else if (key === '/') run(handlers.help);
      else if (key === '1' || key === '2' || key === '3' || key === '4') {
        run(() => handlers.goTo(Number(key) as 1 | 2 | 3 | 4));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}
