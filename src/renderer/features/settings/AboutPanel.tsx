import { useQuery } from '../../app/data';
import { ErrorNotice } from '../../components/ui';

export function AboutPanel() {
  const info = useQuery('app-info', () => window.api.app.getInfo());
  return (
    <section className="panel settings-card" aria-labelledby="about-heading">
      <div className="settings-card__intro">
        <h2 id="about-heading">About</h2>
        <p>ProjectForge works offline and stores your data only on this computer.</p>
      </div>
      {info.error && <ErrorNotice error={info.error} onRetry={info.reload} />}
      {info.data && (
        <dl className="facts">
          <div>
            <dt>Version</dt>
            <dd>{info.data.version}</dd>
          </div>
          <div>
            <dt>Electron</dt>
            <dd>{info.data.electronVersion}</dd>
          </div>
          <div>
            <dt>Data folder</dt>
            <dd>{info.data.dataDirectory}</dd>
          </div>
        </dl>
      )}
      <p className="muted small">
        Your data is stored only on this computer and is not encrypted. Anyone who can sign in to
        your Windows account can read it.
      </p>
    </section>
  );
}
