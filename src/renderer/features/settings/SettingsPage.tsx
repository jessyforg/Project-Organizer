import { useState } from 'react';
import { THEMES, type Theme } from '@shared/domain';
import type { ProfileSummary } from '@shared/types';
import { useInvalidate, useQuery } from '../../app/data';
import { applyTheme } from '../../app/Shell';
import { SHORTCUTS } from '../../app/shortcuts';
import { useToast } from '../../app/toasts';
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
    <div className="page">
      <h1>Settings</h1>
      <section className="section" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">Appearance</h2>
        <div className="chips" role="radiogroup" aria-label="Theme">
          {THEMES.map((theme) => (
            <label key={theme} className="chip">
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
      <section className="section" aria-labelledby="shortcuts-heading">
        <h2 id="shortcuts-heading">Keyboard shortcuts</h2>
        <ShortcutTable />
      </section>
      <AboutPanel />
    </div>
  );
}

export function ShortcutTable() {
  return (
    <table className="small" style={{ borderCollapse: 'collapse' }}>
      <tbody>
        {SHORTCUTS.map((s) => (
          <tr key={s.keys}>
            <td style={{ padding: '4px 16px 4px 0' }}>
              {s.keys.split('+').map((k, i) => (
                <span key={k}>
                  {i > 0 && ' + '}
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
