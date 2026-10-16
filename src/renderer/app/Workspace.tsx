import type { ProfileSummary } from '@shared/types';
import { AboutPanel } from '../features/settings/AboutPanel';
import { ProfileSettings } from '../features/profiles/ProfileSettings';

interface Props {
  active: ProfileSummary;
  profiles: ProfileSummary[];
  onChanged: () => Promise<void>;
}

export function Workspace({ active, profiles, onChanged }: Props) {
  return (
    <div className="workspace">
      <header className="topbar">
        <span className="brand">ProjectForge</span>
        <span className="muted" data-testid="active-profile">
          Profile: {active.displayName}
        </span>
      </header>
      <main className="content">
        <h1>Settings</h1>
        <p className="muted">
          Projects and tasks are not available yet. They are added in the next development phase.
        </p>
        <ProfileSettings active={active} profiles={profiles} onChanged={onChanged} />
        <AboutPanel />
      </main>
    </div>
  );
}
