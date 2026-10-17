import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

const running: ElectronApplication[] = [];
let dataDir: string;
let dialogDir: string;

async function launch() {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env['PROJECTFORGE_DATA_DIR'] = dataDir;
  // Stands in for native file dialogs (honoured only by unpackaged builds).
  env['PROJECTFORGE_TEST_DIALOG_DIR'] = dialogDir;
  delete env['ELECTRON_RENDERER_URL'];
  delete env['ELECTRON_RUN_AS_NODE'];
  const app = await electron.launch({ args: ['.'], env });
  running.push(app);
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 });
  return { app, page };
}

test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-e2e-'));
  dialogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-dialogs-'));
});
test.afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close().catch(() => undefined)));
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(dialogDir, { recursive: true, force: true });
});

test('backup: export encrypted, test restore, restore into a new profile, JSON export', async () => {
  test.setTimeout(120_000);
  const { page } = await launch();
  await page.getByLabel('Profile name').fill('Work');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.keyboard.press('Control+n');
  await page.getByRole('dialog').getByLabel('Title').fill('Secret launch plan');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Task added.')).toBeVisible();

  // Export an encrypted backup.
  await page.keyboard.press('Control+,');
  await page.getByRole('button', { name: 'Create backup…' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Create backup' });
  await exportDialog.getByLabel('Backup password').fill('short');
  await exportDialog.getByLabel('Repeat the password').fill('short');
  await exportDialog.getByRole('button', { name: 'Choose where to save…' }).click();
  await expect(exportDialog.getByRole('alert')).toHaveText('Use at least 10 characters.');
  await exportDialog.getByLabel('Backup password').fill('a long enough passphrase');
  await exportDialog.getByLabel('Repeat the password').fill('a long enough passphrase');
  await exportDialog.getByRole('button', { name: 'Choose where to save…' }).click();
  await expect(page.getByText(/Backup saved and verified/)).toBeVisible({ timeout: 30_000 });

  const [backupName] = fs.readdirSync(dialogDir).filter((f) => f.endsWith('.pfbackup'));
  expect(backupName).toMatch(/^ProjectForge Work \d{4}-\d{2}-\d{2}\.pfbackup$/);
  const bytes = fs.readFileSync(path.join(dialogDir, backupName!));
  expect(bytes.includes(Buffer.from('Secret launch plan'))).toBe(false);

  // Restore: wrong password first, then test restore, then restore as a new profile.
  await page.getByRole('button', { name: 'Restore from a backup…' }).click();
  const restore = page.getByRole('dialog', { name: 'Restore from a backup' });
  await restore.getByLabel('Backup password').fill('not the password');
  await restore.getByRole('button', { name: 'Check backup' }).click();
  await expect(restore.getByRole('alert')).toHaveText(
    'The password is wrong or the backup file is damaged.',
    { timeout: 30_000 },
  );
  await restore.getByLabel('Backup password').fill('a long enough passphrase');
  await restore.getByRole('button', { name: 'Check backup' }).click();
  await expect(restore.getByRole('heading', { name: 'Backup of “Work”' })).toBeVisible({
    timeout: 30_000,
  });
  await restore.getByRole('button', { name: 'Test restore' }).click();
  await expect(restore.getByText(/Test restore passed/)).toBeVisible({ timeout: 30_000 });
  await restore.getByRole('button', { name: 'Restore as new profile' }).click();
  await expect(page.getByText('Restored as the profile “Work (restored)”.')).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Open profile' }).click();
  await expect(page.getByTestId('active-profile')).toHaveText('Profile: Work (restored)');
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('button', { name: 'Inbox' })
    .click();
  await expect(
    page.getByRole('main').getByRole('button', { name: /^Secret launch plan/ }),
  ).toBeVisible();

  // Unencrypted JSON export, after an explicit warning.
  await page.keyboard.press('Control+,');
  await page.getByRole('button', { name: 'Export as JSON…' }).click();
  await expect(page.getByRole('dialog')).toContainText('is not encrypted');
  await page.getByRole('dialog').getByRole('button', { name: 'Export as JSON' }).click();
  await expect(page.getByText(/Exported to ProjectForge Work \(restored\)/)).toBeVisible();
  const jsonName = fs.readdirSync(dialogDir).find((f) => f.endsWith('.json'));
  const doc = JSON.parse(fs.readFileSync(path.join(dialogDir, jsonName!), 'utf8')) as {
    format: string;
    data: { tasks: { title: string }[] };
  };
  expect(doc.format).toBe('projectforge-export');
  expect(doc.data.tasks.map((t) => t.title)).toContain('Secret launch plan');
});

test('profile trash: move the open profile to the trash and restore it', async () => {
  const { page } = await launch();
  await page.getByLabel('Profile name').fill('Temp');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.keyboard.press('Control+,');
  await page.getByRole('button', { name: 'Move this profile to trash' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click();
  await expect(page.getByRole('heading', { name: 'Profiles in the trash' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByTestId('active-profile')).toHaveText('Profile: Temp');
});
