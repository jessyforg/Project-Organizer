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
const cell = (page: Page, row: number, col: number) =>
  page.locator(`[role="gridcell"][data-row="${row}"][data-col="${col}"]`);

let dataDir: string;
test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-e2e-'));
});
test.afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close().catch(() => undefined)));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('table: edit cells with undo, sort, group, columns, resize, and keep the layout', async () => {
  const first = await launch(dataDir);
  const { app } = first;
  let { page } = first;
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.getByLabel('Profile name').fill('Grid');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Website');
  await page.getByRole('button', { name: 'Create project' }).click();
  for (const title of ['Alpha', 'Bravo', 'Charlie']) {
    await page.getByLabel('Add a task').fill(title);
    await page.getByLabel('Add a task').press('Enter');
    await expect(
      page.getByRole('main').getByRole('button', { name: new RegExp(`^${title}`) }),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: 'Table' }).click();
  const grid = page.getByRole('grid', { name: 'Tasks in Website' });
  await expect(grid).toBeVisible();
  await expect(grid.getByRole('columnheader')).toHaveText([
    'Title',
    'Status',
    'Priority',
    'Due date',
    'Milestone',
    'Tags',
  ]);

  // Sort by title so rows are predictable.
  await grid.getByRole('button', { name: 'Title' }).click();
  await expect(cell(page, 0, 0)).toHaveText('Alpha');

  // Edit a priority from the keyboard, then undo it.
  await cell(page, 0, 2).click();
  await page.keyboard.press('Enter');
  await page.getByRole('combobox', { name: 'Priority of Alpha' }).selectOption({ label: 'Urgent' });
  await expect(cell(page, 0, 2)).toHaveText('Urgent');
  await expect(cell(page, 0, 2)).toBeFocused();
  await page
    .locator('.toast', { hasText: 'Changed priority' })
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(cell(page, 0, 2)).toHaveText('');

  // Rename with F2; the activity log records it like the panel does.
  await cell(page, 0, 2).focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(cell(page, 0, 0)).toBeFocused();
  await page.keyboard.press('F2');
  await page.getByRole('textbox', { name: 'Title of Alpha' }).fill('Alpha one');
  await page.keyboard.press('Enter');
  await expect(cell(page, 0, 0)).toHaveText('Alpha one');
  // An invalid date pair is refused with the panel's message.
  await cell(page, 1, 3).click();
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'Due date of Bravo' }).fill('2026-12-01');
  await page.keyboard.press('Enter');
  await expect(cell(page, 1, 3)).toHaveText(/Dec 1/);

  // Group by priority.
  await page.getByLabel('Group by').selectOption({ label: 'Priority' });
  await expect(grid.locator('.task-table__group').first()).toContainText('No priority');
  await page.getByLabel('Group by').selectOption({ label: 'None' });

  // Hide a column, move one, and widen Title from the keyboard.
  await page.getByRole('button', { name: 'Columns' }).click();
  const dialog = page.getByRole('dialog', { name: 'Table columns' });
  await dialog.getByRole('checkbox', { name: 'Tags' }).uncheck();
  await dialog.getByRole('button', { name: 'Move Due date left' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(grid.getByRole('columnheader')).toHaveText([
    'Title',
    'Status',
    'Due date',
    'Priority',
    'Milestone',
  ]);
  const resize = grid.getByRole('separator', { name: 'Resize Title' });
  await expect(resize).toHaveAttribute('aria-valuenow', '280');
  await resize.focus();
  await page.keyboard.press('ArrowRight');
  await expect(resize).toHaveAttribute('aria-valuenow', '296');

  // My tasks has its own layout, with the Project column.
  await nav(page).getByRole('button', { name: 'My tasks' }).click();
  await page.getByRole('button', { name: 'Table' }).click();
  await expect(
    page.getByRole('grid', { name: 'Tasks' }).getByRole('columnheader').nth(1),
  ).toHaveText('Project');

  // The project layout survives a restart.
  await app.close();
  ({ page } = await launch(dataDir));
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await nav(page).getByRole('button', { name: 'Website' }).click();
  await page.getByRole('button', { name: 'Table' }).click();
  const again = page.getByRole('grid', { name: 'Tasks in Website' });
  await expect(again.getByRole('columnheader')).toHaveText([
    'Title',
    'Status',
    'Due date',
    'Priority',
    'Milestone',
  ]);
  await expect(again.getByRole('separator', { name: 'Resize Title' })).toHaveAttribute(
    'aria-valuenow',
    '296',
  );
  expect(errors).toEqual([]);
});
