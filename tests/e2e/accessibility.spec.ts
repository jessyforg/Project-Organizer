import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

const running: ElectronApplication[] = [];
let dataDir: string;

test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projectforge-a11y-'));
});
test.afterEach(async () => {
  await Promise.all(running.splice(0).map((app) => app.close().catch(() => undefined)));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function launch() {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value;
  env['PROJECTFORGE_DATA_DIR'] = dataDir;
  delete env['ELECTRON_RENDERER_URL'];
  delete env['ELECTRON_RUN_AS_NODE'];
  const app = await electron.launch({ args: ['.'], env });
  running.push(app);
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 800 });
  return page;
}

/** Fails with a readable list of WCAG A/AA violations. */
async function expectNoViolations(page: Page, screen: string) {
  // Legacy mode runs inside the current page; Electron cannot open the helper page axe uses otherwise.
  const results = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${screen}: ${v.id} (${v.impact ?? 'n/a'}) — ${v.help} — ${v.nodes
        .map((n) => n.target.join(' '))
        .slice(0, 3)
        .join(' | ')}`,
  );
  expect(summary).toEqual([]);
}

async function seed(page: Page) {
  await page.evaluate(async () => {
    const api = window.api;
    const project = await api.projects.create({ name: 'Website', color: 'blue', kind: 'software' });
    if (!project.ok) throw new Error('seed');
    const tag = await api.tags.create({ name: 'Bug' });
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const late = await api.tasks.create({
      title: 'Fix layout bug',
      projectId: project.data.id,
      priority: 'urgent',
      dueDate: day(-1),
      ...(tag.ok ? { tagIds: [tag.data.id] } : {}),
    });
    await api.tasks.create({
      title: 'Write copy',
      projectId: project.data.id,
      priority: 'high',
      dueDate: day(0),
    });
    await api.tasks.create({
      title: 'Pick fonts',
      projectId: project.data.id,
      priority: 'medium',
      dueDate: day(3),
    });
    await api.tasks.create({ title: 'Call the bank', priority: 'low' });
    if (late.ok) await api.tasks.create({ title: 'Reproduce', parentTaskId: late.data.id });
    await api.notes.create({
      title: 'Launch plan',
      projectId: project.data.id,
      body: [
        '# Launch',
        '',
        '- [x] Pick a date',
        '- [ ] Email the list, see [the guide](https://example.com)',
        '',
        '| Step | Owner |',
        '|---|---|',
        '| Copy | Jes |',
        '',
        '> Keep it short.',
        '',
        '`npm run build`',
        '',
        '![Logo](https://example.com/logo.png)',
      ].join('\n'),
      ...(tag.ok ? { tagIds: [tag.data.id] } : {}),
    });
  });
  await page.reload();
  await page.getByTestId('active-profile').waitFor();
}

for (const theme of ['light', 'dark'] as const) {
  test(`main screens have no WCAG A/AA violations (${theme} theme)`, async () => {
    test.setTimeout(120_000);
    const page = await launch();
    await expectNoViolations(page, 'start screen');
    await page.getByLabel('Profile name').fill('Jes');
    await page.getByRole('button', { name: 'Create profile' }).click();
    await page.getByTestId('active-profile').waitFor();
    await seed(page);
    if (theme === 'dark') {
      await page.keyboard.press('Control+,');
      await page.getByLabel('Dark').check();
    }
    const nav = page.getByRole('navigation', { name: 'Main' });

    await nav.getByRole('button', { name: 'Today' }).click();
    await expect(page.getByRole('heading', { name: 'Overdue' })).toBeVisible();
    await expectNoViolations(page, 'Today');

    await nav.getByRole('button', { name: 'My tasks' }).click();
    await expectNoViolations(page, 'My tasks');

    await nav.getByRole('button', { name: 'Website' }).click();
    await page
      .getByRole('main')
      .getByRole('button', { name: /^Fix layout bug/ })
      .click();
    await expect(page.getByRole('complementary', { name: 'Task details' })).toBeVisible();
    await expectNoViolations(page, 'Project with task details');

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Board' }).click();
    await expect(page.getByRole('region', { name: /^To do/ })).toBeVisible();
    await expectNoViolations(page, 'Project board');
    await page.getByRole('button', { name: 'Move Pick fonts' }).click();
    await expectNoViolations(page, 'Board move dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await nav.getByRole('button', { name: 'Calendar' }).click();
    await expect(page.getByRole('button', { name: /Write copy/ })).toBeVisible();
    await expectNoViolations(page, 'Calendar (month)');
    await page.getByRole('button', { name: 'Week' }).click();
    await expectNoViolations(page, 'Calendar (week)');
    await page.getByRole('button', { name: 'Show overdue tasks' }).click();
    await expectNoViolations(page, 'Calendar (day)');

    await nav.getByRole('button', { name: 'Projects', exact: true }).click();
    await expectNoViolations(page, 'Projects');

    await nav.getByRole('button', { name: 'Notes' }).click();
    await page.getByRole('list', { name: 'Notes' }).getByRole('button').first().click();
    // The seeded note has a table, so it opens in Markdown mode.
    await expect(page.getByRole('heading', { name: 'Launch', level: 1 })).toBeVisible();
    await expectNoViolations(page, 'Notes (Markdown preview)');
    await page.getByRole('button', { name: 'Write' }).click();
    await expectNoViolations(page, 'Notes (Markdown write)');
    await page.getByRole('button', { name: 'New note' }).click();
    await page.getByRole('textbox', { name: 'Note text' }).fill('A visual note');
    await expectNoViolations(page, 'Notes (visual)');

    await nav.getByRole('button', { name: 'Trash' }).click();
    await expectNoViolations(page, 'Trash');

    await nav.getByRole('button', { name: 'Settings' }).click();
    await expectNoViolations(page, 'Settings');

    await page.keyboard.press('Control+n');
    await expect(page.getByRole('dialog', { name: 'New task' })).toBeVisible();
    await expectNoViolations(page, 'New task dialog');
  });
}
