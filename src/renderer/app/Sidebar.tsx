import { forwardRef } from 'react';
import {
  FolderKanban,
  Inbox,
  LayoutList,
  ListChecks,
  Plus,
  Settings,
  Sun,
  Trash2,
} from 'lucide-react';
import type { ProfileSummary } from '@shared/types';
import { Swatch } from '../components/ui';
import { useLookups } from '../features/tasks/useLookups';
import { useNavigation, type Route } from './navigation';
import { useQuickAdd } from './quick-add';

const NAV: { route: Route; label: string; icon: typeof Sun }[] = [
  { route: { name: 'dashboard' }, label: 'Today', icon: Sun },
  { route: { name: 'tasks' }, label: 'My tasks', icon: ListChecks },
  { route: { name: 'projects' }, label: 'Projects', icon: FolderKanban },
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

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="wordmark">ProjectForge</div>
      <div className="field">
        <label htmlFor="global-search" className="visually-hidden">
          Search projects and tasks
        </label>
        <input
          id="global-search"
          ref={searchRef}
          className="input"
          type="search"
          placeholder="Search (Ctrl+K)"
          value={route.name === 'search' ? route.text : ''}
          onChange={(e) => navigate({ name: 'search', text: e.target.value })}
        />
      </div>
      <button type="button" className="btn btn--primary" onClick={() => quickAdd()}>
        <Plus aria-hidden /> New task
      </button>
      <div className="nav">
        {NAV.map(({ route: target, label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            className="nav__item"
            aria-current={route.name === target.name ? 'page' : undefined}
            onClick={() => navigate(target)}
          >
            <Icon aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div className="sidebar__projects" aria-label="Projects list">
        {inbox && (
          <button
            type="button"
            className="nav__item"
            aria-current={route.name === 'project' && route.id === inbox.id ? 'page' : undefined}
            onClick={() => navigate({ name: 'project', id: inbox.id })}
          >
            <Inbox aria-hidden />
            Inbox
          </button>
        )}
        {others.length > 0 && <p className="sidebar__group">Projects</p>}
        {others.map((p) => (
          <button
            key={p.id}
            type="button"
            className="nav__item"
            aria-current={route.name === 'project' && route.id === p.id ? 'page' : undefined}
            onClick={() => navigate({ name: 'project', id: p.id })}
          >
            <Swatch color={p.color} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
            {p.status === 'completed' && <span className="nav__count">Done</span>}
          </button>
        ))}
        {others.length === 0 && (
          <button
            type="button"
            className="nav__item muted"
            onClick={() => navigate({ name: 'projects' })}
          >
            <LayoutList aria-hidden />
            Create a project
          </button>
        )}
      </div>
      <div className="sidebar__footer" data-testid="active-profile">
        Profile: {profile.displayName}
      </div>
    </nav>
  );
});
