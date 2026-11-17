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

/** Today in the computer's local calendar, as the app counts it. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let dataDir: string;
test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-e2e-'));
});
test.afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close().catch(() => undefined)));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('milestones: progress, filter, board, dashboard, calendar, complete, trash, favourite, restart', async () => {
  const first = await launch(dataDir);
  const { app } = first;
  let { page } = first;
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.getByLabel('Profile name').fill('Plans');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Website');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByText('No milestones yet.', { exact: false })).toBeVisible();

  // Two milestones: one due today, one overdue.
  const create = async (name: string, date: string) => {
    await page.getByRole('button', { name: 'New milestone' }).click();
    const dialog = page.getByRole('dialog', { name: 'New milestone' });
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('Target date').fill(date);
    await dialog.getByRole('button', { name: 'Create milestone' }).click();
    await expect(dialog).toBeHidden();
  };
  await create('Beta', localToday());
  await create('Launch prep', '2020-01-15');
  const milestones = page.getByRole('list', { name: 'Milestones in Website' });
  await expect(milestones.getByRole('listitem')).toHaveCount(2);
  await expect(milestones.getByRole('listitem').first()).toContainText('Overdue');

  // Tasks join a milestone from their details; progress follows R13.
  const add = page.getByLabel('Add a task');
  for (const title of ['Design', 'Build', 'Loose end']) {
    await add.fill(title);
    await add.press('Enter');
    await expect(taskButton(page, title)).toBeVisible();
  }
  for (const title of ['Design', 'Build']) {
    await taskButton(page, title).click();
    await details(page).getByLabel('Milestone').selectOption({ label: 'Beta' });
    await page.keyboard.press('Escape');
  }
  await page.getByRole('checkbox', { name: 'Done: Design' }).click();
  const beta = milestones.getByRole('listitem').filter({ hasText: 'Beta' });
  await expect(beta.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

  // The milestone's name filters the task list; "No milestone" shows the rest.
  await beta.getByRole('button', { name: 'Beta', exact: true }).click();
  await expect(page.getByLabel('Milestone', { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  await expect(taskButton(page, 'Build')).toBeVisible();
  await expect(taskButton(page, 'Loose end')).toBeHidden();
  await page.getByLabel('Milestone', { exact: true }).selectOption('none');
  await expect(taskButton(page, 'Loose end')).toBeVisible();
  await expect(taskButton(page, 'Build')).toBeHidden();
  await page.getByLabel('Milestone', { exact: true }).selectOption('');

  // Board cards show their milestone.
  await page.getByRole('button', { name: 'Board' }).click();
  await expect(page.locator('.card', { hasText: 'Build' })).toContainText('Beta');
  await page.getByRole('button', { name: 'List' }).click();

  // Completing keeps the tasks as they are; reopening works.
  await beta.getByRole('button', { name: 'Actions for milestone Beta' }).click();
  await page.getByRole('menuitem', { name: 'Mark completed' }).click();
  await expect(beta).toContainText('Done');
  await expect(page.getByRole('checkbox', { name: 'Done: Build' })).not.toBeChecked();
  await beta.getByRole('button', { name: 'Actions for milestone Beta' }).click();
  await page.getByRole('menuitem', { name: 'Reopen' }).click();
  await expect(beta).not.toContainText('Done');

  // The dashboard lists the overdue one first; the calendar shows Beta on today.
  await nav(page).getByRole('button', { name: 'Today' }).click();
  const dash = page.getByRole('region', { name: 'Milestones' });
  await expect(dash.getByRole('listitem')).toHaveCount(2);
  await expect(dash.getByRole('listitem').first()).toContainText('Launch prep');
  await expect(dash.getByRole('listitem').first()).toContainText('Overdue');
  await nav(page).getByRole('button', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: /Milestone: Beta/ }).click();
  await expect(page.getByRole('heading', { name: 'Website', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Milestone', { exact: true })).not.toHaveValue('');

  // Trashing keeps the tasks; restoring brings their links back.
  await beta.getByRole('button', { name: 'Actions for milestone Beta' }).click();
  await page.getByRole('menuitem', { name: 'Move to trash' }).click();
  await expect(milestones.getByRole('listitem')).toHaveCount(1);
  await expect(taskButton(page, 'Build')).toBeVisible();
  await nav(page).getByRole('button', { name: 'Trash' }).click();
  const entry = page.getByRole('listitem').filter({ hasText: 'Beta' });
  await expect(entry).toContainText('Milestone');
  await entry.getByRole('button', { name: 'Restore' }).click();
  await nav(page).getByRole('button', { name: 'Website' }).click();
  await taskButton(page, 'Build').click();
  await expect(details(page).getByLabel('Milestone')).toHaveValue(/[0-9a-f-]{36}/);
  await page.keyboard.press('Escape');

  // A starred milestone opens its project, filtered to it, also after a restart.
  await beta.getByRole('button', { name: 'Actions for milestone Beta' }).click();
  await page.getByRole('menuitem', { name: 'Add to favourites' }).click();
  await app.close();
  ({ page } = await launch(dataDir));
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await nav(page)
    .getByRole('list', { name: 'Favourites' })
    .getByRole('button', { name: 'Beta' })
    .click();
  await expect(page.getByRole('heading', { name: 'Website', level: 1 })).toBeVisible();
  await expect(taskButton(page, 'Build')).toBeVisible();
  await expect(taskButton(page, 'Loose end')).toBeHidden();
  expect(errors).toEqual([]);
});
