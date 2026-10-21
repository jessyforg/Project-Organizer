import { useState } from 'react';
import {
  ACCENTS,
  SURFACES,
  THEMES,
  type Accent,
  type ProfileSettings as Appearance,
  type Surface,
  type Theme,
} from '@shared/domain';
import type { ProfileSummary } from '@shared/types';
import { useInvalidate, useQuery } from '../../app/data';
import { PageHeader } from '../../components/ui';
import { applyAppearance } from '../../app/Shell';
import { SHORTCUTS } from '../../app/shortcuts';
import { useToast } from '../../app/toasts';
import { BackupPanel } from '../backup/BackupPanel';
import { ProfileSettings } from '../profiles/ProfileSettings';
import { ACCENT_PALETTES } from '@shared/palettes';
import { AboutPanel } from './AboutPanel';
import { TagsPanel } from './TagsPanel';

const THEME_LABEL: Record<Theme, string> = {
  system: 'Match Windows',
  light: 'Light',
  dark: 'Dark',
};

const ACCENT_LABEL: Record<Accent, string> = {
  blue: 'Blue',
  teal: 'Teal',
  green: 'Green',
  violet: 'Violet',
  rose: 'Rose',
  amber: 'Amber',
};

const SURFACE_LABEL: Record<Surface, string> = {
  cool: 'Cool grey',
  neutral: 'Neutral grey',
  warm: 'Warm',
};

const DEFAULTS: Appearance = { theme: 'system', accent: 'blue', surface: 'cool' };

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

  // Show a choice immediately and keep it; it is undone only if saving fails.
  const [chosen, setChosen] = useState<Partial<Appearance>>({});
  const current: Appearance = { ...DEFAULTS, ...settings.data, ...chosen };

  const choose = async (patch: Partial<Appearance>) => {
    setChosen((c) => ({ ...c, ...patch }));
    applyAppearance({ ...current, ...patch });
    const result = await window.api.settings.update(patch);
    if (!result.ok) {
      toast({ message: result.error.message, tone: 'error' });
      setChosen({});
      applyAppearance({ ...DEFAULTS, ...settings.data });
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
          <p>
            Choose light or dark, or follow Windows, and the colours of this profile. Every
            combination keeps text easy to read.
          </p>
        </div>
        <fieldset className="settings-choice">
          <legend>Theme</legend>
          <div className="segmented" role="radiogroup" aria-label="Theme">
            {THEMES.map((theme) => (
              <label key={theme}>
                <input
                  type="radio"
                  name="theme"
                  value={theme}
                  checked={current.theme === theme}
                  onChange={() => void choose({ theme })}
                />
                {THEME_LABEL[theme]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="settings-choice">
          <legend>Primary colour</legend>
          <div className="accent-choices" role="radiogroup" aria-label="Primary colour">
            {ACCENTS.map((accent) => (
              <label key={accent} className="accent-choice">
                <input
                  type="radio"
                  name="accent"
                  value={accent}
                  checked={current.accent === accent}
                  onChange={() => void choose({ accent })}
                />
                <span
                  className="accent-choice__dot"
                  aria-hidden="true"
                  style={{ background: ACCENT_PALETTES[accent].light.accent }}
                />
                {ACCENT_LABEL[accent]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="settings-choice">
          <legend>Secondary colour (background tone)</legend>
          <div className="segmented" role="radiogroup" aria-label="Secondary colour">
            {SURFACES.map((surface) => (
              <label key={surface}>
                <input
                  type="radio"
                  name="surface"
                  value={surface}
                  checked={current.surface === surface}
                  onChange={() => void choose({ surface })}
                />
                {SURFACE_LABEL[surface]}
              </label>
            ))}
          </div>
        </fieldset>
      </section>
      <TagsPanel />
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
