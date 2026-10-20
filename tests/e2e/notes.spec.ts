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
let dataDir: string;
let dialogDir: string;
let filesDir: string;

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

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const folders = (page: Page) => page.getByRole('navigation', { name: 'Note folders' });

async function noteAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'Note actions' }).click();
  await page.getByRole('menuitem', { name }).click();
}

test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-e2e-'));
  dialogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-dialogs-'));
  filesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-files-'));
});
test.afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close().catch(() => undefined)));
  for (const dir of [dataDir, dialogDir, filesDir])
    fs.rmSync(dir, { recursive: true, force: true });
});

test('notes: folders, Markdown import, duplicate, copy, export, and trash with confirmation', async () => {
  let { app, page } = await launch();
  await page.getByLabel('Profile name').fill('Notes');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Notes' }).click();

  // A folder, then two Markdown files imported into it.
  await page.getByRole('button', { name: 'New folder' }).click();
  await page.getByLabel('Folder name').fill('Work');
  await page.getByRole('button', { name: 'Create folder' }).click();
  await folders(page).getByRole('button', { name: /^Work/ }).click();
  const roadmap = path.join(filesDir, 'roadmap.md');
  const ideas = path.join(filesDir, 'Ideas.md');
  fs.writeFileSync(roadmap, '# Roadmap\r\n\r\n- [ ] Ship folders\r\n');
  fs.writeFileSync(ideas, 'Loose thoughts\n');
  await page.getByTestId('import-markdown-input').setInputFiles([roadmap, ideas]);
  await expect(page.getByText('Imported 2 notes.')).toBeVisible();
  await expect(folders(page).getByRole('button', { name: /^Work/ })).toContainText('2');
  const list = page.getByRole('list', { name: 'Notes' });
  await expect(list.getByRole('button')).toHaveCount(2);

  // Duplicate keeps the folder and opens the copy.
  await list.getByRole('button', { name: /Roadmap/ }).click();
  await noteAction(page, 'Duplicate');
  await expect(page.getByLabel('Note title')).toHaveValue('Roadmap (copy)');
  await expect(page.getByLabel('Folder', { exact: true }).locator('option:checked')).toHaveText(
    'Work',
  );
  await expect(folders(page).getByRole('button', { name: /^Work/ })).toContainText('3');

  // Copy as Markdown puts the saved body on the system clipboard.
  await noteAction(page, 'Copy as Markdown');
  await expect(page.getByText('Copied the note as Markdown.')).toBeVisible();
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
  expect(copied).toBe('- [ ] Ship folders\n');

  // Export writes the title as a heading, then the body.
  await noteAction(page, 'Export as Markdown…');
  await expect(page.getByText('Saved “Roadmap (copy).md”.')).toBeVisible();
  expect(fs.readFileSync(path.join(dialogDir, 'Roadmap (copy).md'), 'utf8')).toBe(
    '# Roadmap (copy)\n\n- [ ] Ship folders\n',
  );

  // Trash asks first; cancelling keeps the note.
  await noteAction(page, 'Move to trash…');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Note title')).toHaveValue('Roadmap (copy)');
  await noteAction(page, 'Move to trash…');
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click();
  await expect(list.getByRole('button')).toHaveCount(2);
  await app.close();

  // After a restart the folder and its notes are still there.
  ({ app, page } = await launch());
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await expect(folders(page).getByRole('button', { name: /^Work/ })).toContainText('2');

  // Deleting the folder keeps its notes, now in no folder.
  await folders(page).getByRole('button', { name: 'Actions for folder Work' }).click();
  await page.getByRole('menuitem', { name: 'Delete folder' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete folder' }).click();
  await expect(folders(page).getByRole('button', { name: /^Work/ })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Notes' }).getByRole('button')).toHaveCount(2);
  await app.close();
});
