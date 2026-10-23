# Next features plan: 15 features in 7 releases

- **Status:** **Approved on 2026-10-22.** The product owner said: "d6: report and continue, d7: do what you recommend… just report and continue to me, no need for me to approve anything, i'll just check before you merge and push". The recommended options for D1–D7 apply. Work proceeds stage by stage with a report after each. Nothing is merged or pushed until the product owner has checked it.
- **Dates:** 2026-10-21; revised 2026-10-22.
- **Baseline:** `main` at 0.5.0 (`ee1f80f`), profile schema v5.
- **Requested by** the product owner:
  - the 15 features below, "arrange via acceptance criteria priority as you see fit, then plan";
  - revised: "add each updates that align with notes to a single release then proceed with the other updates".

## 1. How the order was chosen

**Notes come first, as one release.** All six notes features ship together as 0.6.0:
- the formatting bubble (#8);
- the outline sidebar (#3);
- more block types (#10);
- note links and backlinks (#1);
- mentions of tasks and projects (#2);
- images and attachments (#9).

This has three advantages:
- **One upgrade:** the two database changes (the link index and attachment storage) reach your profiles as one upgrade, not several.
- **Dependencies stay inside one release:** image blocks need attachments, and mentions reuse the link machinery.
- **One installer to try:** you get a single notes installer to review.

The cost is a long release. To manage that, it is built in **stages** on one branch (section 4). Each stage is committed and reported. If attachments, the riskiest stage, run long, you can choose to ship the finished stages first (decision D7).

**The other nine features** follow in themed releases, ordered by:
1. **Dependencies:**
   - covers reuse attachment storage;
   - templates include milestones;
   - custom fields need the task table to show their values.
2. **Value for daily use:** navigation, which is used constantly, comes before templates, which are used occasionally.
3. **Risk to data.**
4. **Grouping schema changes.**

Priority uses the MoSCoW words in [REQUIREMENTS.md](../REQUIREMENTS.md):
- **Should** means it is part of this plan's core value;
- **Could** means it is valuable but can slip without hurting the rest.

## 2. The order at a glance

| Release | Theme | Features (your numbers) | Priority | Schema change | Effort |
|---|---|---|---|---|---|
| **0.6.0** | **Notes** | 8 Formatting bubble, 3 Outline sidebar, 10 More block types, 1 Note links and backlinks, 2 Mention tasks and projects, 9 Images and attachments | Should (10: Could) | v6: link index and attachments (one upgrade) | XL (built in 6 stages) |
| 0.7.0 | Find and act fast | 5 Command palette, 4 Quick switcher | Should | None | M |
| 0.8.0 | Personal organisation | 11 Favourites, 12 Icons and covers (colour and image covers) | Could | v7: favourites, icon and cover columns | M |
| 0.9.0 | Planning | 6 Milestones (L1.2, L1.3) | Should | v8: milestones | M–L |
| 0.10.0 | History | 13 Activity log (L5.2) | Should | v9: activity events | M |
| 0.11.0 | Reuse | 7 Project templates (L4.1, L4.2) | Could | v10: templates | M |
| 0.12.0 | Data views | 15 Tasks as a table, 14 Custom fields | Should (table), Could (fields) | v11: custom fields | L |

**Effort:** **S** is a day or two of work, **M** about a week, **L** several weeks, and **XL** is the size of several L releases. All estimates include tests and docs.

**The activity log (0.10.0) comes after notes, palette, favourites, and milestones.** Its release therefore adds logging to the actions those releases created, including attachments. Everything after it, meaning templates, the table, and custom fields, logs its changes from day one.

**The table comes just before custom fields.** It is useful on its own with today's fields, and custom fields then appear in it as extra columns.

## 3. Rules every release follows

These are the same gates used for 0.3.0–0.5.0:

- **Process:**
  - a short plan, then your approval;
  - a feature branch, with an ADR in `docs/DECISIONS/`, a CHANGELOG entry, a version bump, and an installer;
  - **merge only when you say so**.
- **Tests:** component tests for new UI, service tests for new data rules, an end-to-end workflow per feature, and accessibility (axe) scans in both themes with the new UI open.
- **Data safety for schema changes:**
  - a forward-only migration after a verified snapshot;
  - a committed fixture of the previous schema, with an upgrade test;
  - new tables included in trash and restore, encrypted backups, the JSON export, and the backup manifest counts.
- **Security:** IPC inputs validated with zod, and no change to the Content Security Policy unless the ADR justifies it.
- **Release checks:** `npm run check`, `npm run test:e2e`, `npm audit --omit=dev`, and screenshot review in light and dark.

---

## 4. Release 0.6.0 — Notes

### Stages

The six features share one branch, `feature/notes-0.6`. They are built in this order, simplest and least risky first:

| Stage | Feature | Why at this point |
|---|---|---|
| 1 | #8 Formatting bubble | No data changes; it also adds the "Turn into" and link-editing parts later stages reuse |
| 2 | #3 Outline sidebar | No data changes; it gives long notes, and the tables added next, a way to navigate |
| 3 | #10 More block types: callout, toggle, table | No data changes, but it extends the Markdown codec, which stage 4 builds on |
| 4 | #1 Note links and backlinks | Adds the link index (first part of schema v6) |
| 5 | #2 Mention tasks and projects | Reuses stage 4's picker, chips, and index |
| 6 | #9 Images and attachments, plus the Image block for #10 | Riskiest; adds attachment storage (second part of schema v6) and the security changes |

**At the end of each stage:**
- the tests for that stage pass;
- the work is committed;
- I send you a short report of what was done, what was checked, and anything found.

I carry on to the next stage unless a decision is needed or something fails (decision D7).

**The data upgrade:** v6 is written as one migration once stages 4 and 6 are done, so your profiles upgrade once. While the stages are in progress, the migration only ever runs on test profiles.

### Stage 1 — #8 Formatting bubble — Should
A small toolbar above selected text in the visual editor.

**Acceptance criteria:**
1. **What it shows:** selecting text shows a bubble with Bold, Italic, Strikethrough, Inline code, Link, and Turn into (Text, Heading 1–3, lists, quote, and the stage 3 blocks once they exist).
2. **Where it never appears:** in read-only (archived) notes, in Markdown mode, inside code blocks, or for an empty selection.
3. **Links:**
   - The Link button opens an inline field.
   - Only `http`, `https`, `mailto`, and (from stage 4) the app's own note links are accepted.
   - An existing link can be edited or removed.
4. **Keyboard:** Alt+F10 moves focus into the bubble, which follows the toolbar pattern. Escape returns to the text.
5. **Placement:** it stays inside the window, flips below the selection near the top, and works in focus mode.
6. **Saving:** stored Markdown changes only as much as the formats themselves produce. A round-trip test covers each action.

### Stage 2 — #3 Outline sidebar — Should
A table of contents for the open note.

**Acceptance criteria:**
1. **The panel:** a toggleable "Outline" panel beside the note lists headings 1–3 in order, indented by level. It updates as you type, at most every 300 ms.
2. **Jumping to a heading:**
   - Clicking or pressing Enter on an entry scrolls to that heading, puts the cursor there, and highlights it briefly.
   - This works in both visual and Markdown preview modes.
3. **Following your place:** the heading you are currently in is marked with `aria-current`.
4. **When it hides:**
   - It is hidden in focus mode unless pinned, and below 900 px wide.
   - Its open or closed state is remembered per profile.
5. **Empty notes:** a note without headings says "Add a heading to build an outline".

### Stage 3 — #10 More block types (callout, toggle, table) — Could
**Acceptance criteria:**
1. **New blocks:** Callout (info, warning, success), Toggle (collapsible), and Table (add and remove rows and columns, header row). They are available from the slash menu and the bubble's Turn into.
2. **Storage:** each block has a defined Markdown form:
   - tables use GitHub-flavoured Markdown;
   - callouts use `> [!note]`, which Obsidian and GitHub also understand;
   - toggles use `<details>`, rendered safely and never as raw HTML.
3. **No lost content:** the existing lossless check is extended so notes containing these blocks open in the visual editor. Today, notes with tables fall back to Markdown mode.
4. **Accessibility:** tables can be used by keyboard, with Tab moving between cells. Toggles are buttons with `aria-expanded`.
5. **Older notes:** notes written before this release that contain tables now open visually. Their stored text does not change until they are edited.

### Stage 4 — #1 Note links and backlinks — Should
**Storage (decision D2):** a link is saved as a normal Markdown link with an app address, for example `[Roadmap](projectforge://note/<id>)`.
- Links survive renaming, because the id is fixed and the label shows the current title.
- Exported Markdown stays readable.
- Obsidian's `[[Title]]` form breaks when a title changes or two notes share a title.

**Acceptance criteria:**
1. **Inserting:**
   - Typing `[[` opens a note picker, which reuses the slash-menu machinery.
   - Choosing a note inserts a link chip showing its current title.
   - "Create note '…'" makes a new note and links to it.
2. **Following:** clicking a link opens the note. Ctrl+click opens it in focus mode.
3. **Broken links:** links to trashed or missing notes are struck through, say "Note not found", and never navigate. They work again if the note is restored.
4. **Backlinks:** each note has a "Linked from" section listing the notes that link to it, each with a short snippet around the link. It updates when either note is saved.
5. **Unlinked mentions:** notes that contain the title as plain text are listed separately, with a "Link" button that converts the text.
6. **Storage:**
   - Schema v6 adds a `note_links` index of source note, target type, and target id.
   - The index is rebuilt from the Markdown on every save, and fully from all notes during the migration.
   - The Markdown stays the source of truth.
7. **Moving data out and in:**
   - Exported Markdown keeps the links as text.
   - Imported notes with `projectforge://` links to unknown ids show the links as broken, never as errors.
   - Backup and restore keep links working.
8. **Security:** the `projectforge://` scheme is handled inside the app and never passed to the operating system.

### Stage 5 — #2 Mention tasks and projects — Should
**Acceptance criteria:**
1. **Inserting:** typing `@` opens a picker of tasks and projects, searched by title. It inserts a chip stored as `[Fix login](projectforge://task/<id>)`, or `project/` for a project.
2. **What a chip shows:** the current title, a status dot, and the due date when there is one. It updates when the task changes, without the note being saved again.
3. **Clicking a chip:**
   - A task chip opens the task details panel; a project chip opens the project.
   - Chips are reachable by keyboard, with accessible names such as "Task: Fix login, In progress, due 3 Nov".
4. **Trashed items:** a mention of a trashed item is shown as unavailable.
5. **Mentions on the task:** each task shows "Mentioned in N notes", with links, using the stage 4 index.

### Stage 6 — #9 Images and attachments, plus the Image block — Should (L5.4)
**Storage (decision D3):**
- Files are stored **inside the profile database** as blobs, up to 20 MB per file and 1 GB per profile.
- Encrypted backups, restore, and trash keep working unchanged, because a backup is still one file.
- A folder of files beside the profile would mean a new backup format and handling missing files.

**Acceptance criteria:**
1. **Adding images:** paste, drop, or `/image` adds an Image block. The Markdown stores `![alt](projectforge://file/<id>)`, and alt text can be edited.
2. **Other files:**
   - `/file`, or dropping a non-image, adds an attachment chip with its name and size.
   - "Save a copy…" writes the file to a chosen folder.
   - "Open" uses the default app, after a warning for executable types.
3. **What is accepted:**
   - Images in PNG, JPEG, GIF, and WebP.
   - SVG is not shown inline, because it can carry scripts; it can still be attached as a file.
   - The type is checked from the file's contents, not its extension.
4. **Safety:**
   - Files are never fetched from the internet; remote image addresses stay blocked.
   - The Content Security Policy gains exactly one scheme, for files the app serves.
   - Ids are UUIDs, so a file address can never reach outside its storage.
5. **Disk space and limits:**
   - Free space is checked before saving.
   - A failed save leaves no partial attachment.
   - The limits are shown before they are hit.
6. **Trash and cleanup:**
   - Files follow their note to the trash and back.
   - Files no longer used by any note are removed only after the trash retention period.
7. **Backup:** backups include attachments, and the manifest counts them. A test backs up and restores a profile with images and compares the bytes.
8. **Reuse:** the same storage later serves image covers (0.8.0).

### Release-level acceptance for 0.6.0
- **Data upgrade:**
  - The v5 → v6 upgrade is tested from a committed `profile-v5.db` fixture.
  - The upgrade builds the link index from existing notes.
  - Notes that contain tables, which today open in Markdown mode, open visually afterwards with their stored text unchanged.
- **One end-to-end workflow** covers the following, in order:
  1. write a note with a callout, a table, a link, a mention, and an image;
  2. back up the profile;
  3. restart the app;
  4. restore the backup into a new profile;
  5. check that everything is there and the links work.
- **Accessibility:** axe scans with the bubble, outline, pickers, and an image open, in both themes.

---

## 5. The other releases

### 0.7.0 — Find and act fast

#### #5 Command palette — Should
**Acceptance criteria:**
1. **Opening:** Ctrl+K opens a palette from any screen except dialogs. The sidebar search box keeps working.
2. **Actions:** typing filters actions:
   - New task, New note, and New project;
   - Go to Today, My tasks, Calendar, Projects, Notes, Trash, or Settings;
   - Toggle theme and Open shortcuts help;
   - on a project or note screen, also that item's own actions.
3. **Searching:** the last entry is always "Search everything for '…'".
4. **Keys:**
   - ↑ ↓ move, Enter runs, and Escape closes and returns focus to where it was.
   - Each action shows its shortcut, if it has one.
5. **Accessibility:** the palette uses combobox semantics like the slash menu, and axe reports no violations.
6. **Same behaviour as the buttons:** actions run through the same code as their buttons, so confirmations, undo, and saving pending note edits still happen.

#### #4 Quick switcher — Should
**Acceptance criteria:**
1. **Opening:** Ctrl+O, or typing in the palette without a leading `>`, lists matching projects, notes, and tasks. Each result shows its type, project, and folder.
2. **Speed:** search uses full-text search plus title prefix matching, and returns results within 100 ms with 5,000 tasks.
3. **Recent items:** with no text typed, it shows the 10 most recently opened items, stored per profile.
4. **Archived and trashed items:** archived items are hidden unless "Include archived" is on. Trashed items are never shown.
5. **Opening an item:** Enter opens it. Ctrl+Enter opens a note in focus mode.

### 0.8.0 — Personal organisation

#### #11 Favourites — Could
**Acceptance criteria:**
1. **Starring:** projects, notes, and (from 0.9.0) milestones can be starred from their ⋯ menu, right-click menu, or the palette.
2. **The sidebar section:**
   - A "Favourites" section appears at the top of the sidebar once anything is starred.
   - It can be reordered by drag and drop or by keyboard.
3. **Trash and archive:**
   - Trashing an item removes its star until the item is restored.
   - Archived items keep their star and show a badge.
4. **Storage:** schema v7 adds a `favourites` table, included in backup and export.

#### #12 Icons and covers — Could
**Acceptance criteria:**
1. **Icons:**
   - A project or note can have an icon from a built-in set of about 60 emoji and lucide icons, with no network fetch.
   - It is shown in the sidebar, lists, the palette, and page headers.
2. **Covers:**
   - A cover is either a colour or gradient preset drawn from the palette tokens (with a contrast test), or an image stored as an attachment (from 0.6.0).
   - Covers are readable in both themes.
3. **Removing:** Remove icon and Remove cover restore the default look.
4. **Storage:** schema v7 adds `icon` and `cover` columns to projects and notes, validated against the allowed lists.

### 0.9.0 — Planning

#### #6 Milestones — Should (L1.2, L1.3)
**Acceptance criteria:**
1. **What a milestone is:** a project has milestones, each with a name, description, target date, and completion. A task belongs to at most one milestone.
2. **Progress:** uses the project progress rules (R13) over the milestone's tasks. A milestone with no tasks shows "—", never 0%.
3. **Where milestones appear:**
   - a Milestones section and a milestone filter on the project page;
   - on the calendar, on their target dates;
   - on the dashboard, upcoming and overdue;
   - on Kanban cards;
   - later, as a column in the task table (0.12.0).
4. **Completing:**
   - Completing a milestone does not complete its tasks, and it can be reopened.
   - A milestone is overdue when its target date has passed and it is not complete.
5. **Trash:**
   - Trashing a milestone keeps its tasks.
   - Restoring the milestone restores its links to the tasks.
6. **Storage:** schema v8, covered by backup, export, and trash.

### 0.10.0 — History

#### #13 Activity log — Should (L5.2, before L5.1 version history; decision D4)
**Acceptance criteria:**
1. **What is recorded:**
   - Every change made through the app records an event: create, rename, change of status, priority, due date, milestone, or folder, archive, trash and restore, move, and attachment add or remove.
   - Each event stores when it happened, the item, the field, and the old and new values.
2. **Where it shows:**
   - Tasks and projects get an "Activity" tab, in plain sentences, newest first.
   - A profile-wide feed replaces "Recently updated" on the dashboard.
3. **No gaps:** each event is written in the same transaction as its change. A failed change leaves no event, and a successful one always has one.
4. **Notes:** edits to a note within 10 minutes are combined into one event; individual autosaves are not recorded.
5. **Retention:** configurable, 1 year by default, and included in backup and export.
6. **Speed:** listing an item's activity stays under 50 ms with 100,000 events.

### 0.11.0 — Reuse

#### #7 Project templates — Could (L4.1, L4.2)
**Acceptance criteria:**
1. **Built-in templates:** Software development, Personal productivity, and Study and learning. Each includes statuses, tasks, subtasks, tags, milestones, and starter notes.
2. **Saving your own:**
   - "Save as template" copies a project's structure without completion state or dates.
   - Dates can optionally be kept relative to the project's start date.
3. **Creating from a template:**
   - You see a preview first, and the template itself is never modified.
   - Creation is all or nothing.
4. **Managing templates:**
   - Templates can be renamed, deleted, exported, and imported.
   - Imported templates are validated with zod and limited in size.
5. **Storage:** schema v10, included in backups.

### 0.12.0 — Data views

#### #15 Tasks as a table — Should
**Acceptance criteria:**
1. **Where it appears:** a Table view beside List and Board, on project pages and on My tasks.
2. **Columns:**
   - title, status, priority, due date, start date, tags, milestone, project (on My tasks), and created and updated dates;
   - they can be shown, hidden, reordered, and resized, with the layout saved per view.
3. **Sorting and grouping:** sort by any column, and group by status, priority, milestone, or project.
4. **Editing:**
   - Edit cells inline, with the same validation and undo as the task panel.
   - Keyboard use follows the grid pattern.
5. **Speed:** 5,000 rows scroll smoothly, because rows are virtualised.
6. **Accessibility:** axe reports no violations while a cell is being edited.

#### #14 Custom fields — Could
**Acceptance criteria:**
1. **Field types:** per project, fields can be text, number, date, checkbox, single select, or multi select.
2. **Where values appear:**
   - in the task panel;
   - in the table, as columns that can be filtered, sorted, and grouped;
   - in templates;
   - in the activity log, which records their changes.
3. **Changing a field's type:** allowed only when every existing value converts. Otherwise the app explains which values block the change.
4. **Deleting a field:** asks first, and can be undone through trash.
5. **Storage:** schema v11, with `custom_fields` and `custom_values` tables, included in backup and export.

---

## 6. Decisions (all taken as recommended on 2026-10-22)

| # | Question | Recommendation |
|---|---|---|
| D1 | Palette and switcher (0.7.0): one component with modes, or two? | One component: Ctrl+K for actions, Ctrl+O to jump to an item |
| D2 | How links and mentions are stored | Markdown links with `projectforge://<note, task, or project>/<id>` |
| D3 | Where attachments are stored | Inside the profile database, which keeps backups a single file |
| D4 | Activity log before version history (changes the L5.2 → L5.1 dependency) | Yes; version history can be built later from the same events |
| D5 | Pace for the other releases: one at a time, with an approval at each | Yes |
| D6 | Pace inside 0.6.0: stop for approval after each stage, or report and continue? | Report and continue; stop only when a decision is needed or a check fails. You review the finished installer before the merge |
| D7 | If stage 6 (attachments) runs long, may stages 1–5 ship as 0.6.0, with attachments in 0.6.1? | Decide then. Splitting would mean two data upgrades, v6 then v7 |

## 7. Next step

Approve or adjust the order and decisions D1–D7. I then write the detailed plan for **0.6.0, stage 1 (formatting bubble)**, covering the files touched, the tests written first, and the end-to-end check, and start once you approve it.
