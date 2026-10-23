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
/** A real 1×1 PNG, so the cover image must load under the Content Security Policy. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

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
const favourites = (page: Page) => nav(page).getByRole('list', { name: 'Favourites' });

let dataDir: string;
test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-e2e-'));
});
test.afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close().catch(() => undefined)));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('favourites, icons, and covers: set, reorder, trash and archive, and kept after a restart', async () => {
  const first = await launch(dataDir);
  const { app } = first;
  let { page } = first;
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.getByLabel('Profile name').fill('Looks');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByLabel('Name').fill('Website');
  await page.getByRole('button', { name: 'Create project' }).click();
  const heading = page.getByRole('heading', { name: 'Website', level: 1 });
  await expect(heading).toBeVisible();
  await expect(favourites(page)).toBeHidden();

  // An icon and a cover for the project, and a star from its ⋯ menu.
  await page.getByRole('button', { name: 'Add icon' }).click();
  await page.getByRole('group', { name: 'Icons' }).getByRole('button', { name: 'Rocket' }).click();
  await expect(page.getByRole('button', { name: 'Change icon (Rocket)' })).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'Website' })).toContainText('🚀');
  await page.getByRole('button', { name: 'Add cover' }).click();
  await page
    .getByRole('group', { name: 'Colours and gradients' })
    .getByRole('button', { name: 'Ocean gradient' })
    .click();
  await expect(page.locator('.page > .cover--banner')).toBeVisible();
  await page.getByRole('button', { name: 'More project actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to favourites' }).click();
  await expect(favourites(page).getByRole('button')).toHaveText(['🚀Website']);

  // A note with an image cover, starred from its ⋯ menu.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('new note in');
  await page.keyboard.press('Enter');
  await page.getByLabel('Note title').fill('Roadmap');
  await expect(page.getByTestId('note-save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Add cover' }).click();
  await page.getByTestId('cover-image-input').setInputFiles({
    name: 'banner.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  const image = page.locator('.cover--image img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  await page.getByRole('button', { name: 'Note actions' }).click();
  await page.getByRole('menuitem', { name: 'Add to favourites' }).click();
  await expect(favourites(page).getByRole('button')).toHaveText(['🚀Website', 'Roadmap']);

  // Reorder from the keyboard menu, then back by drag and drop.
  await favourites(page).getByRole('button', { name: 'Roadmap' }).focus();
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  await expect(favourites(page).getByRole('button')).toHaveText(['Roadmap', '🚀Website']);
  await favourites(page)
    .getByRole('button', { name: 'Website' })
    .dragTo(favourites(page).getByRole('button', { name: 'Roadmap' }), {
      targetPosition: { x: 20, y: 2 },
    });
  await expect(favourites(page).getByRole('button')).toHaveText(['🚀Website', 'Roadmap']);

  // A trashed note leaves the list until it is restored.
  await page.getByRole('button', { name: 'Note actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to trash…' }).click();
  await page.getByRole('button', { name: 'Move to trash' }).click();
  await expect(favourites(page).getByRole('button')).toHaveText(['🚀Website']);
  await page
    .locator('.toast', { hasText: 'moved to trash' })
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(favourites(page).getByRole('button')).toHaveText(['🚀Website', 'Roadmap']);

  // An archived project keeps its star, with a badge; the palette shows its icon.
  await favourites(page).getByRole('button', { name: 'Website' }).click();
  await expect(heading).toBeVisible();
  await page.getByRole('button', { name: 'More project actions' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await expect(favourites(page).getByRole('button', { name: 'Website' })).toContainText('Archived');
  await page.keyboard.press('Control+o');
  await page.keyboard.type('website');
  await page.getByRole('checkbox', { name: 'Include archived' }).check();
  await expect(page.getByRole('option', { name: /^Website/ })).toContainText('🚀');
  await page.keyboard.press('Escape');

  // Everything is still there after a restart.
  await app.close();
  ({ page } = await launch(dataDir));
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  // The note's project is archived, so the note is marked archived too.
  await expect(favourites(page).getByRole('button')).toHaveText([
    '🚀WebsiteArchived',
    'RoadmapArchived',
  ]);
  await favourites(page).getByRole('button', { name: 'Roadmap' }).click();
  await expect(page.locator('.cover--image img')).toBeVisible();
  await favourites(page).getByRole('button', { name: 'Website' }).click();
  await expect(page.getByRole('button', { name: 'Change icon (Rocket)' })).toBeVisible();
  await expect(page.locator('.page > .cover--banner')).toBeVisible();

  // Removing the icon and cover restores the default look.
  await page.getByRole('button', { name: 'Change icon (Rocket)' }).click();
  await page.getByRole('button', { name: 'Remove icon' }).click();
  await page.getByRole('button', { name: 'Change cover' }).click();
  await page.getByRole('button', { name: 'Remove cover' }).click();
  await expect(page.locator('.page > .cover--banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add icon' })).toBeVisible();
  expect(errors).toEqual([]);
});
