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
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });

/** Opens the palette with Ctrl+K, types after the ">", and runs the first match. */
async function run(page: Page, text: string) {
  await page.keyboard.press('Control+k');
  await expect(palette(page).getByRole('combobox')).toHaveValue('>');
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeHidden();
}

let dataDir: string;
test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-e2e-'));
});
test.afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close().catch(() => undefined)));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('palette: actions with Ctrl+K, items with Ctrl+O, recent items, archived, and focus', async () => {
  const first = await launch(dataDir);
  const { app } = first;
  let { page } = first;
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.getByLabel('Profile name').fill('Palette');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  // Create a project from the palette: the same dialog as the button.
  await run(page, 'new proj');
  await page.getByRole('dialog', { name: 'New project' }).getByLabel('Name').fill('Website');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'Website', level: 1 })).toBeVisible();

  // The project's own actions come first; Move to trash still asks first.
  await page.keyboard.press('Control+k');
  const groups = palette(page).getByRole('group');
  await expect(groups.first()).toHaveAccessibleName('Project: Website');
  await page.keyboard.type('trash');
  await expect(palette(page).getByRole('option', { name: /Move to trash/ })).toBeVisible();
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('dialog', { name: 'Move “Website” to the trash?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { name: 'Website', level: 1 })).toBeVisible();

  // A note in this project, then focus mode and back, from the palette.
  await run(page, 'new note in');
  const title = page.getByLabel('Note title');
  await expect(title).toBeVisible();
  await title.fill('Kickoff plan');
  await expect(page.getByTestId('note-save-state')).toHaveText('Saved');
  await run(page, 'focus mode');
  await expect(nav(page)).toBeHidden();
  await run(page, 'leave focus');
  await expect(nav(page)).toBeVisible();

  // A task through the usual dialog.
  await page.keyboard.press('Control+n');
  await page.getByRole('dialog', { name: 'New task' }).getByLabel('Title').fill('Kickoff call');
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText('Task added.')).toBeVisible();

  // Ctrl+O lists recently opened items, newest first.
  await page.keyboard.press('Control+o');
  const recent = palette(page).getByRole('group', { name: 'Recently opened' });
  await expect(recent.getByRole('option')).toHaveCount(2);
  await expect(recent.getByRole('option').first()).toContainText('Kickoff plan');
  await expect(recent.getByRole('option').first()).toContainText('Note · Website');
  await expect(recent.getByRole('option').nth(1)).toContainText('Project');

  // Typing finds items; Enter on a task opens its details.
  await page.keyboard.type('kickoff');
  const results = palette(page).getByRole('group', { name: 'Projects, notes, and tasks' });
  await expect(results.getByRole('option')).toHaveCount(2);
  await expect(results.getByRole('option', { name: /Kickoff call/ })).toContainText('Task · Inbox');
  await results.getByRole('option', { name: /Kickoff call/ }).click();
  await expect(page.getByRole('complementary', { name: 'Task details' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Ctrl+Enter opens a note in focus mode.
  await nav(page).getByRole('button', { name: 'Today' }).click();
  await page.keyboard.press('Control+o');
  await page.keyboard.type('kickoff plan');
  await expect(palette(page).getByRole('option').first()).toContainText('Kickoff plan');
  await page.keyboard.press('Control+Enter');
  await expect(page.getByLabel('Note title')).toHaveValue('Kickoff plan');
  await expect(nav(page)).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(nav(page)).toBeVisible();

  // Escape closes the palette and returns focus to where it was.
  const allNotes = page.getByRole('button', { name: 'All notes' });
  await allNotes.focus();
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
  await expect(allNotes).toBeFocused();

  // Archived items are hidden unless asked for.
  await page.keyboard.press('Control+o');
  await page.keyboard.type('website');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Website', level: 1 })).toBeVisible();
  await run(page, 'archive');
  await expect(page.getByText('Project archived.')).toBeVisible();
  await page.keyboard.press('Control+o');
  await page.keyboard.type('website');
  await expect(palette(page).getByRole('option')).toHaveCount(1);
  await expect(palette(page).getByRole('option')).toContainText('Search everything');
  await palette(page).getByRole('checkbox', { name: 'Include archived' }).check();
  await expect(palette(page).getByRole('option', { name: /^Website/ })).toContainText('Archived');
  await page.keyboard.press('Escape');

  // The theme switches from the palette and stays after a restart, with the recent items.
  // The profile follows Windows at first, so the palette offers the other theme.
  const windowsDark = await page.evaluate(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const other = windowsDark ? 'light' : 'dark';
  await run(page, `${other} theme`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', other);
  await app.close();
  ({ page } = await launch(dataDir));
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', other);
  // Recent items survive too; the archived project and its note stay hidden.
  await page.keyboard.press('Control+o');
  const kept = palette(page).getByRole('group', { name: 'Recently opened' }).getByRole('option');
  await expect(kept).toHaveCount(1);
  await expect(kept).toContainText('Kickoff call');
  await palette(page).getByRole('checkbox', { name: 'Include archived' }).check();
  await expect(kept).toHaveCount(3);
  await expect(kept.first()).toContainText('Website');
  expect(errors).toEqual([]);
});
