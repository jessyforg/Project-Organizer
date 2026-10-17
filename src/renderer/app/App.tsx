import { useCallback, useEffect, useState } from 'react';
import type { ProfileSummary } from '@shared/types';
import { ErrorNotice, Loading } from '../components/ui';
import { ProfileSetup } from '../features/profiles/ProfileSetup';
import { DataProvider } from './data';
import { NavigationProvider } from './navigation';
import { QuickAddProvider } from './quick-add';
import { applyTheme, Shell } from './Shell';
import { ToastProvider } from './toasts';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; active: ProfileSummary | null; profiles: ProfileSummary[] };

async function loadState(): Promise<State> {
  const [active, profiles] = await Promise.all([
    window.api.profiles.getActive(),
    window.api.profiles.list(),
  ]);
  if (!active.ok) return { status: 'error', message: active.error.message };
  if (!profiles.ok) return { status: 'error', message: profiles.error.message };
  return { status: 'ready', active: active.data, profiles: profiles.data };
}

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const refresh = useCallback(() => loadState().then(setState), []);

  useEffect(() => {
    let cancelled = false;
    void loadState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="setup">
        <Loading />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="setup">
        <ErrorNotice
          error={{ code: 'UNEXPECTED', message: state.message }}
          onRetry={() => void refresh()}
        />
      </div>
    );
  }

  return (
    <ToastProvider>
      {state.active === null ? (
        <ProfileGate profiles={state.profiles} onChanged={refresh} />
      ) : (
        // Remount everything when the profile changes so no data from another profile lingers.
        <DataProvider key={state.active.id}>
          <NavigationProvider>
            <QuickAddProvider>
              <Shell active={state.active} profiles={state.profiles} onProfilesChanged={refresh} />
            </QuickAddProvider>
          </NavigationProvider>
        </DataProvider>
      )}
    </ToastProvider>
  );
}

function ProfileGate(props: { profiles: ProfileSummary[]; onChanged: () => Promise<void> }) {
  useEffect(() => applyTheme('system'), []);
  return <ProfileSetup {...props} />;
}
