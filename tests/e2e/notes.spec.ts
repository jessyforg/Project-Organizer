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
  // Importing opens the first note; the library shows the rest.
  await page.getByRole('button', { name: 'All notes' }).click();
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
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Work');

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

test('notes: library, right-click archive, read-only archived notes, and focus mode', async () => {
  const { page } = await launch();
  await page.getByLabel('Profile name').fill('Library');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await page.evaluate(async () => {
    await window.api.notes.create({ title: 'Old plan', body: 'Done already' });
    await window.api.notes.create({ title: 'Current plan', body: 'In progress' });
  });
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  const list = page.getByRole('list', { name: 'Notes' });
  await expect(list.getByRole('button')).toHaveCount(2);

  // Right-click → Archive hides the note from the library.
  await list.getByRole('button', { name: /Old plan/ }).click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Archive' }).click();
  await expect(page.getByText('Archived “Old plan”.')).toBeVisible();
  await expect(list.getByRole('button')).toHaveCount(1);

  // The Archived filter shows it; it opens read-only, and Unarchive makes it editable.
  await folders(page).getByRole('button', { name: 'Archived' }).click();
  await list.getByRole('button', { name: /Old plan/ }).click();
  await expect(page.getByText('This note is archived, so it cannot be edited.')).toBeVisible();
  await expect(page.getByLabel('Note title')).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: 'Unarchive' }).click();
  await expect(page.getByLabel('Note title')).not.toHaveAttribute('readonly');

  // Focus mode hides the app sidebar; Escape brings it back.
  await expect(nav(page)).toBeVisible();
  await page.keyboard.press('Control+Shift+F');
  await expect(nav(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exit focus' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Note text' }).click();
  await page.keyboard.press('Escape');
  await expect(nav(page)).toBeVisible();
});

test('notes: slash commands insert blocks from the keyboard and mouse, saved as Markdown', async () => {
  const { page } = await launch();
  await page.getByLabel('Profile name').fill('Slash');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Note title').fill('Weekly plan');
  const body = page.getByRole('textbox', { name: 'Note text' });
  await body.click();
  const menu = page.getByRole('listbox', { name: 'Insert a block' });

  // "/" opens the menu just below the cursor, inside the window.
  await page.keyboard.type('/');
  await expect(menu).toBeVisible();
  const caret = await body.locator('.slash-query').boundingBox();
  const box = await page.locator('.slash-menu').boundingBox();
  expect(caret && box).toBeTruthy();
  expect(box!.y).toBeGreaterThanOrEqual(caret!.y + caret!.height - 1);
  expect(box!.x).toBeLessThan(caret!.x + 8);
  expect(box!.y + box!.height).toBeLessThanOrEqual(800);

  // Filter, then Enter; the arrow keys pick another match.
  await page.keyboard.type('h2');
  await expect(menu.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await page.keyboard.type('Goals');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/list');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('option', { name: /Checklist/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await page.keyboard.type('Ship slash commands');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  // A click works too, and keeps the cursor in the note.
  await page.keyboard.type('/div');
  await menu.getByRole('option', { name: /Divider/ }).click();
  await expect(menu).toHaveCount(0);
  await page.keyboard.type('Notes');

  // In focus mode, Escape closes only the menu; a second Escape leaves focus mode.
  await page.keyboard.press('Control+Shift+F');
  await expect(nav(page)).toHaveCount(0);
  await page.keyboard.type(' /quo');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(nav(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(nav(page)).toBeVisible();

  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const list = await window.api.notes.list({});
    if (!list.ok) return null;
    const note = await window.api.notes.get({ id: list.data[0]!.id });
    return note.ok ? note.data.body : null;
  });
  expect(saved).toBe('## Goals\n\n- [ ] Ship slash commands\n\n---\n\nNotes /quo\n');
});

test('notes: the formatting bubble formats a selection, turns blocks, and adds links', async () => {
  const { page } = await launch();
  await page.getByLabel('Profile name').fill('Bubble');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Note title').fill('Bubble');
  const body = page.getByRole('textbox', { name: 'Note text' });
  await body.click();
  await page.keyboard.type('Hello brave world');
  const bubble = page.getByRole('toolbar', { name: 'Selection formatting' });
  await expect(bubble).toHaveCount(0);

  // Double-clicking a word selects it; the bubble appears above it, inside the window.
  await body.getByText('Hello brave world').dblclick({ position: { x: 60, y: 8 } });
  await expect(bubble).toBeVisible();
  const word = await body.getByText('Hello brave world').boundingBox();
  const box = await bubble.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(word!.y + 1);
  expect(box!.x).toBeGreaterThanOrEqual(0);

  await bubble.getByRole('button', { name: 'Bold (Ctrl+B)' }).click();
  await expect(bubble.getByRole('button', { name: 'Bold (Ctrl+B)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await bubble.getByRole('button', { name: 'Link' }).click();
  await page.getByRole('textbox', { name: 'Link address' }).fill('example.com');
  await page.keyboard.press('Enter');

  // Keyboard: Alt+F10 moves into the bubble; "Turn into" opens with Arrow Down.
  await page.keyboard.press('Alt+F10');
  await expect(bubble.getByRole('button', { name: 'Turn into: Text' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page
    .getByRole('menu', { name: 'Turn into' })
    .getByRole('menuitem', { name: 'Heading 2' })
    .click();
  await expect(body.getByRole('heading', { level: 2 })).toBeVisible();

  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const list = await window.api.notes.list({});
    if (!list.ok) return null;
    const note = await window.api.notes.get({ id: list.data[0]!.id });
    return note.ok ? note.data.body : null;
  });
  expect(saved).toBe('## Hello [**brave**](https://example.com) world\n');
});

test('notes: the outline lists headings, jumps to them, and stays open after a restart', async () => {
  const first = await launch();
  const { app } = first;
  let { page } = first;
  await page.getByLabel('Profile name').fill('Outline');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Note title').fill('Long read');
  const body = page.getByRole('textbox', { name: 'Note text' });
  await body.click();
  // Enough text that the last heading starts below the window.
  for (const [heading, lines] of [
    ['# Intro', 12],
    ['## Details', 12],
    ['### Edge cases', 12],
  ] as const) {
    await page.keyboard.type(heading);
    await page.keyboard.press('Enter');
    for (let i = 0; i < lines; i += 1) {
      await page.keyboard.type(`Line ${i + 1}`);
      await page.keyboard.press('Enter');
    }
  }

  await page.getByRole('button', { name: 'Outline' }).click();
  const outline = page.getByRole('navigation', { name: 'Outline' });
  await expect(outline.getByRole('button')).toHaveText(['Intro', 'Details', 'Edge cases']);

  // Jumping brings the heading into view and puts the cursor in it.
  await outline.getByRole('button', { name: 'Intro' }).click();
  await expect(outline.getByRole('button', { name: 'Intro' })).toHaveAttribute(
    'aria-current',
    'location',
  );
  const heading = body.getByRole('heading', { name: 'Edge cases' });
  await outline.getByRole('button', { name: 'Edge cases' }).click();
  await expect(heading).toBeInViewport();
  await expect(outline.getByRole('button', { name: 'Edge cases' })).toHaveAttribute(
    'aria-current',
    'location',
  );
  await page.keyboard.type('Tricky ');
  await expect(heading).toHaveText('Tricky Edge cases');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await app.close();

  // The choice is kept for the profile. (The test's clean-up closes this second launch.)
  page = (await launch()).page;
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('list', { name: 'Notes' }).getByRole('button').click();
  await expect(
    page
      .getByRole('navigation', { name: 'Outline' })
      .getByRole('button', { name: 'Tricky Edge cases' }),
  ).toBeVisible();
});

test('notes: callouts, toggles, and tables are typed, saved as Markdown, and previewed', async () => {
  const { page } = await launch();
  // Every style the editor sets must pass the Content Security Policy.
  const cspErrors: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) cspErrors.push(message.text());
  });
  await page.getByLabel('Profile name').fill('Blocks');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Note title').fill('Blocks');
  const body = page.getByRole('textbox', { name: 'Note text' });
  await body.click();

  await page.keyboard.type('/warning');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Back up first');
  await expect(body.getByRole('note', { name: 'Warning' })).toContainText('Back up first');
  // Leave the callout: Enter twice on an empty line, as in a quote.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  await page.keyboard.type('/toggle');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Details');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hidden part');
  await body.getByRole('button', { name: 'Collapse Details' }).click();
  await expect(body.getByText('Hidden part')).toBeHidden();
  await body.getByRole('button', { name: 'Expand Details' }).click();
  await expect(body.getByText('Hidden part')).toBeVisible();

  // A table after the toggle: Enter on an empty last line leaves the toggle.
  await body.getByText('Hidden part').click();
  await page.keyboard.press('End');
  // The editor reads a click's new cursor position on the browser's next selection event; wait
  // until it has, rather than pressing Enter faster than any person would.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const dom = document.querySelector('.doc-editor__body') as unknown as {
          editor: { state: { selection: { $from: { parent: { textContent: string } } } } };
        };
        return dom.editor.state.selection.$from.parent.textContent;
      }),
    )
    .toBe('Hidden part');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/table');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Item');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Qty');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Note');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Apples');
  await page.keyboard.press('Tab');
  await page.keyboard.type('3');
  const tableBar = page.getByRole('toolbar', { name: 'Table' });
  await expect(tableBar).toBeVisible();
  await tableBar.getByRole('button', { name: 'Delete column' }).click();
  await expect(body.getByRole('table')).toBeVisible();

  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const list = await window.api.notes.list({});
    if (!list.ok) return '';
    const note = await window.api.notes.get({ id: list.data[0]!.id });
    return note.ok ? note.data.body : '';
  });
  expect(saved).toContain('> [!WARNING]\n> Back up first\n');
  expect(saved).toContain(
    '<details open>\n<summary>Details</summary>\n\nHidden part\n\n</details>',
  );
  // The cursor was in the Qty column, so that column was deleted.
  expect(saved).toMatch(/\| Item +\| Note +\|\n\| -+ +\| -+ +\|\n\| Apples +\| +\|/);
  expect(saved).not.toContain('Qty');

  // Reopened, it is still visual; the preview shows the same blocks.
  await page.getByRole('button', { name: 'All notes' }).click();
  await page.getByRole('list', { name: 'Notes' }).getByRole('button').click();
  await expect(page.getByRole('textbox', { name: 'Note text' }).getByRole('table')).toBeVisible();
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await page.getByRole('button', { name: 'Preview' }).click();
  const preview = page.locator('.markdown');
  await expect(preview.getByRole('note', { name: 'Warning' })).toContainText('Back up first');
  await expect(preview.locator('details[open] > summary')).toHaveText('Details');
  await expect(preview.getByRole('table')).toContainText('Apples');
  expect(cspErrors).toEqual([]);
});

test('notes: links with [[, backlinks, mentions, renames, and the trash', async () => {
  let { page } = await launch();
  await page.getByLabel('Profile name').fill('Links');
  await page.getByRole('button', { name: 'Create profile' }).click();
  const ids = await page.evaluate(async () => {
    const roadmap = await window.api.notes.create({ title: 'Roadmap', body: 'Where we go.' });
    const ideas = await window.api.notes.create({
      title: 'Ideas',
      body: 'We should update the roadmap soon.',
    });
    return { roadmap: roadmap.ok ? roadmap.data.id : '', ideas: ideas.ok ? ideas.data.id : '' };
  });
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Note title').fill('Weekly');
  const body = page.getByRole('textbox', { name: 'Note text' });
  await body.click();

  // [[ lists notes as you type; Enter links the highlighted one.
  await page.keyboard.type('Status: [[Road');
  const picker = page.getByRole('listbox', { name: 'Link to a note' });
  await expect(picker.getByRole('option').first()).toHaveText('Roadmap');
  await page.keyboard.press('Enter');
  const chip = body.getByRole('link', { name: 'Note: Roadmap' });
  await expect(chip).toBeVisible();
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const list = await window.api.notes.list({ text: 'Status' });
    const note = list.ok ? await window.api.notes.get({ id: list.data[0]!.id }) : null;
    return note?.ok ? note.data.body : '';
  });
  expect(saved).toBe(`Status: [Roadmap](projectforge://note/${ids.roadmap})\n`);

  // The chip opens the note, whose backlinks list Weekly, and Ideas as an unlinked mention.
  await chip.click();
  await expect(page.getByLabel('Note title')).toHaveValue('Roadmap');
  const backlinks = page.getByRole('region', { name: /Linked from/ });
  await expect(backlinks.getByRole('button', { name: /Weekly/ })).toBeVisible();
  await backlinks.getByRole('button', { name: 'Link the mention in “Ideas”' }).click();
  await expect(page.getByText('Linked the mention in “Ideas”.')).toBeVisible();
  await expect(backlinks.getByRole('button', { name: /^Ideas/ })).toBeVisible();

  // Renaming the note: links show the new title.
  await page.getByLabel('Note title').fill('Roadmap 2027');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await backlinks.getByRole('button', { name: /Weekly/ }).click();
  await expect(body.getByRole('link', { name: 'Note: Roadmap 2027' })).toBeVisible();

  // In the trash, the link is broken; restored, it works again.
  const batch = await page.evaluate(async (id) => {
    const result = await window.api.trash.trashNote({ id });
    return result.ok ? result.data.batchId : '';
  }, ids.roadmap);
  await page.getByRole('button', { name: 'All notes' }).click();
  await page
    .getByRole('list', { name: 'Notes' })
    .getByRole('button', { name: /Weekly/ })
    .click();
  // A missing note's title cannot be looked up, so the link shows the label it was saved with.
  const broken = body.getByRole('link', { name: 'Note: Roadmap (not found)' });
  await expect(broken).toHaveAttribute('aria-disabled', 'true');
  // Forced: Playwright waits for aria-disabled elements to be enabled; a click must do nothing.
  await broken.click({ force: true });
  await expect(page.getByLabel('Note title')).toHaveValue('Weekly');
  await page.evaluate(async (batchId) => {
    await window.api.trash.restore({ batchId });
  }, batch);
  await page.getByRole('button', { name: 'All notes' }).click();
  await page
    .getByRole('list', { name: 'Notes' })
    .getByRole('button', { name: /Weekly/ })
    .click();

  // Ctrl+click opens the linked note in focus mode.
  await body.getByRole('link', { name: 'Note: Roadmap 2027' }).click({ modifiers: ['Control'] });
  await expect(page.getByLabel('Note title')).toHaveValue('Roadmap 2027');
  await expect(nav(page)).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(nav(page)).toBeVisible();

  // After a restart, the backlinks are still there (the index is saved).
  await running[0]!.close();
  running.splice(0);
  page = (await launch()).page;
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page
    .getByRole('list', { name: 'Notes' })
    .getByRole('button', { name: /Roadmap 2027/ })
    .click();
  await expect(
    page.getByRole('region', { name: /Linked from/ }).getByRole('button', { name: /Weekly/ }),
  ).toBeVisible();
});

test('notes: @ mentions show a task’s status and due date, open it, and list the note', async () => {
  const { page } = await launch();
  await page.getByLabel('Profile name').fill('Mentions');
  await page.getByRole('button', { name: 'Create profile' }).click();
  const taskId = await page.evaluate(async () => {
    const project = await window.api.projects.create({
      name: 'Website',
      color: 'blue',
      kind: 'software',
    });
    if (!project.ok) return '';
    const task = await window.api.tasks.create({
      title: 'Fix login',
      projectId: project.data.id,
      dueDate: '2030-01-15',
    });
    return task.ok ? task.data.id : '';
  });
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Note title').fill('Standup');
  const body = page.getByRole('textbox', { name: 'Note text' });
  await body.click();

  await page.keyboard.type('Blocked on @fix');
  const picker = page.getByRole('listbox', { name: 'Mention a task or project' });
  await expect(picker.getByRole('option').first()).toContainText('Fix login');
  await page.keyboard.press('Enter');
  const chip = body.getByRole('link', { name: /^Task: Fix login, To do, due / });
  await expect(chip).toBeVisible();
  await expect(chip.locator('.app-link__due')).toHaveText(/15/);

  // The chip follows the task: completing it shows Done.
  await page.evaluate(async (id) => {
    await window.api.tasks.setCompleted({ id, completed: true });
  }, taskId);
  await page.getByRole('button', { name: 'All notes' }).click();
  await page
    .getByRole('list', { name: 'Notes' })
    .getByRole('button', { name: /Standup/ })
    .click();
  await expect(body.getByRole('link', { name: /^Task: Fix login, Done/ })).toBeVisible();

  // Clicking opens the task, which lists this note; the note opens from there.
  await body.getByRole('link', { name: /^Task: Fix login/ }).click();
  const mentioned = page.getByRole('region', { name: 'Mentioned in' });
  await expect(mentioned.getByRole('heading')).toHaveText('Mentioned in 1 note');
  await mentioned.getByRole('button', { name: 'Standup' }).click();
  await expect(page.getByLabel('Note title')).toHaveValue('Standup');
  await expect(mentioned).toHaveCount(0);

  const saved = await page.evaluate(async () => {
    const list = await window.api.notes.list({});
    const note = list.ok ? await window.api.notes.get({ id: list.data[0]!.id }) : null;
    return note?.ok ? note.data.body : '';
  });
  expect(saved).toBe(`Blocked on [Fix login](projectforge://task/${taskId})\n`);
});

/** A real 1×1 PNG. */
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('notes: images and files are added, shown, described, saved, and kept after a restart', async () => {
  let { page } = await launch();
  const cspErrors: string[] = [];
  const watch = (p: Page) =>
    p.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) cspErrors.push(message.text());
    });
  watch(page);
  await page.getByLabel('Profile name').fill('Files');
  await page.getByRole('button', { name: 'Create profile' }).click();
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByLabel('Note title').fill('Trip');
  const body = page.getByRole('textbox', { name: 'Note text' });
  await body.click();
  const png = path.join(filesDir, 'map.png');
  const txt = path.join(filesDir, 'plan.txt');
  fs.writeFileSync(png, Buffer.from(PNG_1PX, 'base64'));
  fs.writeFileSync(txt, 'Day 1: arrive\n');

  // /file and /image show a prompt; its button opens the system's file picker.
  await page.keyboard.type('/file');
  await page.keyboard.press('Enter');
  let chooser = page.waitForEvent('filechooser');
  await body.getByRole('button', { name: 'Choose a file…' }).click();
  await (await chooser).setFiles(txt);
  await expect(body.getByRole('button', { name: 'Save a copy of plan.txt' })).toBeVisible();
  await page.keyboard.type('and /image');
  await page.keyboard.press('Enter');
  // Enter on the prompt opens the picker too (for keyboard users), once it shows.
  await expect(body.getByRole('button', { name: 'Choose an image…' })).toBeVisible();
  chooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await (await chooser).setFiles(png);
  const image = body.locator('.note-image img');
  await expect(image).toBeVisible();
  // It really loaded under the Content Security Policy: it has its pixel size.
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  await body.getByRole('textbox', { name: 'Image description (alt text)' }).fill('Route map');
  await page.keyboard.press('Enter');

  // Save a copy writes the same bytes (the test dialog saves into its folder).
  await body.getByRole('button', { name: 'Save a copy of plan.txt' }).click();
  await expect(page.getByText('Saved “plan.txt”.')).toBeVisible();
  expect(fs.readFileSync(path.join(dialogDir, 'plan.txt'), 'utf8')).toBe('Day 1: arrive\n');

  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const list = await window.api.notes.list({});
    const note = list.ok ? await window.api.notes.get({ id: list.data[0]!.id }) : null;
    return note?.ok ? note.data.body : '';
  });
  expect(saved).toMatch(
    /^\[plan\.txt\]\(projectforge:\/\/file\/[0-9a-f-]{36}\) and !\[Route map\]\(projectforge:\/\/file\/[0-9a-f-]{36}\)\s*$/,
  );

  // The preview shows the stored image too.
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('.markdown img[alt="Route map"]')).toBeVisible();

  // After a restart, the image is still there.
  await running[0]!.close();
  running.splice(0);
  page = (await launch()).page;
  watch(page);
  await nav(page).getByRole('button', { name: 'Notes' }).click();
  await page.getByRole('list', { name: 'Notes' }).getByRole('button', { name: /Trip/ }).click();
  const reopened = page.getByRole('textbox', { name: 'Note text' }).locator('.note-image img');
  await expect.poll(() => reopened.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  expect(cspErrors).toEqual([]);
});
