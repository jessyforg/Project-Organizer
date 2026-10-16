import { useEffect, useState } from 'react';
import type { AppInfo } from '@shared/types';

export function AboutPanel() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.api.app.getInfo().then((result) => {
      if (result.ok) setInfo(result.data);
      else setError(result.error.message);
    });
  }, []);

  return (
    <section className="panel" aria-labelledby="about-heading">
      <h2 id="about-heading">About</h2>
      {error && <p className="error">{error}</p>}
      {info && (
        <dl className="facts">
          <dt>Version</dt>
          <dd>{info.version}</dd>
          <dt>Electron</dt>
          <dd>{info.electronVersion}</dd>
          <dt>Data folder</dt>
          <dd>
            <code>{info.dataDirectory}</code>
          </dd>
        </dl>
      )}
      <p className="muted">
        Your data is stored only on this computer and is not encrypted. Anyone who can sign in to
        your Windows account can read it.
      </p>
    </section>
  );
}
