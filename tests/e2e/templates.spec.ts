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

async function launch() {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env['PROJECTFORGE_DATA_DIR'] = dataDir;
  // Save dialogs write here instead of asking (unpackaged builds only).
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

test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-e2e-'));
  dialogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-dialogs-'));
});
test.afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close().catch(() => undefined)));
  for (const dir of [dataDir, dialogDir]) fs.rmSync(dir, { recursive: true, force: true });
});

test('templates: create from built-in, save your own, rename, export, import, delete, restart', async () => {
  const first = await launch();
  const { app } = first;
  let { page } = first;
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.getByLabel('Profile name').fill('Templates');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Projects', exact: true }).click();

  // A project from the built-in software template, after its preview.
  await page.getByRole('button', { name: 'New from template' }).click();
  const picker = page.getByRole('dialog', { name: 'New project from a template' });
  await picker.getByRole('radio', { name: /Software development/ }).check();
  const preview = picker.getByRole('region', { name: 'Preview' });
  await expect(preview).toContainText('Backlog → In progress → In review → Done');
  await expect(preview).toContainText('Estimate, Area');
  await picker.getByLabel('Project name').fill('Mobile app');
  await picker.getByLabel('Start date').fill('2026-11-02');
  await picker.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'Mobile app', level: 1 })).toBeVisible();
  const milestones = page.getByRole('list', { name: 'Milestones in Mobile app' });
  await expect(milestones.getByRole('listitem')).toHaveCount(3);
  await expect(milestones.getByRole('listitem').last()).toContainText('Target Jan 11');
  await page.getByRole('button', { name: 'Board' }).click();
  await expect(page.getByRole('heading', { name: /^Backlog/ })).toBeVisible();
  await page.getByRole('button', { name: 'List' }).click();
  await expect(
    page.getByRole('region', { name: 'Notes' }).getByText('Project brief', { exact: true }),
  ).toBeVisible();

  // Save it as your own template, keeping dates.
  await page.getByRole('button', { name: 'More project actions' }).click();
  await page.getByRole('menuitem', { name: 'Save as template…' }).click();
  const save = page.getByRole('dialog', { name: 'Save as template' });
  await save.getByLabel('Template name').fill('Our app setup');
  await save.getByRole('checkbox', { name: /Keep dates/ }).check();
  await save.getByRole('button', { name: 'Save template' }).click();
  await expect(page.getByText('Saved the template “Our app setup”.')).toBeVisible();

  // Manage: rename, export, import the export, delete the copy.
  await nav(page).getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Templates…' }).click();
  const manager = page.getByRole('dialog', { name: 'Templates' });
  const name = manager.getByLabel('Name of template Our app setup');
  await name.fill('App starter');
  await name.press('Tab');
  await expect(manager.getByRole('status')).toHaveText('Renamed to “App starter”.');
  await manager.getByRole('button', { name: 'Export App starter' }).click();
  await expect(manager.getByRole('status')).toHaveText('Saved “App starter.pftemplate.json”.');
  const exported = path.join(dialogDir, 'App starter.pftemplate.json');
  expect(JSON.parse(fs.readFileSync(exported, 'utf8'))).toMatchObject({
    format: 'projectforge-template',
    name: 'App starter',
  });
  await manager.getByTestId('template-import-input').setInputFiles(exported);
  await expect(manager.getByRole('status')).toHaveText('Imported “App starter (2)”.');
  await manager.getByRole('button', { name: 'Delete App starter (2)' }).click();
  await page
    .getByRole('dialog', { name: 'Delete the template “App starter (2)”?' })
    .getByRole('button', { name: 'Delete template' })
    .click();
  await expect(manager.getByLabel('Name of template App starter (2)')).toBeHidden();
  await expect(manager).toBeVisible();
  await manager.getByRole('button', { name: 'Done' }).click();

  // A project from your own template; then everything is kept after a restart.
  await page.getByRole('button', { name: 'New from template' }).click();
  await picker.getByRole('radio', { name: /App starter/ }).check();
  await picker.getByLabel('Project name').fill('Second app');
  await picker.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name: 'Second app', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Milestones in Second app' }).getByRole('listitem'),
  ).toHaveCount(3);
  await app.close();
  ({ page } = await launch());
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await nav(page).getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Templates…' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Templates' }).getByLabel('Name of template App starter'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
