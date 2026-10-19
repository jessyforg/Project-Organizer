import { useState } from 'react';
import { THEMES, type Theme } from '@shared/domain';
import type { ProfileSummary } from '@shared/types';
import { useInvalidate, useQuery } from '../../app/data';
import { PageHeader } from '../../components/ui';
import { applyTheme } from '../../app/Shell';
import { SHORTCUTS } from '../../app/shortcuts';
import { useToast } from '../../app/toasts';
import { BackupPanel } from '../backup/BackupPanel';
import { ProfileSettings } from '../profiles/ProfileSettings';
import { AboutPanel } from './AboutPanel';

const THEME_LABEL: Record<Theme, string> = {
  system: 'Match Windows',
  light: 'Light',
  dark: 'Dark',
};

export function SettingsPage({
  active,
  profiles,
  onProfilesChanged,
}: {
  active: ProfileSummary;
  profiles: ProfileSummary[];
  onProfilesChanged: () => Promise<void>;
}) {
  const settings = useQuery('settings', () => window.api.settings.get());
  const invalidate = useInvalidate();
  const toast = useToast();

  // Show the choice immediately and keep it; it is cleared only if saving fails.
  const [chosen, setChosen] = useState<Theme | null>(null);
  const current = chosen ?? settings.data?.theme;

  const setTheme = async (theme: Theme) => {
    setChosen(theme);
    applyTheme(theme);
    const result = await window.api.settings.update({ theme });
    if (!result.ok) {
      toast({ message: result.error.message, tone: 'error' });
      setChosen(null);
      applyTheme(settings.data?.theme ?? 'system');
    }
    invalidate();
  };

  return (
    <div className="page page--narrow">
      <PageHeader
        title="Settings"
        description="Preferences for this profile, your profiles, and backups."
      />
      <section className="panel settings-card" aria-labelledby="appearance-heading">
        <div className="settings-card__intro">
          <h2 id="appearance-heading">Appearance</h2>
          <p>Choose a colour theme, or follow the light or dark mode set in Windows.</p>
        </div>
        <div
          className="segmented"
          role="radiogroup"
          aria-label="Theme"
          style={{ justifySelf: 'start' }}
        >
          {THEMES.map((theme) => (
            <label key={theme}>
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={current === theme}
                onChange={() => void setTheme(theme)}
              />
              {THEME_LABEL[theme]}
            </label>
          ))}
        </div>
      </section>
      <ProfileSettings active={active} profiles={profiles} onChanged={onProfilesChanged} />
      <BackupPanel onProfilesChanged={onProfilesChanged} />
      <section className="panel settings-card" aria-labelledby="shortcuts-heading">
        <div className="settings-card__intro">
          <h2 id="shortcuts-heading">Keyboard shortcuts</h2>
          <p>Press Ctrl+/ anywhere to see this list.</p>
        </div>
        <ShortcutTable />
      </section>
      <AboutPanel />
    </div>
  );
}

export function ShortcutTable() {
  return (
    <table className="shortcut-table">
      <tbody>
        {SHORTCUTS.map((s) => (
          <tr key={s.keys}>
            <td>
              {s.keys.split('+').map((k, i) => (
                <span key={k}>
                  {i > 0 && <span className="visually-hidden">+</span>}
                  <kbd>{k}</kbd>
                </span>
              ))}
            </td>
            <td>{s.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
