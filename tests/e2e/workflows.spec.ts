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

  // Global search from the command palette's last entry (ADR-0018).
  await page.keyboard.press('Control+k');
  await page.keyboard.type('homepa');
  await page.keyboard.press('Enter');
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
  await page.getByRole('button', { name: 'More project actions' }).click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
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

test('notes: write Markdown, autosave, preview, search, leave safely, trash and restore, restart', async () => {
  let { app, page } = await launch(dataDir);
  await page.getByLabel('Profile name').fill('Notes');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  // Create a note; it saves itself after a pause.
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await expect(page.getByText('No notes yet. Create one to start.')).toBeVisible();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Note title').fill('Meeting notes');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await page
    .getByLabel('Note text (Markdown)')
    .fill('# Agenda\n\n- Budget **review**\n\n<b>not bold</b>');
  await expect(page.getByTestId('note-save-state')).toHaveText('Saved');
  // The library lists it; opening it again shows the note view.
  await page.getByRole('button', { name: 'All notes' }).click();
  const list = page.getByRole('list', { name: 'Notes' });
  await expect(list).toContainText('Meeting notes');
  await list.getByRole('button', { name: /Meeting notes/ }).click();

  // The preview renders Markdown and shows raw HTML as text.
  await page.getByRole('button', { name: 'Preview' }).click();
  const editor = page.getByRole('region', { name: 'Open note' });
  await expect(editor.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible();
  await expect(editor.locator('strong')).toHaveText('review');
  await expect(editor.getByText('<b>not bold</b>')).toBeVisible();

  // Typing and leaving at once still saves (the leave guard waits for the save).
  await page.getByRole('button', { name: 'Write' }).click();
  await page.getByLabel('Note text (Markdown)').press('End');
  await page.getByLabel('Note text (Markdown)').pressSequentially(' Decide date.');
  await nav(page).getByRole('button', { name: 'Today' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  // Global search finds note bodies.
  await page.keyboard.press('Control+k');
  await page.keyboard.type('decide');
  await page.keyboard.press('Enter');
  await page.getByRole('list', { name: 'Matching notes' }).getByRole('button').click();
  await expect(page.getByTestId('note-save-state')).toHaveText('Saved');
  await expect(editor).toContainText('Decide date.');

  // Trash the note (the menu asks first), then restore it from the trash.
  await editor.getByRole('button', { name: 'Note actions' }).click();
  await page.getByRole('menuitem', { name: 'Move to trash…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Move to trash' }).click();
  await expect(page.getByText('No notes yet. Create one to start.')).toBeVisible();
  await page.keyboard.press('Control+4');
  await expect(page.getByRole('list', { name: 'Items in trash' })).toContainText('Note');
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('The trash is empty.')).toBeVisible();
  await app.close();

  // The note persists across a restart and appears in its project.
  ({ app, page } = await launch(dataDir));
  await nav(page).getByRole('button', { name: 'Inbox' }).click();
  await page.getByRole('list', { name: 'Notes in Inbox' }).getByRole('button').click();
  await expect(page.getByRole('region', { name: 'Open note' })).toContainText('Decide date.');
  await app.close();
});

test('notes: the visual editor saves Markdown that survives closing and reopening', async () => {
  let { app, page } = await launch(dataDir);
  await page.getByLabel('Profile name').fill('Visual');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Note title').fill('Release plan');

  // Markdown-style typing and a keyboard shortcut, in the visual editor.
  const body = page.getByRole('textbox', { name: 'Note text' });
  await body.click();
  await page.keyboard.type('## Steps');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- Build the ');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('installer');
  await page.keyboard.press('Control+b');
  await expect(page.getByTestId('note-save-state')).toHaveText('Saved');

  // Leave and come back: the note reopens in the visual editor with its formatting.
  await nav(page).getByRole('button', { name: 'Today' }).click();
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('list', { name: 'Notes' }).getByRole('button').click();
  await expect(body.getByRole('heading', { name: 'Steps', level: 2 })).toBeVisible();
  await app.close();

  // After a restart, the stored text is the Markdown that was typed.
  ({ app, page } = await launch(dataDir));
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('list', { name: 'Notes' }).getByRole('button').click();
  const reopened = page.getByRole('textbox', { name: 'Note text' });
  await expect(reopened.getByRole('listitem')).toHaveText('Build the installer');
  await expect(reopened.locator('strong')).toHaveText('installer');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(page.getByLabel('Note text (Markdown)')).toHaveValue(
    '## Steps\n\n- Build the **installer**\n',
  );
  await expect(page.getByTestId('note-save-state')).toHaveText('Saved');
  await app.close();
});

test('notes: closing the window while typing saves the note first', async () => {
  let { app, page } = await launch(dataDir);
  await page.getByLabel('Profile name').fill('Close');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('textbox', { name: 'Note text' }).fill('Typed just before closing');
  // Close at once, before the autosave pause ends: the page saves as the window closes
  // (removing its beforeunload handler makes this test fail). Electron shows no
  // beforeunload dialog; the listener stops Playwright from trying to dismiss one.
  page.on('dialog', () => undefined);
  const closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await closed;

  ({ app, page } = await launch(dataDir));
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('list', { name: 'Notes' }).getByRole('button').click();
  await expect(page.getByRole('region', { name: 'Open note' })).toContainText(
    'Typed just before closing',
  );
  await app.close();
});

test('kanban: move cards with the Move dialog and by drag and drop; order persists', async () => {
  let { app, page } = await launch(dataDir);
  await page.getByLabel('Profile name').fill('Board');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.evaluate(async () => {
    const project = await window.api.projects.create({ name: 'Website' });
    if (!project.ok) throw new Error('seed');
    for (const title of ['Alpha', 'Beta', 'Gamma']) {
      await window.api.tasks.create({ title, projectId: project.data.id });
    }
  });
  await page.reload();
  await nav(page).getByRole('button', { name: 'Website' }).click();
  await page.getByRole('button', { name: 'Board' }).click();
  const column = (name: string) => page.getByRole('region', { name: new RegExp(`^${name}`) });
  const titles = (name: string) => column(name).locator('.card__title').allTextContents();
  await expect.poll(() => titles('To do')).toEqual(['Alpha', 'Beta', 'Gamma']);

  // Keyboard path: the Move dialog.
  await page.getByRole('button', { name: 'Move Gamma' }).click();
  const dialog = page.getByRole('dialog', { name: 'Move Gamma' });
  await dialog.getByLabel('Column').selectOption({ label: 'In progress' });
  await dialog.getByRole('button', { name: 'Move' }).click();
  await expect.poll(() => titles('In progress')).toEqual(['Gamma']);

  // Mouse path: drag Alpha onto the top half of Gamma, so it lands above it.
  await page
    .getByRole('button', { name: 'Alpha', exact: true })
    .dragTo(column('In progress').locator('.card').first(), { targetPosition: { x: 20, y: 4 } });
  await expect.poll(() => titles('In progress')).toEqual(['Alpha', 'Gamma']);
  await expect.poll(() => titles('To do')).toEqual(['Beta']);

  // Moving to Done completes the task.
  await page.getByRole('button', { name: 'Move Beta' }).click();
  await page.getByRole('dialog').getByLabel('Column').selectOption({ label: 'Done' });
  await page.getByRole('dialog').getByRole('button', { name: 'Move' }).click();
  await expect.poll(() => titles('Done')).toEqual(['Beta']);
  await app.close();

  ({ app, page } = await launch(dataDir));
  await nav(page).getByRole('button', { name: 'Website' }).click();
  await page.getByRole('button', { name: 'Board' }).click();
  await expect.poll(() => titles('In progress')).toEqual(['Alpha', 'Gamma']);
  await page.getByRole('button', { name: 'List' }).click();
  await expect(page.getByRole('button', { name: /^Done 1/ })).toBeVisible();
  await app.close();
});

test('calendar: tasks appear on due dates; changing a due date moves the entry at once', async () => {
  const { app, page } = await launch(dataDir);
  await page.getByLabel('Profile name').fill('Dates');
  await page.getByRole('button', { name: 'Create profile' }).click();
  const day = (offset: number) =>
    page.evaluate((o) => {
      const d = new Date();
      d.setDate(d.getDate() + o);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }, offset);
  const today = await day(0);
  const tomorrow = await day(1);
  await page.evaluate(
    async ({ today }) => {
      await window.api.tasks.create({ title: 'Pay rent', dueDate: today });
    },
    { today },
  );
  await page.reload();
  await nav(page).getByRole('button', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: 'Week' }).click();
  const weekDay = (iso: string) =>
    page.locator('.week__day').filter({ has: page.locator(`[data-day="${iso}"]`) });
  await expect(weekDay(today).getByRole('button', { name: 'Pay rent' })).toBeVisible();

  // Open the task from the calendar and move its due date.
  await weekDay(today).getByRole('button', { name: 'Pay rent' }).click();
  const details = page.getByRole('complementary', { name: 'Task details' });
  await details.getByLabel('Due date').fill(tomorrow);
  await page.keyboard.press('Escape');
  await expect(weekDay(today).getByRole('button', { name: 'Pay rent' })).toBeHidden();
  // Tomorrow can fall in next week's view.
  if ((await page.locator(`[data-day="${tomorrow}"]`).count()) === 0) {
    await page.getByRole('button', { name: 'Next week' }).click();
  }
  await expect(weekDay(tomorrow).getByRole('button', { name: 'Pay rent' })).toBeVisible();

  // Completed tasks are hidden unless asked for.
  await weekDay(tomorrow).getByRole('button', { name: 'Pay rent' }).click();
  await details.getByLabel('Status').selectOption({ label: 'Done' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Pay rent/ })).toBeHidden();
  await page.getByLabel('Show done and cancelled').check();
  await expect(page.getByRole('button', { name: /Pay rent.*done/ })).toBeVisible();
  await app.close();
});

test('settings: colours persist across a restart, and tags can be deleted', async () => {
  let { app, page } = await launch(dataDir);
  await page.getByLabel('Profile name').fill('Colours');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.evaluate(async () => {
    const tag = await window.api.tags.create({ name: 'Obsolete' });
    if (tag.ok) await window.api.notes.create({ title: 'Tagged', tagIds: [tag.data.id] });
  });
  await nav(page).getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'Teal' }).check();
  await page.getByRole('radio', { name: 'Warm' }).check();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-accent', 'teal');
  await expect(html).toHaveAttribute('data-surface', 'warm');

  // Deleting a tag says where it is used and keeps the note.
  const tags = page.getByRole('list', { name: 'Tags' });
  await expect(tags).toContainText('1 note');
  await tags.getByRole('button', { name: 'Actions for tag Obsolete' }).click();
  await page.getByRole('menuitem', { name: 'Delete tag' }).click();
  await expect(page.getByText('It is removed from 1 note. The items are kept.')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete tag' }).click();
  await expect(page.getByText('No tags yet.', { exact: false })).toBeVisible();
  await app.close();

  ({ app, page } = await launch(dataDir));
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal');
  await expect(page.locator('html')).toHaveAttribute('data-surface', 'warm');
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  );
  expect(accent).toBe('#0e7068');
  const titles = await page.evaluate(async () => {
    const notes = await window.api.notes.list({});
    return notes.ok ? notes.data.map((n) => [n.title, n.tagIds.length]) : [];
  });
  expect(titles).toEqual([['Tagged', 0]]);
  await app.close();
});
