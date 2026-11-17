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

test('custom fields: define, set in panel and table, change type, trash and restore, restart', async () => {
  const first = await launch(dataDir);
  const { app } = first;
  let { page } = first;
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.getByLabel('Profile name').fill('Fields');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Website');
  await page.getByRole('button', { name: 'Create project' }).click();
  for (const title of ['Design', 'Build']) {
    await page.getByLabel('Add a task').fill(title);
    await page.getByLabel('Add a task').press('Enter');
    await expect(taskButton(page, title)).toBeVisible();
  }

  // Define two fields from the project's ⋯ menu.
  await page.getByRole('button', { name: 'More project actions' }).click();
  await page.getByRole('menuitem', { name: 'Custom fields…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Custom fields' });
  const add = async (name: string, type: string, choices?: string) => {
    await dialog.getByLabel('Name', { exact: true }).fill(name);
    await dialog.getByLabel('Type', { exact: true }).selectOption({ label: type });
    if (choices) await dialog.getByLabel('Choices, separated by commas').fill(choices);
    await dialog.getByRole('button', { name: 'Add field' }).click();
    await expect(dialog.getByLabel(`Name of field ${name}`)).toBeVisible();
  };
  await add('Estimate', 'Text');
  await add('Area', 'Single choice', 'Front end, Back end');
  await dialog.getByRole('button', { name: 'Done' }).click();

  // Values in the task panel.
  await taskButton(page, 'Design').click();
  await details(page).getByLabel('Estimate').fill('3');
  await details(page).getByLabel('Estimate').press('Enter');
  await details(page).getByLabel('Area').selectOption({ label: 'Front end' });
  await page.keyboard.press('Escape');
  await taskButton(page, 'Build').click();
  await details(page).getByLabel('Estimate').fill('about 2');
  await details(page).getByLabel('Estimate').press('Enter');
  await page.keyboard.press('Escape');

  // A type change that would lose a value is refused, naming it.
  await page.getByRole('button', { name: 'More project actions' }).click();
  await page.getByRole('menuitem', { name: 'Custom fields…' }).click();
  await dialog.getByLabel('Type of field Estimate').selectOption({ label: 'Number' });
  await expect(dialog.getByRole('alert')).toContainText('“about 2” (Build)');
  await expect(dialog.getByLabel('Type of field Estimate')).toHaveValue('text');
  await dialog.getByRole('button', { name: 'Done' }).click();

  // Fix the value from the table, then the change goes through.
  await page.getByRole('button', { name: 'Table' }).click();
  const grid = page.getByRole('grid', { name: 'Tasks in Website' });
  const headers = await grid.getByRole('columnheader').allTextContents();
  const col = headers.indexOf('Estimate');
  await grid.getByRole('button', { name: 'Title' }).click();
  await grid.locator(`[data-row="0"][data-col="${col}"]`).click();
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'Estimate of Build' }).fill('2');
  await page.keyboard.press('Enter');
  await expect(grid.locator(`[data-row="0"][data-col="${col}"]`)).toHaveText('2');
  await page.getByRole('button', { name: 'More project actions' }).click();
  await page.getByRole('menuitem', { name: 'Custom fields…' }).click();
  await dialog.getByLabel('Type of field Estimate').selectOption({ label: 'Number' });
  await expect(dialog.getByLabel('Type of field Estimate')).toHaveValue('number');
  await dialog.getByRole('button', { name: 'Done' }).click();

  // Group by the choice field.
  await page.getByLabel('Group by').selectOption({ label: 'Area' });
  await expect(grid.locator('.task-table__group')).toHaveText([/Front end/, /No area/]);
  await page.getByLabel('Group by').selectOption({ label: 'None' });

  // Trash the field after confirming; restore brings the values back.
  await page.getByRole('button', { name: 'More project actions' }).click();
  await page.getByRole('menuitem', { name: 'Custom fields…' }).click();
  await dialog.getByRole('button', { name: 'Move Area to trash' }).click();
  const confirm = page.getByRole('dialog', { name: 'Move “Area” to the trash?' });
  await expect(confirm).toContainText('1 task has a value');
  await confirm.getByRole('button', { name: 'Move to trash' }).click();
  await expect(dialog.getByLabel('Name of field Area')).toBeHidden();
  await dialog.getByRole('button', { name: 'Undo' }).click();
  await expect(dialog.getByLabel('Name of field Area')).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();

  // The panel's activity shows the change; everything is kept after a restart.
  await page.getByRole('button', { name: 'List' }).click();
  await taskButton(page, 'Design').click();
  await details(page).getByRole('tab', { name: 'Activity' }).click();
  await expect(
    details(page).getByRole('listitem').filter({ hasText: 'Area set to Front end' }),
  ).toHaveCount(1);
  await page.keyboard.press('Escape');
  await app.close();
  ({ page } = await launch(dataDir));
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await nav(page).getByRole('button', { name: 'Website' }).click();
  await taskButton(page, 'Design').click();
  await expect(details(page).getByLabel('Estimate')).toHaveValue('3');
  await expect(details(page).getByLabel('Area')).toHaveValue(/[0-9a-f-]{36}/);
  expect(errors).toEqual([]);
});
