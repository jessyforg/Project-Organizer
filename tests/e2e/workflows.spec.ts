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
const taskButton = (page: Page, title: string) =>
  page.getByRole('main').getByRole('button', { name: new RegExp(`^${title}`) });

let dataDir: string;
test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-e2e-'));
});
test.afterEach(async () => {
  // Close any app left open by a failed step, so its files can be removed.
  await Promise.all(running.splice(0).map((app) => app.close().catch(() => undefined)));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('core workflow: projects, tasks, subtasks, filters, search, trash, archive, restart', async () => {
  let { app, page } = await launch(dataDir);
  await page.getByLabel('Profile name').fill('Work');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText('Nothing is due in the next week.')).toBeVisible();

  // Create a project.
  await nav(page).getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Website');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'Website', level: 1 })).toBeVisible();
  await expect(page.getByText('No tasks in this project yet.')).toBeVisible();

  // Add tasks inline.
  const add = page.getByLabel('Add a task');
  await add.fill('Design homepage');
  await add.press('Enter');
  await add.fill('Write copy');
  await add.press('Enter');
  await expect(taskButton(page, 'Write copy')).toBeVisible();

  // Edit details: priority and a subtask.
  await taskButton(page, 'Design homepage').click();
  const details = page.getByRole('complementary', { name: 'Task details' });
  await details.getByLabel('Priority').selectOption('high');
  await details.getByLabel('New subtask title').fill('Pick colours');
  await details.getByLabel('New subtask title').press('Enter');
  await expect(details.getByRole('button', { name: 'Pick colours' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
  await expect(taskButton(page, 'Design homepage')).toContainText('0/1 subtasks');

  // Complete a task from its checkbox; it moves to the collapsed Done group.
  // Completed tasks move to the collapsed Done group, so the checkbox leaves the list.
  await page.getByRole('checkbox', { name: 'Done: Write copy' }).click();
  await expect(page.getByRole('button', { name: /^Done 1/ })).toBeVisible();
  await expect(taskButton(page, 'Write copy')).toBeHidden();

  // Filter by priority, then clear.
  await page.getByRole('group', { name: 'Priority' }).getByRole('button', { name: 'Low' }).click();
  await expect(page.getByText('No tasks match these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(taskButton(page, 'Design homepage')).toBeVisible();

  // Global search with the keyboard shortcut.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('homepa');
  await expect(page.getByRole('heading', { name: 'Results for “homepa”' })).toBeVisible();
  await expect(taskButton(page, 'Design homepage')).toBeVisible();

  // Trash the task with its subtask, then restore the hierarchy.
  await taskButton(page, 'Design homepage').click();
  await details.getByRole('button', { name: 'Move to trash' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('Its 1 subtask will move to the trash too.');
  await confirm.getByRole('button', { name: 'Move to trash' }).click();
  await page.keyboard.press('Control+4');
  await expect(page.getByRole('heading', { name: 'Trash' })).toBeVisible();
  await expect(page.getByText('Design homepage')).toBeVisible();
  await expect(page.getByText('2 items.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('The trash is empty.')).toBeVisible();

  // Archive and unarchive the project.
  await nav(page).getByRole('button', { name: 'Website' }).click();
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByText('This project is archived.')).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'Website' })).toBeHidden();
  await page.getByRole('button', { name: 'Unarchive' }).click();
  await expect(nav(page).getByRole('button', { name: 'Website' })).toBeVisible();

  // Quick add from anywhere with Ctrl+N; the task goes to the Inbox.
  await page.keyboard.press('Control+1');
  await page.keyboard.press('Control+n');
  await page.getByRole('dialog').getByLabel('Title').fill('Call the bank');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Task added.')).toBeVisible();
  await app.close();

  // Everything persists across a restart.
  ({ app, page } = await launch(dataDir));
  await nav(page).getByRole('button', { name: 'Website' }).click();
  await expect(taskButton(page, 'Design homepage')).toContainText('0/1 subtasks');
  await nav(page).getByRole('button', { name: 'Inbox' }).click();
  await expect(taskButton(page, 'Call the bank')).toBeVisible();
  await app.close();
});

test('theme preference applies immediately and persists', async () => {
  let { app, page } = await launch(dataDir);
  await page.getByLabel('Profile name').fill('Home');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.keyboard.press('Control+,');
  await page.getByLabel('Dark').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await app.close();
  ({ app, page } = await launch(dataDir));
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await app.close();
});
