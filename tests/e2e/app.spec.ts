import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { IPC_CHANNELS } from '../../src/shared/ipc-channels';

/** Launches the built app (out/) against an isolated data directory. */
async function launch(dataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env['PROJECTFORGE_DATA_DIR'] = dataDir;
  delete env['ELECTRON_RENDERER_URL'];
  // Editors such as VS Code set this for their child processes; it would start Electron as plain Node.
  delete env['ELECTRON_RUN_AS_NODE'];
  const app = await electron.launch({ args: ['.'], env });
  running.push(app);
  const page = await app.firstWindow();
  return { app, page };
}

let dataDir: string;
const running: ElectronApplication[] = [];

test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-e2e-'));
});

test.afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close().catch(() => undefined)));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('first run: create a profile, and it persists across restart', async () => {
  let { app, page } = await launch(dataDir);
  await expect(page.getByRole('heading', { name: 'Welcome to ProjectForge' })).toBeVisible();

  await page.getByLabel('Profile name').fill('Work');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByTestId('active-profile')).toHaveText('Profile: Work');
  await app.close();

  ({ app, page } = await launch(dataDir));
  await expect(page.getByTestId('active-profile')).toHaveText('Profile: Work');
  const profileDirs = fs.readdirSync(path.join(dataDir, 'profiles'));
  expect(profileDirs).toHaveLength(1);
  expect(fs.existsSync(path.join(dataDir, 'profiles', profileDirs[0]!, 'profile.db'))).toBe(true);
  await app.close();
});

test('profiles: duplicate names are rejected; rename and switch work', async () => {
  const { app, page } = await launch(dataDir);
  await page.getByLabel('Profile name').fill('Home');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByTestId('active-profile')).toHaveText('Profile: Home');
  await page.getByRole('button', { name: 'Settings' }).click();

  await page.getByLabel('New profile').fill('home');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('A profile with this name already exists.');

  await page.getByLabel('New profile').fill('Study');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByTestId('active-profile')).toHaveText('Profile: Study');
  // Opening another profile resets the app to Today, so no data from the previous profile lingers.
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Switch' }).click();
  await expect(page.getByTestId('active-profile')).toHaveText('Profile: Home');
  await page.getByRole('button', { name: 'Settings' }).click();

  await page.getByLabel('Rename current profile').fill('Household');
  await page.getByRole('button', { name: 'Rename' }).click();
  await expect(page.getByTestId('active-profile')).toHaveText('Profile: Household');
  await app.close();
});

test('security: renderer is isolated and the bridge is narrow', async () => {
  const { app, page } = await launch(dataDir);
  await page.waitForLoadState('domcontentloaded');

  const globals = await page.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    module: typeof (window as unknown as { module?: unknown }).module,
    functions: Object.entries(window.api)
      .flatMap(([domain, actions]) =>
        Object.entries(actions as Record<string, unknown>).map(([action, fn]) =>
          typeof fn === 'function' ? `${domain}:${action}` : `${domain}:${action}(not a function)`,
        ),
      )
      .sort(),
    frozen: Object.isFrozen(window.api) && Object.values(window.api).every(Object.isFrozen),
  }));
  expect(globals).toEqual({
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    functions: [...IPC_CHANNELS].sort(),
    frozen: true,
  });

  // Data calls before any profile is open fail with a clear error instead of crashing.
  const noProfile = await page.evaluate(() => window.api.tasks.list());
  expect(noProfile).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

  const invalid = await page.evaluate(() =>
    Promise.all([
      window.api.profiles.create({ displayName: '' }),
      window.api.profiles.create({ displayName: 'x', extra: true } as never),
      window.api.profiles.switch({ id: '..\\..\\Windows' }),
    ]),
  );
  for (const result of invalid) {
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  }

  const popup = await page.evaluate(() => window.open('https://example.com') === null);
  expect(popup).toBe(true);

  await page.evaluate(() => {
    window.location.href = 'https://example.com/';
  });
  await page.waitForTimeout(500);
  expect(page.url()).toMatch(/^app:\/\/renderer\//);

  const csp = await app.evaluate(async ({ net }) => {
    const response = await net.fetch('app://renderer/index.html');
    return response.headers.get('content-security-policy');
  });
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
  await app.close();
});
