import { useCallback, useEffect, useState } from 'react';
import type { ProfileSummary } from '@shared/types';
import { ProfileSetup } from '../features/profiles/ProfileSetup';
import { Workspace } from './Workspace';

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
      <p className="centered" aria-live="polite">
        Loading…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="centered" role="alert">
        <p>{state.message}</p>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  }
  if (state.active === null) {
    return <ProfileSetup profiles={state.profiles} onChanged={refresh} />;
  }
  return <Workspace active={state.active} profiles={state.profiles} onChanged={refresh} />;
}
