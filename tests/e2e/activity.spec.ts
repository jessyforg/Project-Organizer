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

const running: ElectronApplication[] = [];

async function launch(dataDir: string) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env['PROJECTFORGE_DATA_DIR'] = dataDir;
  delete env['ELECTRON_RENDERER_URL'];
  delete env['ELECTRON_RUN_AS_NODE'];
  const app = await electron.launch({ args: ['.'], env });
  running.push(app);
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 });
  return { app, page };
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const details = (page: Page) => page.getByRole('complementary', { name: 'Task details' });
const taskButton = (page: Page, title: string) =>
  page.getByRole('main').getByRole('button', { name: new RegExp(`^${title}`) });

let dataDir: string;
test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-e2e-'));
});
test.afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close().catch(() => undefined)));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('activity: task and project tabs, merged note edits, Today, retention, restart', async () => {
  const first = await launch(dataDir);
  const { app } = first;
  let { page } = first;
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.getByLabel('Profile name').fill('History');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Website');
  await page.getByRole('button', { name: 'Create project' }).click();

  // A task's changes, in its Activity tab, newest first.
  await page.getByLabel('Add a task').fill('Draft spec');
  await page.getByLabel('Add a task').press('Enter');
  await taskButton(page, 'Draft spec').click();
  await details(page).getByLabel('Priority').selectOption({ label: 'High' });
  await details(page).getByLabel('Due date').fill('2026-12-01');
  const title = details(page).getByLabel('Title', { exact: true });
  await title.fill('Write spec');
  await title.press('Enter');
  await details(page).getByRole('tab', { name: 'Activity' }).click();
  const taskActivity = details(page).getByRole('list', { name: 'Activity of Write spec' });
  await expect(taskActivity.getByRole('listitem')).toHaveText([
    /Renamed from “Draft spec” to “Write spec”/,
    /Due date set to Dec 1/,
    /Priority set to High/,
    /Created/,
  ]);
  await details(page).getByRole('tab', { name: 'Details' }).press('Escape');

  // Many autosaves of a note are one "Edited" event.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('new note in');
  await page.keyboard.press('Enter');
  await page.getByLabel('Note title').fill('Plan');
  const body = page.getByRole('textbox', { name: 'Note text' });
  await body.click();
  for (const word of ['one ', 'two ', 'three ']) {
    await page.keyboard.type(word);
    await expect(page.getByTestId('note-save-state')).toHaveText('Saved');
  }

  // The project's Activity tab lists its own changes and its items'.
  await nav(page).getByRole('button', { name: 'Website' }).click();
  await page.getByRole('tab', { name: 'Activity' }).click();
  const projectActivity = page.getByRole('list', { name: 'Activity in Website' });
  await expect(projectActivity.getByRole('listitem').filter({ hasText: 'Edited' })).toHaveCount(1);
  await expect(projectActivity.getByRole('listitem').first()).toContainText('Plan');
  await expect(projectActivity.getByRole('listitem').last()).toContainText(
    'Project WebsiteCreated',
  );
  await page.getByRole('tab', { name: 'Work' }).click();

  // Trash and undo are recorded; Today's feed opens the task.
  await taskButton(page, 'Write spec').click();
  await details(page).getByRole('button', { name: 'Move to trash' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click();
  await page
    .locator('.toast', { hasText: 'moved to trash' })
    .getByRole('button', { name: 'Undo' })
    .click();
  await nav(page).getByRole('button', { name: 'Today' }).click();
  const recent = page.getByRole('list', { name: 'Recent activity' });
  await expect(recent.getByRole('listitem').first()).toContainText('Restored from the trash');
  await expect(recent.getByRole('listitem').nth(1)).toContainText('Moved to the trash');
  await recent.getByRole('button', { name: 'Write spec' }).first().click();
  await expect(details(page).getByLabel('Title', { exact: true })).toHaveValue('Write spec');
  await page.keyboard.press('Escape');

  // Retention is a profile setting; settings and history survive a restart.
  await nav(page).getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Keep activity for').selectOption({ label: '2 years' });
  await app.close();
  ({ page } = await launch(dataDir));
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Recent activity' }).getByRole('listitem'),
  ).toHaveCount(10);
  await nav(page).getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('Keep activity for')).toHaveValue('730');
  expect(errors).toEqual([]);
});
