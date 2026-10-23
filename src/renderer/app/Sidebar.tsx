import { forwardRef } from 'react';
import {
  CalendarDays,
  FlaskConical,
  FolderKanban,
  Hammer,
  Inbox,
  ListChecks,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Sun,
  Trash2,
} from 'lucide-react';
import type { ProfileSummary } from '@shared/types';
import { Swatch } from '../components/ui';
import { useLookups } from '../features/tasks/useLookups';
import { useNavigation, type Route } from './navigation';
import { useQuickAdd } from './quick-add';

type NavEntry = { route: Route; label: string; icon: typeof Sun };

/** Planning views first, then the places where work is organised (ADR-0011). */
const PRIMARY: NavEntry[][] = [
  [
    { route: { name: 'dashboard' }, label: 'Today', icon: Sun },
    { route: { name: 'tasks' }, label: 'My tasks', icon: ListChecks },
    { route: { name: 'calendar' }, label: 'Calendar', icon: CalendarDays },
  ],
  [
    { route: { name: 'projects' }, label: 'Projects', icon: FolderKanban },
    { route: { name: 'notes', noteId: null }, label: 'Notes', icon: NotebookPen },
  ],
];

const SECONDARY: NavEntry[] = [
  // The editor prototype is reachable only in development builds (ADR-0012).
  ...(import.meta.env.DEV
    ? [{ route: { name: 'editor-lab' }, label: 'Editor lab', icon: FlaskConical } as NavEntry]
    : []),
  { route: { name: 'trash' }, label: 'Trash', icon: Trash2 },
  { route: { name: 'settings' }, label: 'Settings', icon: Settings },
];

export const Sidebar = forwardRef<HTMLInputElement, { profile: ProfileSummary }>(function Sidebar(
  { profile },
  searchRef,
) {
  const { route, navigate } = useNavigation();
  const quickAdd = useQuickAdd();
  const { projectList } = useLookups();
  const active = projectList.filter((p) => p.archivedAt === null);
  const inbox = active.find((p) => p.isInbox);
  const others = active.filter((p) => !p.isInbox);

  const item = ({ route: target, label, icon: Icon }: NavEntry) => (
    <button
      key={label}
      type="button"
      className="nav__item"
      aria-current={route.name === target.name ? 'page' : undefined}
      onClick={() => navigate(target)}
    >
      <Icon aria-hidden />
      <span className="nav__label">{label}</span>
    </button>
  );

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          <Hammer />
        </span>
        ProjectForge
      </div>
      <div className="sidebar__search search-field">
        <label htmlFor="global-search" className="visually-hidden">
          Search projects, tasks, and notes
        </label>
        <Search aria-hidden />
        <input
          id="global-search"
          ref={searchRef}
          className="input"
          type="search"
          placeholder="Search"
          value={route.name === 'search' ? route.text : ''}
          onChange={(e) => navigate({ name: 'search', text: e.target.value })}
        />
      </div>
      <button
        type="button"
        className="btn btn--primary sidebar__new"
        title="New task (Ctrl+N)"
        onClick={() => quickAdd()}
      >
        <Plus aria-hidden /> New task
      </button>
      {PRIMARY.map((group, index) => (
        <div key={index} className="nav">
          {group.map(item)}
        </div>
      ))}
      <div className="sidebar__projects" aria-label="Projects list">
        <p className="sidebar__group">Projects</p>
        {inbox && (
          <button
            type="button"
            className="nav__item"
            aria-current={route.name === 'project' && route.id === inbox.id ? 'page' : undefined}
            onClick={() => navigate({ name: 'project', id: inbox.id })}
          >
            <Inbox aria-hidden />
            <span className="nav__label">Inbox</span>
          </button>
        )}
        {others.map((p) => (
          <button
            key={p.id}
            type="button"
            className="nav__item"
            title={p.name}
            aria-current={route.name === 'project' && route.id === p.id ? 'page' : undefined}
            onClick={() => navigate({ name: 'project', id: p.id })}
          >
            <Swatch color={p.color} />
            <span className="nav__label">{p.name}</span>
            {p.status === 'completed' && <span className="nav__count">Done</span>}
          </button>
        ))}
        {others.length === 0 && (
          <button
            type="button"
            className="nav__item"
            onClick={() => navigate({ name: 'projects' })}
          >
            <Plus aria-hidden />
            <span className="nav__label">Create a project</span>
          </button>
        )}
      </div>
      <div className="sidebar__footer">
        {SECONDARY.map(item)}
        <div className="profile-chip">
          <span className="profile-chip__avatar" aria-hidden="true">
            {profile.displayName.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <span className="nav__label" data-testid="active-profile" title={profile.displayName}>
            <span className="visually-hidden">Profile: </span>
            {profile.displayName}
          </span>
        </div>
      </div>
    </nav>
  );
});
