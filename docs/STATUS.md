# Project Status Log

Newest entries first.

## 2026-10-26 — Release 0.9.0, stage 6 (part 3): the Katha mark (banig weave)

Decisions are in [ADR-0026](DECISIONS/0026-brand-banig-weave.md). The product owner chose concept A of three (a banig weave, a bookmark K, and simplified heat bars).

**What was built:**
- **`brand/`:** the mark for light and dark backgrounds, a one-colour version, app icon tiles at 16, 24, 32, and 48+ px (each on whole pixels), and wordmarks. One script, `brand/make-marks.py`, generates them. `preview.html` shows every file at real sizes. Concept B is kept in `brand/explorations/`.
- **App icon:** `scripts/make-app-icon.cjs` (run in Electron, no new dependency) writes `build/icon.ico` (7 sizes) and a new `build/icon.png`. The old heat-bars icon is replaced; `scripts/make-icon.py` is kept with a "superseded" note.
- **In the app:** a `BrandMark` component replaces the Lucide hammer in the sidebar and on the first-run screen.
- **README:** the wordmark at the top, with a dark-mode version.
- **Lint:** `scripts/*.cjs` is linted without type information, like `eslint.config.mjs`.

**Checked:** all SVGs parse; each icon size was rendered and inspected at pixel level, on light and dark taskbar colours.

**Not checked:** a trademark search of the mark. GitHub may show the README wordmark in a fallback font (ADR-0026).

## 2026-10-26 — Release 0.9.0, stage 6 (part 2): the name Katha and the MIT licence

Decisions are in [ADR-0025](DECISIONS/0025-name-and-licence.md). The product owner chose both.

**Why:** the name ProjectForge is already used by Micromata's open-source project-management tool, and the public repository had no licence.

**What changed:**
- `productName` Katha, package `katha`, `appId` `com.katha.desktop`. The data folder is now `%APPDATA%\Katha` (`Katha-dev` in development).
- Every name the user sees: the window title, sidebar, first-run screen, About, file dialogs, default file names, and error messages.
- `LICENSE` (MIT) and `"license": "MIT"`. The README has a Licence section.
- **Kept on purpose** (stored in user data and files): the `projectforge://` link address, the backup, export, and template format IDs, the `.pfbackup` extension, and the `PROJECTFORGE_*` test variables.
- **Existing installs:** the README's new "Moving from a ProjectForge build" section moves the data by renaming the folder. A new end-to-end test (32) creates a profile and a project, moves the whole data folder, and opens both from the new place.
- **Docs:** README, CHANGELOG, ARCHITECTURE, TESTING, REQUIREMENTS, and the release checklist (Electron and name-freeze items done).

**Not changed:** the GitHub repository name (`Project-Organizer`), which is a GitHub setting.

**Defect found:** the images-and-files end-to-end test failed about 1 run in 6, on Electron 44.5.1 as well as 44.7.0, so it was older than these changes. Cause: Playwright intercepts file choosers only while something listens for them, and it turned interception off and on again between the test's two waits. A chooser opened in that gap was a real system window that nothing answered. One listener now keeps interception on for the whole test: 30 of 30 repeated runs pass.

## 2026-10-26 — Release 0.9.0, stage 6 (part 1): Electron and Vite updates, a test race fixed

**Updated (exact pins, each at least two weeks old):**
- **Electron 44.5.1 → 44.7.0:** the newest eligible 44.x, a release-checklist item. 44.7.1 (2026-10-13) was too new.
- **Vite 7.3.6 → 7.3.7 (development only):** fixes five advisories in the dev server and its editor launcher (GHSA-587h-7wmj-h5pm and others). Vite is not in the installer.

**Not yet updated:**
- **zod 4.6.7** meets the two-week rule at 16:29 UTC on 2026-10-26, not earlier. It is the rest of stage 6.
- **Electron advisory GHSA-jr5w-w6x2-84p9 (high):** a mitigation for compromised eMudhra certificates, fixed in 44.9.1, eligible on 2026-11-03. The app makes no network connections, so it is not exposed.
- **fast-uri below 3.1.9 (moderate):** used by electron-builder at packaging time only; not in the installer. 3.1.9 is eligible on 2026-11-02.

**Defect found:** the formatting bubble end-to-end test failed about 2 runs in 5, on both Electron 44.5.1 and 44.7.0. Cause: the test pressed Alt+F10 before the bubble had switched back from the link field to its tools, so the key was ignored. The test now waits for the tools first. The earlier comment's explanation (another window taking focus) was wrong and was replaced. 10 of 10 repeated runs pass.

**README:** "Known limitations" no longer lists milestones and note attachments as planned.

**Verification:** typecheck, lint, and formatting are clean. 626 of 626 unit and component tests pass. 31 of 31 end-to-end tests pass, in two consecutive full runs.

**Before a public release (decisions for the product owner):** the name ProjectForge is already used by an established open-source project-management tool (Micromata, GPLv3); and the project has no licence (`UNLICENSED`).

## 2026-10-24 — Release 0.9.0: stages 1–5 done, installer built for the product owner's check; the zod update is due on 2026-10-26

**Built:** milestones (v8), the activity log (v9), the task table, custom fields (v10), and project templates (v11), on `feature/milestones-0.9`. Details are in the stage entries below and in ADR-0020 to ADR-0024.

**Installer:** `release/ProjectForge Setup 0.9.0.exe`, built from the stage 5 commit.

**Open item (stage 6):**
- `npm audit --omit=dev` still reports GHSA-mrhx-c7xc-m3w5 (zod below 4.6.6, high).
- zod 4.6.7 was released on 2026-10-12, so it meets the two-week rule (SECURITY.md §6) on 2026-10-26.
- **Plan:** update the exact pin to 4.6.7, run every check and both end-to-end runs again, and rebuild the installer, all before the merge.
- **Exposure in the meantime:** zod checks input from the app's own sandboxed window and from files the user chooses (backups and, now, templates). The worst case is a crash on a crafted file.

## 2026-10-24 — Release 0.9.0, stage 5 of 6: project templates (schema v11)

Decisions are in [ADR-0024](DECISIONS/0024-project-templates.md).

**What was built:**
- **The template format:** `templateContentSchema`, a versioned and bounded format for template content.
- **Built-in templates:** Software development, Personal productivity, and Study and learning.
- **`TemplateService`:**
  - lists and previews templates;
  - saves a project as a template (without completion, with optional day offsets);
  - renames, deletes, exports, and imports templates (checked, with " (2)" for a taken name);
  - creates a project from a template in one transaction, through the usual services.
- **Schema v11:** the `templates` table, with a `profile-v10.db` fixture and an upgrade test.
- **Interface:**
  - the New from template picker, with its preview, start date, and name;
  - the Templates dialog;
  - "Save as template…" in the project ⋯ menu;
  - "New project from a template" in the palette.

**Found during the work:** the preview scrolls but could not be reached from the keyboard. Axe caught it (scrollable-region-focusable), and the preview is now a Tab stop.

**Verification for this stage:**
- 8 service tests, including all-or-nothing creation: a template whose last task is invalid leaves no project, task, tag, or activity behind.
- 3 component tests.
- A new end-to-end workflow (29).
- Axe scans of the three template dialogs, in light and dark.
- **Full checks:** typecheck, lint, and formatting are clean. 626 of 626 unit and component tests pass, with no unhandled errors. 31 of 31 end-to-end tests pass, in two consecutive full runs.

## 2026-10-24 — Release 0.9.0, stage 4 of 6: custom fields (schema v10)

Decisions are in [ADR-0023](DECISIONS/0023-custom-fields.md).

**What was built:**
- **Schema v10:** `custom_fields` and `custom_values`, with triggers for "same project" and "values leave with a moved task". A `profile-v9.db` fixture has an upgrade test.
- **`CustomFieldService`:**
  - values checked by type and options;
  - type changes that convert every value, or change nothing and name the blocking values;
  - option edits that clean up values.
- **Activity:** value changes are recorded as `custom:<name>`.
- **Trash:** fields go to the trash alone or with their project.
- **Interface:**
  - the Custom fields dialog (⋯ menu, palette, and "Manage fields" in task details);
  - the task panel's Fields section;
  - field columns on project tables, with sorting, grouping by choice or checkbox fields, a field filter, and editing in place with Undo.

**Defects found and fixed during the work:**
- **Nested dialogs closed together:** a confirmation inside a dialog closed the dialog around it, because React passes a `<dialog>`'s close event up the component tree. The shared `Dialog` now reacts only to its own close. The end-to-end workflow caught it, and a regression test fails without the fix.
- **Undo out of reach:** the trashed field's Undo was in a toast, which cannot be clicked while a modal dialog is open. It is now shown inside the dialog.
- **Choices lagged:** checkboxes and multiple choices in the panel changed only after the save round trip. They now change at once, as text fields already did. Screenshot capture caught it.

**Verification for this stage:**
- 9 service tests.
- 6 component tests, including the dialog regression test.
- A new end-to-end workflow (28).
- Axe scans of the Custom fields dialog and of task details with fields, in light and dark.
- **Full checks:** typecheck, lint, and formatting are clean. 613 of 613 unit and component tests pass, with no unhandled errors. 30 of 30 end-to-end tests pass, in two consecutive full runs.

## 2026-10-24 — Release 0.9.0, stage 3 of 6: tasks as a table

Decisions are in [ADR-0022](DECISIONS/0022-task-table.md). There is no schema change: layouts are the profile setting `taskTables`.

**What was built:**
- **`TaskTable`:** a virtualised WAI-ARIA grid on project pages (Table view) and on My tasks (List and Table switch).
  - Sorting, grouping, and inline editing through `tasks:update` and `applyUpdate`, with an Undo toast.
  - The Columns dialog, and keyboard and mouse resizing.
- **New read-only channels:** `statuses:listAll` and `milestones:listAll`, for names across projects.

**Found during the work:**
- **Columns lagged:** a change in the Columns dialog only showed after the save round trip, which the end-to-end workflow caught. Layout changes now show at once.
- **Title scrolled out of view:** the default widths were slightly wider than the page, so focusing a cell scrolled Title sideways. Screenshot review caught it. The defaults now fit, and focus scrolls only as far as needed.

**Verification for this stage:**
- 7 component and model tests, including 5,000 tasks with fewer than 60 rows rendered.
- A new end-to-end workflow (27).
- Axe scans of the table, the table while a cell is being edited, and the Columns dialog, in light and dark.
- **Full checks:** typecheck, lint, and formatting are clean. 596 of 596 unit and component tests pass, with no unhandled errors. 29 of 29 end-to-end tests pass, in two consecutive full runs.

## 2026-10-24 — Release 0.9.0, stage 2 of 6: activity log (schema v9)

**Scope change:** the product owner asked for all remaining features in one release ("Everything left"). The plan, `docs/plans/2026-10-21-next-features-plan.md` §8, is now six stages on `feature/milestones-0.9`. Milestones are stage 1, and decisions for this stage are in [ADR-0021](DECISIONS/0021-activity-log.md).

**What was built:**
- **Schema v9** adds `activity_events`, with a `profile-v8.db` fixture and an upgrade test.
- **`recordActivity`** is called inside the transaction of every write in the task, project, note, milestone, attachment, and trash services. Note renames and edits within 10 minutes merge.
- **Reading:** the activity service lists an item's events, a project's, and the profile's. It also applies retention and forgets permanently deleted items.
- **Interface:**
  - a reusable `Tabs` component (the WAI-ARIA tabs pattern);
  - Details and Activity tabs in task details, and Work and Activity tabs on project pages;
  - Recent activity on Today, replacing Recently updated;
  - an Activity history setting.

**Verification for this stage:**
- 9 service tests, including the atomicity check (a rollback after an event was written leaves neither) and 100,000 events under 50 ms.
- 4 component tests.
- A new end-to-end workflow (26).
- Axe scans of both Activity tabs, in light and dark.
- **Full checks:** typecheck, lint, and formatting are clean. 589 of 589 unit and component tests pass, with no unhandled errors. 28 of 28 end-to-end tests pass, in two consecutive full runs.
- **Also fixed: the slash-menu workflow.** It failed twice in full runs, because it measured the menu during its rise-in animation (800.19 px against an 800 px window). It now waits for the animation to finish first.

## 2026-10-24 — Release 0.9.0, milestones (schema v8), awaiting the product owner's check before merging

**Approval:** the product owner said "merge and push then continue 0.9.0". 0.8.0 was squash-merged and pushed as `2ad76b4`. The branch is `feature/milestones-0.9`, and decisions are recorded in [ADR-0020](DECISIONS/0020-milestones.md).

**What was built:**
- **Schema v8:**
  - a `milestones` table;
  - `tasks.milestone_id`, with database guards for "same project" and "top-level tasks only";
  - the `favourites` table rebuilt so milestones can be starred.
  - A committed `profile-v7.db` fixture has an upgrade test.
- **`MilestoneService`:** R13 progress over the milestone's tasks and their subtasks; the dashboard and calendar queries.
- **Trash:** milestones in the trash, alone or with their project.
- **Task service:** assigning, filtering, and clearing on move.
- **Interface:**
  - the project page's Milestones section and dialog;
  - the Milestone filter and the task details field;
  - board cards, the Today section, and calendar entries;
  - starred milestones, which open their filtered project.

**Defects found and fixed during the work:**
- **A stale milestone filter:** trashing a milestone while the list was filtered to it left an empty list. The end-to-end workflow caught it, and a milestone that is no longer shown now stops filtering.
- **The backup workflow's one-off hang (first noted in 0.6.0), explained:**
  - The test pressed Ctrl+, in the frame between the "Task added." toast and the New task dialog closing, while shortcuts are ignored because a dialog is open.
  - The test now waits for the dialog to close. For a person the window is one frame, so the app is unchanged.
- **The formatting-bubble workflow:** it failed twice in full runs with "inactive", because the window lost focus to another window. It now brings the window to the front before checking focus.

**Open item: a zod advisory.**
- `npm audit --omit=dev` now reports GHSA-mrhx-c7xc-m3w5 (high): zod below 4.6.6 can exhaust memory validating oversized constrained collections. It was published after the 0.8.0 check.
- The fix, zod 4.6.6 or 4.6.7, was released on 2026-10-11 and 12, so it does not yet meet the two-week rule (SECURITY.md §6).
- **Exposure:** zod checks input from the app's own sandboxed window and from backup files the user chooses, so the worst case is the app crashing on a crafted file.
- **Recommendation:** upgrade to 4.6.7 on or after 2026-10-26, before 0.9.0 is merged.

**Verification:**
- **Checks:** typecheck, lint, and formatting are clean. 574 of 574 unit and component tests pass (25 new), with no unhandled errors, in the final runs.
- **One unhandled error, not reproduced:** one earlier full run reported an unhandled error. It did not come back in 4 more runs, and its source was not captured.
- **End to end:** 27 of 27 pass, in two consecutive clean full runs. That includes one new workflow (25), and axe scans of the milestone dialog, a project with an overdue milestone, and Today with milestones, in light and dark.
- **Audit:** 1 high finding, the open item above.
- **Screenshots:** reviewed in light and dark. One change came out of it: the flags in Today's Milestones list were resized.
- **Test environment:** the laptop was very slow today, so the switcher's speed test now seeds its 5,000 tasks with SQL, and the My tasks paging test allows 30 s.
  - Both measured the same on 0.8.0's code, so the app has not slowed down.
  - The 100 ms search limit is unchanged.

## 2026-10-23 — Release 0.8.0, favourites, icons, and covers (schema v7), awaiting the product owner's check before merging

**Approval:** the product owner said "merge and push then continue to 0.8.0". 0.7.0 was squash-merged and pushed as `51bd8ec`. The branch is `feature/personal-0.8`, and decisions are recorded in [ADR-0019](DECISIONS/0019-favourites-icons-covers.md).

**What was built:**
- **Schema v7:** a `favourites` table, plus `icon` and `cover` columns on projects and notes. A committed `profile-v6.db` fixture has an upgrade test.
- **Services:** `FavouriteService` and `LooksService`. Cover images use the attachment store, and its clean-up now counts covers as in use.
- **Interface:**
  - the sidebar's Favourites section, reordered by drag and drop or from the keyboard menu;
  - icon and cover pickers;
  - covers above project and note titles;
  - icons in the sidebar, lists, and the palette;
  - a new right-click menu on projects.
- **Order of hidden favourites:** reordering keeps the place of favourites hidden while their item is in the trash. A first version gave the listed ones fresh positions, which would have scrambled the order on restore. A service test caught it before any UI existed.

**Pre-existing test noise fixed:**
- **What happened:** the component suite reported 8 "unhandled errors" while every test passed. This was already true on `main`, checked in a separate worktree.
- **Cause:** the fake backend answered `notes:update` with nothing, so the editor's autosave failed after some tests ended.
- **Fix:** it now answers with the saved note, like the real service, and the suite reports no errors.
- **Correction:** the 0.6.0 and 0.7.0 reports did not mention this, because the summary line used to check them left out the "Errors" line.

**Verification:**
- **Checks:** typecheck, lint, and formatting are clean. 557 of 557 unit and component tests pass (19 new), with no unhandled errors, run with 4 workers on battery.
- **End to end:** 26 of 26 pass, with one new workflow (24) and axe scans of the icon picker, the cover picker, and a project with an icon, a cover, and favourites, in light and dark.
- **Audit:** `npm audit --omit=dev` reports 0 vulnerabilities.
- **Screenshots:** reviewed in light and dark. One change came out of it: on the project page, the icon showed both on its tile and beside the title, so the title now shows the colour swatch only when there is no icon.

## 2026-10-23 — Release 0.7.0, command palette and quick switcher, awaiting the product owner's check before merging

**Approval:** the product owner said "start 0.7.0" after 0.6.0 was merged (`d41c91c`). The branch is `feature/palette-0.7`, and decisions are recorded in [ADR-0018](DECISIONS/0018-command-palette-and-switcher.md).

**What was built:**
- **Command palette:** Ctrl+K, with actions for every screen, plus the open note's or project's own actions. These reuse the exact `MenuItem` lists their buttons use, so confirmations and saving pending edits are unchanged.
- **Quick switcher:** Ctrl+O, served by a new `SwitcherService` with three IPC channels. Recent items are kept per profile in the `settings` table, so there is no schema change.

**Defect found and fixed during the work:**
- **What happened:** group headings were linked by IDs made from the group name. "Project: Website" contains a space, which `aria-labelledby` reads as two IDs, so the group had no accessible name.
- **How it was found:** the new end-to-end workflow.
- **Fix:** IDs now use the group's position. The component test checks the name itself, not just the attribute.

**Verification:**
- **Checks:** typecheck, lint, and formatting are clean. 538 of 538 unit and component tests pass (20 new), run with 4 workers on battery.
- **End to end:** 25 of 25 pass, with one new workflow (23) and axe scans of the palette in both modes, in light and dark.
- **Audit:** `npm audit --omit=dev` reports 0 vulnerabilities.
- **Screenshots:** the palette was captured and reviewed in light and dark, at 1280×800 and at the minimum window size of 900×600.
- **Speed:** the switcher measured 3–40 ms with 5,000 tasks. Once, under four parallel test workers on the capped CPU, a single reading went past 100 ms. The test now takes the best of three runs per query, which still catches a truly slow query.
- **Also during the run:** the formatting-bubble workflow failed once with "inactive": the window lost focus while lint ran beside the suite. It passed alone and in a clean full run.

## 2026-10-23 — Notes release 0.6.0, all six stages done, awaiting the product owner's check before merging

**Approval:** the plan was approved on 2026-10-22 with all recommended options. Work continues stage by stage with a report after each; the product owner checks before any merge or push. The branch is `feature/notes-0.6`, and decisions are recorded in [ADR-0017](DECISIONS/0017-notes-release-0.6.md).

**Stage 1 — formatting bubble:** done; see ADR-0017.

**Defect found and fixed:**
- **What happened:** opening a note that ends in a list marked it unsaved once the bubble existed. BubbleMenu's options were re-sent as a transaction on every render, letting the editor add a trailing paragraph.
- **How it was found:** an existing end-to-end workflow.
- **Fix:** the options are now created once, and a regression test covers this.

**Verification:**
- `npm run check` passes: 406 of 406 tests (13 new), plus typecheck, lint, and formatting. The unit suite was run with 4 workers, explained below.
- `npm run test:e2e` passes: 19 of 19, with one new workflow and new accessibility scans.

**Note on the test environment:**
- The laptop was on battery with the CPU capped at 1.2 GHz.
- With the default worker count, five timing-sensitive tests in unrelated files timed out: calendar, task paging, and encryption key derivation. They pass alone, and the whole suite passes with `--maxWorkers=4`.
- No test timeouts were changed.

**Stage 2 — outline sidebar:** done.
- **What it does:** the Outline button shows a panel of headings 1–3. Choosing one jumps there, and the current heading is marked.
- **Setting:** whether it shows is remembered per profile in the new `noteOutline` setting. Settings are key–value pairs, so there is no schema change.
- **Fix made alongside:** `DocumentEditor` now reports an edit only when the transaction itself changed the document. This removes the cause behind stage 1's defect.

**Verification (stage 2):**
- **Typecheck, lint, and formatting:** all pass.
- **Unit tests:** 417 of 417 pass, with 4 workers because the laptop is still on battery.
- **End to end:** 20 of 20 pass, including the new outline workflow and an accessibility scan of the outline.

**Stage 3 — callout, toggle, and table blocks:** done.
- **What they are:** each has one exact Markdown form: GitHub alerts, `<details>`, and GitHub tables. Anything else still opens in Markdown mode.
- **Notes with tables:** these now open in the visual editor.
- **Preview:** it renders callouts and toggles by building elements from the parsed text, with no raw HTML.
- **New dependency:** `@tiptap/extension-table` 3.31.4, first-party and build-time only.

**Defects found and fixed in stage 3:**
- **Blocked inline styles:** the table extension writes inline `style` attributes, which the Content Security Policy blocks, so column alignment would not have shown. Tables now render without inline styles, and an end-to-end check fails on any policy message.
- **Stray blank lines:** these appeared around tables inside toggles and callouts, and at the start of notes that begin with a table.

**Test corrections, not product defects:**
- An unescaped `|` in table code: GitHub splits the cell there. The lossless check correctly kept such a note in Markdown mode, and the test now covers that.
- Ctrl+End in Chromium can land inside a toggle. The workflow now leaves the toggle with Enter on an empty line, which is the designed way.

**Verification (stage 3):**
- **Typecheck, lint, and formatting:** all pass.
- **Unit tests:** 448 of 448 pass, with 4 workers because the laptop is on battery.
- **End to end:** 21 of 21 pass.
- **`npm audit --omit=dev`:** 0 vulnerabilities.

**Stage 4 — note links and backlinks:** done.
- **Links:** `[[` links to a note, or creates one. Links are saved as `[Title](projectforge://note/<id>)` and show the current title; missing ones are broken until the note is restored.
- **Backlinks:** "Linked from" and "Unlinked mentions" (with "Link") appear below each note.
- **Schema v6:** a `note_links` index, built for existing notes when a profile opens. There is a committed `profile-v5.db` fixture with an upgrade test.
- **New channels:** `notes:backlinks`, `notes:linkMention`, and `links:resolve`.

**Defects found and fixed:**
- **Picker order:** title matches now rank first.
- **Accessible name:** the preview's missing-link name ran words together.
- **Editor hint:** its wording is updated for link chips.

**Verification (stage 4):**
- **Typecheck, lint, and formatting:** all pass.
- **Unit tests:** 479 of 479 pass, with 4 workers on battery power.
- **End to end:** 22 of 22 pass.

**Stage 5 — mentions of tasks and projects:** done.
- **The `@` picker:** it lists tasks and projects.
- **Task chips:** they show a status dot and due date, update as the task changes, and open the task details panel. Project chips open the project.
- **Task details:** they list "Mentioned in N notes".
- **New channel:** `links:mentionedIn`. There is no schema change: mentions use stage 4's v6 index.

**Verification (stage 5):**
- **Typecheck, lint, and formatting:** all pass.
- **Unit tests:** 487 of 487 pass, with 4 workers on battery power.
- **End to end:** 23 of 23 pass.

**Stage 6 — images and attachments:** done.
- **Adding files:** paste, drop, `/image`, or `/file`.
- **Storage:** files are stored in the profile database (schema v6 `attachments`), with types decided from contents.
- **Limits:** 20 MB per file and 1 GB per profile, with a disk-space check.
- **Cleanup:** files no note refers to are removed after 30 days.
- **Executables:** they can be saved, never opened.
- **Content Security Policy:** the only change is `img-src blob:`.

**Defects found and fixed in stage 6:**
- **Lone images:** an image alone on its line opened the note in Markdown mode.
- **Image merged into a paragraph:** the first fix merged such an image into the paragraph before it (caught by the lossless check; found in screenshot review).
- **Small buttons:** the file chip's buttons were under the 24 px target size (found by the accessibility scan).

**Fix after the product owner's review (2026-10-23):**
- **Problem:** after `/file`, the mouse pointer stayed hidden in the file window.
- **Cause:** Windows' "Hide pointer while typing", with the window opening on the same keystroke. It was reproduced on their PC with real keystrokes.
- **Fix:** `/image` and `/file` now show a prompt whose "Choose…" button opens the window. Enter still works for keyboard users.
- **Verified:** with real typing and a real click, the pointer shows in the file window.
- **Test stability (not product defects):**
  - The blocks workflow pressed Enter before the editor had registered a click. It now waits for the editor's cursor.
  - The backup workflow hung once at its 30-second limit, during a full run on a CPU throttled to 1.2 GHz on battery. It passed in 4 runs on its own and in the next full run (24 of 24); it is noted here in case it comes back.

**Release 0.6.0:**
- The version is bumped and the CHANGELOG is complete.
- The installer is built: `release/ProjectForge Setup 0.6.0.exe`.
- Branch `feature/notes-0.6` is **not merged or pushed**; the product owner checks first.

**Verification (whole release, 2026-10-23):**
- **Typecheck, lint, and formatting:** all pass.
- **Unit tests:** 513 of 513 pass, with 4 workers on battery power.
- **End to end:** 24 of 24 pass, including the accessibility scans in both themes.
- **`npm audit --omit=dev`:** 0 vulnerabilities.

**Before installing:** make a backup (Settings → Backup and restore). Opening a profile upgrades it to schema v6, after a verified snapshot.

## 2026-10-21 — Slash commands (version 0.5.0), awaiting merge approval

**Approval:** the product owner asked for Phase 3 without a plan review ("no need for approval, just do it and do what you recommend"). The merge into `main` still waits for their approval. The work is on `feature/slash-commands`, branched from `main` at 0.4.0 (`610bccf`). Decisions are recorded in [ADR-0016](DECISIONS/0016-slash-commands.md).

**Scope completed:**
- **Slash menu:** `/` at the start of a line or after a space. It filters by name and keywords and is driven by the keyboard (↑ ↓ Enter Tab Escape) or the mouse.
- **Ten commands:** Text, Heading 1–3, the three list types, Quote, Code block, and Divider. Commands an editor cannot show are left out.
- **Closed when it should be:** inside words, code blocks, read-only notes, and Markdown mode.
- **Hint:** "Type / for commands" on an empty line.
- **Dependencies:** `@tiptap/suggestion` 3.31.4 is new. `@tiptap/extensions` was already installed and is now declared. Both are dev (build-time) dependencies.
- **No data changes:** the commands produce blocks notes already store as Markdown.
- **Version 0.5.0** and a CHANGELOG entry.

**Defects found and fixed during the work:**
- **Enter straight after typing could start a new line:** the plugin reports an empty "loading" list before the items, so Enter in that moment would not have run the command. The list is now computed at once, and a component test fails without this.
- **Stale state in the key handler:** the handler read state that React might not have rendered yet. The menu's state now lives in an external store.
- **Scrollable list not keyboard-focusable:** found by the new axe scan of the open menu (WCAG 2.1.1). The list is now focusable.
- **Test timing (not a product defect):** Tiptap's `focus()` waits a frame, so early test key presses sometimes missed the editor. The tests now focus synchronously and assert it.

**Verification (2026-10-21):**

| Check | Result |
|---|---|
| `npm run check` (typecheck, lint, formatting, unit tests) | Passed — 393 of 393 (15 new slash-command component tests) |
| `npm run test:e2e` | Passed — 18 of 18, including the new slash-command workflow and accessibility scans of the open menu in both themes |
| Regression tests | The Enter-while-loading and Escape-in-focus-mode tests were each confirmed to fail without their fix |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Screenshots (production build, light and dark) | Menu open with a highlight, flipped above the cursor near the bottom of the window, the "no matches" state, and the empty-line hint |

**Known limitations:**
- Only blocks that notes can store as Markdown; no tables or images yet.
- No grouping or recent commands.
- No manual screen-reader pass.

**Next step:** the product owner reviews the 0.5.0 installer and approves the merge into `main`.

## 2026-10-21 — Notes library and views, archiving, colour themes, tag management, right-click menus (version 0.4.0), awaiting merge approval

**Approval:** the product owner approved all recommended options ("do all of the recommended"):
- the secondary colour is the background tone;
- archived notes are read-only;
- right-click menus are on Notes only;
- 0.3.0 is merged first.

0.3.0 was fast-forwarded into `main`, which is not pushed. This work is on `feature/notes-views-archive-theme`. Decisions are recorded in [ADR-0015](DECISIONS/0015-notes-views-archive-colours-menus.md).

**Scope completed:**
- **Notes library and note view:** sort, an Archived filter, and richer rows. The note view adds focus mode (Ctrl+Shift+F, Escape).
- **Archived notes:** schema v5 (`notes.archived_at`). They are read-only with an Unarchive banner, hidden from lists and counts, and still found by search. Archive and Unarchive can be undone.
- **Colour themes:** six primary colours and three background tones per profile. The palette data and contrast test live in `src/shared/palettes.ts`.
- **Settings → Tags:** usage counts, edit, and delete with a confirmation naming where the tag is used.
- **Right-click menus:** note rows and folders, also opened with Shift+F10 or the Menu key. The new `useContextMenu` and `MenuList` are shared with the ⋯ menus, and `useNoteActions` is shared by the list and the editor.
- **Version 0.4.0**, with a CHANGELOG entry, a committed `profile-v4.db` fixture, and an upgrade test.

**Defects found and fixed during the work:**
- **Wrong note after Duplicate (data risk):** the note view reused the previous note's data while the next loaded. After Duplicate it showed the original's text under the copy's address, and edits would have saved there.
  - Found by the end-to-end duplicate test.
  - The view is now keyed by note.
  - A component test fails without the fix.
- **Unarchiving re-saved the note:** Tiptap's `setEditable` reports an update by default, so the note was reformatted and saved.
  - Found by the end-to-end archive test (the close was held for an unexpected save).
  - Fixed with `setEditable(…, false)`.
  - A component test fails without the fix.
- **Escape did not leave focus mode from inside the editor:** ProseMirror marks Escape as handled, and the handler ignored handled events.
  - Found end to end. jsdom does not reproduce it, so the end-to-end test guards it.
- **Palette left on the profile screen:** a palette left from a profile could be for the other mode, giving light text on light surfaces. Found in screenshot review; the profile screen now resets it.
- **Note details still shown in focus mode:** a `hidden` attribute lost to `display: grid`. They are no longer rendered in focus mode.
- **Archived banner icon** stretched by `.notice`'s first-child rule.
- **Refs in render:** a lint rule (refs read during render) led to `MenuButton` building its items when it opens.

**Verification (2026-10-21):**

| Check | Result |
|---|---|
| `npm run check` (typecheck, lint, formatting, unit tests) | Passed — 378 of 378 (65 new, including 38 palette contrast and drift tests, archive, sort, tag-usage, and settings service tests, a v4 upgrade test, and component tests for the views, focus mode, archived notes, right-click menus, Tags, and Appearance) |
| `npm run test:e2e` | Passed — 17 of 17, including two new workflows and accessibility scans of the library, its right-click menu, focus mode, and Settings with a non-default palette, in both themes |
| Contrast | All 36 palette combinations ≥ 4.5:1 for every text token on every surface (lowest 4.93:1); the test was confirmed to fail on an unreadable colour |
| `npm audit --omit=dev` | 0 vulnerabilities; no new packages |
| Screenshots (production build) | Library with right-click menu, note view, focus mode, archived note, Settings (teal/warm dark, violet/warm light), library at 760 px; no page errors, no sideways scrolling |

**Known limitations:**
- Right-click menus exist only on Notes.
- Palettes are presets.
- Folders are flat.
- No manual screen-reader pass.

**Next step:** the product owner reviews the 0.4.0 installer and approves the merge into `main`. Phase 3 (slash commands) waits for approval.

**Update:** 0.4.0 was fast-forwarded into `main` and pushed (`610bccf`) on 2026-10-21 with the product owner's approval.

## 2026-10-21 — Note actions, Markdown import, and note folders (version 0.3.0), awaiting merge approval

**Approval:** the product owner approved the actions-menu plan with its recommended options:
- the menu sits at the top of the open note only;
- exports put the title as a heading, then the body.

They added Markdown import and note folders, and approved "everything … up until you commit and have a new build". The merge waits for their approval, so the work is on the branch `feature/note-actions-import-folders`. Decisions are recorded in [ADR-0014](DECISIONS/0014-note-actions-import-and-folders.md).

**Scope completed:**
- **Note actions menu:** Rename, Duplicate, Copy as Markdown, Export as Markdown…, and Move to trash… (now asks first). Each action saves pending edits first.
- **Markdown import:** from the Import Markdown button, by dropping files on the Notes screen, or by pasting copied files. One validated channel creates all the notes or none.
- **Note folders:**
  - schema v4 (`note_folders` and `notes.folder_id`);
  - folder filters with counts, plus folder rename and delete on the Notes screen;
  - a Folder field on each note;
  - new and imported notes go to the folder being viewed;
  - included in backups and JSON exports.
- **Shared folder dialog:** the folder name dialog is shared by project folders and note folders.
- **Version 0.3.0** and a CHANGELOG entry. The entry also covers the interface refresh, visual note editing, and the dropdown fix since 0.2.0.

**Defects found and fixed during the work:**
- **Long folder names** widened the folder list under the note panel at 1280 px, hiding the counts (found in screenshot review). They now end with an ellipsis.
- **Invisible character:** a literal byte-order-mark character was written into source code instead of an escape. Lint caught it; the code now uses `String.fromCharCode(0xfeff)`.

**Verification (2026-10-21):**

| Check | Result |
|---|---|
| `npm run check` (typecheck, lint, formatting, unit tests) | Passed — 313 of 313 (36 new: 11 service tests, 2 upgrade tests from a new committed `profile-v3.db` fixture, 9 Markdown file tests, and 14 component tests for actions, folders, and import) |
| `npm run test:e2e` | Passed — 15 of 15. A new test covers: folder → import two files (one with Windows line endings) → duplicate → copy (system clipboard read back) → export (file content checked) → trash with confirmation → restart → delete folder (notes kept). The accessibility scan now includes a note folder and the open actions menu, in both themes. |
| `npm audit --omit=dev` | 0 vulnerabilities; no new packages |
| Screenshots (production build) | Actions menu and folders at 1280 px and 760 px in light and dark; no sideways scrolling; no page errors |

**Known limitations:**
- Folders cannot be nested or reordered.
- Imported notes are copies, not linked to their files.
- Images in imported Markdown are kept as text and the note opens in Markdown mode.
- No manual screen-reader pass.

**Next step:** the product owner reviews the installer and approves the merge into `main`. Phase 3 (slash commands) waits for approval.

## 2026-10-21 — Notes editor integration (editor track, Phase 1), awaiting review

**Approval:** the product owner approved the plan and its recommended options ("go ahead with the recommended options"):
- notes with tables open in Markdown mode;
- Preview stays inside Markdown mode only.

Decisions are recorded in [ADR-0013](DECISIONS/0013-visual-note-editing.md).

**Scope completed:**
- **Visual editing:** notes are edited in the document editor and still stored as Markdown. No schema, IPC, or service changes.
- **Safety check:** before a note opens visually, it is converted and compared as a Markdown syntax tree. If anything would be lost (tables, images, raw HTML, reference links), the note opens in Markdown mode with a notice and is not rewritten. Opening a note never saves it.
- **Modes:** Visual and Markdown (Write/Preview). Switching carries unsaved text across.
- **Saving:** visual edits are converted to Markdown only when saving. Autosave, Ctrl+S, and the leave and close guards are unchanged.
- **Formats:** strikethrough, inline code, checklists, dividers, links (Ctrl+click opens web and mail links), and headings 1–6.

**Defects found and fixed during the work:**
- Saved notes gained trailing blank lines from the editor's trailing empty paragraph. They are now trimmed; a unit test and the new end-to-end test cover it.
- One planned test expected `file:` links to keep a note in Markdown mode. Checking Tiptap showed it renders such links with an empty `href`, so they are inert and the text is kept. The test now asserts that instead.

**Verification (2026-10-21):**

| Check | Result |
|---|---|
| `npm run check` (typecheck, lint, formatting, unit tests) | Passed — 277 of 277: 19 new codec tests, 9 visual editor tests replacing 5 Markdown-only ones |
| `npm run test:e2e` | Passed — 14 of 14, including a new visual workflow (Markdown shortcuts and Ctrl+B → autosave → leave and reopen → restart → stored Markdown checked) and an accessibility scan of the visual editor in both themes |
| `npm audit --omit=dev` | 0 vulnerabilities |
| New packages | 2 (`@tiptap/markdown`, `marked`), both MIT, no install scripts |
| Hands-on check (scripted, production build and production security policy) | Rich note opens in Visual mode. Ticking a checkbox and typing both save, and the stored Markdown is correct. The table note opens in Markdown mode with the notice. No injected style tag. No page errors. No sideways scrolling at 1280 px or 760 px in light or dark. |

**Known limitations:**
- Tables and images cannot be edited visually.
- `snake_case` typed visually is stored as `snake\_case`, which is visible in Markdown mode.
- Links can be created only by typing or pasting a URL; there is no link dialog.
- The production renderer bundle grew from 1.43 MB to 2.42 MB.
- No manual screen-reader pass. Nothing is committed.

**Next step:** product owner review. Phase 2 (note actions menu) waits for approval.

## 2026-10-21 — Document editor prototype (Phase 1) and dropdown colour fix

**Approval:** the product owner approved the plan and the dropdown fix ("approve all"). Decisions are recorded in [ADR-0012](DECISIONS/0012-block-editor.md).

**Scope completed:**
- **`DocumentEditor`:** a reusable block-based editor built on Tiptap 3.31.4.
  - A title field above the body, and an accessible formatting toolbar.
  - Formats: headings 1–3, bold, italic, bulleted and numbered lists, quotes, code blocks, undo and redo.
  - Takes initial content and reports changes as JSON through `onChange`.
  - The configuration lives in `editor-config.ts`, apart from the components.
- **Editor lab:** a development-only screen for trying the editor. It is not in production builds, and neither is Tiptap (it is loaded with a dynamic import).
- **Dropdown fix:** dark-mode dropdown lists were white text on white, because a transparent select gave the list no background. The options now use the theme's colours on every screen.

**Not in this phase:** saving, connecting the editor to Notes, `/` commands, the note actions menu, and converting Markdown notes.

**Verification (2026-10-21):**

| Check | Result |
|---|---|
| `npm run check` (typecheck, lint, formatting, unit tests) | Passed — 254 of 254 (7 new editor tests) |
| `npm run test:e2e` | Passed — 13 of 13, on the final production build |
| `npm audit --omit=dev` | 0 vulnerabilities. The full audit lists 9 existing issues in build tools (`electron-builder`, `vite`), none from Tiptap. |
| New packages | 51, all MIT, none with install scripts |
| Hands-on check (scripted, development renderer) | Markdown shortcuts, nested lists, bold and italic, quotes, code blocks keeping indentation, undo, toolbar state following the cursor, Enter from title to body, toolbar reached by Tab. No page errors. Tiptap injected no `<style>` tag. No sideways scrolling at 1280 px or 420 px in light or dark. Dark dropdown options measured at `#222731` background with `#e6e9ee` text. |

**Known limitations:**
- The hands-on check ran under the development security policy. `injectCSS: false` was confirmed (no injected style tag), but the editor has not been run under the production policy, because the lab is not in production builds.
- At narrow widths the sidebar does not collapse, which leaves little room for the editor. This existed before this phase.
- No manual screen-reader pass. Nothing is committed.

**Next step:** product owner review of the prototype in `npm run dev` (sidebar → Editor lab).

## 2026-10-20 — Interface refresh (UI/UX modernisation)

**Request:** the product owner asked for a UI/UX modernisation that keeps the features, the local-only design, and the zero-cost constraints. Decisions are recorded in [ADR-0011](DECISIONS/0011-interface-refresh.md).

**Method:**
1. Captured every screen and dialog with realistic data (19 screenshots).
2. Listed the problems and set the direction.
3. Changed tokens, then the shell, then the screens.
4. Captured everything again in light and dark at 1280×800 and 960×640, and fixed what the captures showed.

**Scope completed:**
- **Foundation:** refined tokens (surfaces, text, type scale, radii, shadows, motion), checked for contrast in both themes.
- **Shell:** a grouped sidebar with a brand mark, a search field showing its shortcut, and a footer for Trash, Settings, and the profile.
- **Shared components:** `PageHeader` on every screen, `EmptyState`, and an accessible `MenuButton`. Lists sit on panels; filters became compact toolbars; segmented controls replace pill toggles.
- **Project page:** a summary panel, a breadcrumb, and a "More project actions" menu.
- **Other screens:** Projects with folder menus and richer rows; Settings in cards; an aligned Workflow dialog; a first-run card; refreshed Trash, Search, Notes, Calendar, and task panel.

**Defects found and fixed:**
- **Long project names** broke the sidebar list: it scrolled sideways and left a blank highlighted row. This existed before the refresh.
- **The whole window could scroll** and leave a blank strip under the sidebar. Screen-reader-only text and hidden inputs had no positioned container.
- **One-column grids** let long note excerpts widen the Notes list past its column.
- **The new theme radios** were not clickable by tests, because their inputs ignored the pointer.
- **Success-green badge text** was 4.4:1 on its tint; it was darkened.

**Verification (2026-10-20):**

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint`, formatting (all files except the untracked `PROJECT_STATUS_REPORT.md`) | Passed |
| `npm test` | Passed — 247 of 247 (3 new: menu keyboard behaviour). One assertion was updated: the dashboard summary now uses "·" separators. The 500-row paging test was given a 15-second limit: about 2 s normally, but over 5 s on a busy machine, as also seen before the refresh. |
| `npm run test:e2e` | Passed — 13 of 13, including the accessibility scan of every screen in both themes. One step was updated: Archive is now in the project's menu. |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Contrast | Every text token on every surface ≥ 4.5:1 (lowest 5.1 light, 4.9 dark) |

**Known limitations:** form-field borders are about 1.6:1 against white, below the 3:1 WCAG guideline for component boundaries (ADR-0011). No manual screen-reader pass has been done yet. The installer has not been rebuilt for this change. Nothing is committed.

**Next step:** product owner review of the refreshed interface.

## 2026-10-20 — Kanban board (L1.1) and calendar (L3.4) implemented — version 0.2.0

**Approval:** the product owner accepted the Notes decisions ("the changes you made are good enough") and gave the go-ahead: "do the kanban and calendar".

**Scope completed:**
- **Kanban board:** a List/Board switch on each project. Columns follow the project's workflow. Cards move by drag and drop or with a keyboard-accessible Move dialog.
- **Atomic moves:** a new channel, `tasks:moveOnBoard` (72 channels in total), changes the status and the position together.
- **Calendar:** month, week, and day views of due dates, with an overdue notice and list, and project and done/cancelled filters. Selecting an entry opens the task.
- **Version:** 0.2.0, covering Notes, Kanban, and Calendar.
- **Decisions:** recorded in [ADR-0010](DECISIONS/0010-kanban-and-calendar.md).

**Decisions made within the go-ahead (see ADR-0010):**
- The board is per project, because each project has its own workflow.
- Cards are top-level tasks; subtasks appear as a count on their parent's card.
- The board has no filters.
- Calendar entries are due dates only, because milestones (L1.2) and recurring occurrences (L3.1) do not exist yet. This is the conflict noted when the priority order was recorded; it is now documented in the requirement row.
- The calendar's first weekday comes from the Windows locale.
- No new dependencies.

**Defects found and fixed during the work:** screenshot review found two calendar layout problems, both fixed:
- long task titles spilled into neighbouring day cells, and caused sideways scrolling at 1024×700;
- the "N more" button was unstyled.

**Verification (2026-10-20):**

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint`, formatting (all files except the untracked `PROJECT_STATUS_REPORT.md`) | Passed |
| `npm test` | Passed — 244 of 244 (12 new: 3 board service, 4 board component, 5 calendar, including a daylight-saving time zone) |
| `npm run test:e2e` | Passed — 13 of 13, including Kanban (Move dialog and real drag and drop, persisted across restart), Calendar (a due-date change moves the entry), and accessibility of the board, Move dialog, and the three calendar views in both themes |
| Visual review | Board and calendar at 1280×800 and 1024×700, light and dark |

**Not done:** Calendar has no drag-to-reschedule (change the due date in the task panel instead). Nothing is committed.

**Next step:** build the 0.2.0 installer and update the installed app (see the README section "Updating to a new version").

## 2026-10-20 — Notes (L1.5) implemented (awaiting review)

**Approval:** the product owner said "let's go build it" after the priority order was recorded. Notes, the first item, was built. Kanban and Calendar were not started; each still needs its own go-ahead.

**Scope completed:**
- Profile schema v3: `notes`, `note_tags`, full-text search on title and body.
- Notes service (create, edit, move, tags, list with project, tag, and text filters) and 7 IPC channels (71 in total).
- Notes screen: filterable list beside the editor; Write and Preview modes; autosave; Ctrl+S.
- A Notes section on each project page.
- Notes included in global search, the trash (alone or with their project), encrypted backups (counted in the manifest), and JSON exports.
- Requirements covered: R26 and L1.5 ([REQUIREMENTS.md](REQUIREMENTS.md)).

**Decisions for review** ([ADR-0009](DECISIONS/0009-markdown-notes.md)):
- Every note belongs to a project (loose notes go to the Inbox), and **projects act as note folders**. No separate note folders were built, which is a simplification of L1.5's "simple folders".
- Notes save themselves 0.8 s after typing pauses, rather than through a Save button. Leaving the screen or closing the window saves first. If saving fails, the user is asked before changes are discarded.
- Preview rules:
  - raw HTML is shown as text;
  - images are never loaded (a remote image would contact a server);
  - only http, https, and mailto links open, in the system browser.
- A blank title becomes "Untitled note".
- Notes cannot be created in or moved into archived projects; existing ones stay editable.
- The two Markdown packages (react-markdown 10.1.0 and remark-gfm 4.0.1) were already installed on this branch. They add 95 packages, all MIT or ISC licensed, dev-only, with no install scripts.

**Defects found and fixed during the work:**
- A backup damaged in the middle failed with a raw SQLite error instead of "wrong password or damaged file". The extra full-text table moved the damaged bytes into an index page; the existing corrupted-file test caught it. Backup validation now maps any unexpected SQLite error to the damaged-file message.
- The accessibility scan found unlabelled checkboxes in Markdown task lists; they now have names.
- Screenshot review found three layout problems, all fixed:
  - the editor dropped below the list at 1024×700;
  - long titles were cut off;
  - list excerpts showed table rules.

**Verification (2026-10-20):**

| Check | Result |
|---|---|
| `npm run typecheck`, `npm run lint` | Passed |
| Formatting | Passed for all project files. `npm run check` stops at the format step only because of the untracked `PROJECT_STATUS_REPORT.md`, which is not part of this work. |
| `npm test` | Passed — 232 of 232 (21 new: 12 notes service, 9 component) |
| `npm run test:e2e` | Passed — 11 of 11, including two new notes workflows and accessibility of the Notes screen in both themes |
| Test strength | Removing the editor's close handler makes the close-while-typing test fail; the file was then restored byte-for-byte |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Visual review | Notes screen at 1280×800 and 1024×700, light and dark |

**Not done:**
- No installer was built and no install test was run for this change.
- The main-process retry and "could not be saved" dialog on window close were reviewed in code but not automated.
- Notes performance with large numbers of notes was not measured.
- Nothing is committed.

**Next step:** product owner review of Notes and of the decisions above. Kanban and Calendar wait for their own go-ahead.

## 2026-10-20 — Priority for next feature work recorded

**Decision (product owner):** the next feature work is prioritised in this order: (1) Notes, (2) Kanban, (3) Calendar. Recorded in [ROADMAP.md](ROADMAP.md#after-the-mvp) and [REQUIREMENTS.md §4](REQUIREMENTS.md#4-later-free-local-release).

**Scope:** a priority order only. It does not approve implementation, does not change the Core MVP scope (0.1.0), and does not decide where other later-release items, including L2, fall. Each feature still needs its own proposal and approval.

**Code:** none changed.

**Next step:** unchanged — product owner review of the MVP.

## 2026-10-17 — Phase 6: Release hardening complete (delegated approval) — MVP 0.1.0

**Scope completed:** accessibility scan of all main screens in both themes (0 violations); committed upgrade fixtures for every schema version; performance measured through the UI at 5,000 tasks; app icon; dependency audit; packaged build with fuses re-verified; silent install, launch, and uninstall test; release checklist, changelog, and README with installation and recovery instructions. Requirement statuses updated in the register.

**Found and fixed during the phase:** task lists silently showed at most 500 tasks; they now say when more exist and offer "Load 500 more" (the API page limit was raised to 20,000 accordingly).

**Decisions made under delegation:** axe-core added as a dev dependency (MPL-2.0); icon generated by a dependency-free script; the install test was run on this machine for the current user and fully reverted.

**Verification (2026-10-17):** `npm run check` passed (211 tests); `npm run test:e2e` passed (9 of 9, including accessibility); `npm audit --omit=dev` 0 vulnerabilities; installer built, installed, launched, and uninstalled successfully. Full results: [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

**Not done (needs the product owner or another machine):** install on a clean Windows account or VM; manual screen-reader pass; Electron patch upgrade before public release; code-signing decision; final product name.

**Next step:** product owner review of the MVP. Later Free Local Release steps (L1–L6) each need a separate approval.

## 2026-10-17 — Phase 5: Data safety implemented (delegated approval)

**Scope completed:** password-encrypted backup export with verification of the written file; backup check (inspect) showing what a backup contains; restore test into a temporary location; restore as a new profile; replace the open profile with a verified pre-restore copy, atomic swap, rollback, and crash recovery; daily automatic snapshots with retention; recovery of a damaged profile from its snapshots (from the start screen); unencrypted JSON export behind a warning; profile trash with restore and 30-day purge; staging cleanup at startup. Requirements covered: R15, R19, R20, R21; invariants 14 and 15.

**Decisions made under delegation:**
- Backup files are chosen in main-process dialogs and referred to by short-lived tokens; the renderer never sends paths.
- Passwords are passed to SQLite as bytes (`key()`/`rekey()`), never in SQL text; minimum 10 characters.
- Restoring as a new profile names it "<original> (restored)" by default, made unique if needed.
- Snapshot retention: 7 daily, 5 pre-migration, 5 pre-restore.
- A damaged profile is never overwritten: recovery keeps the damaged file as `profile.db.before-snapshot-<time>`.
- End-to-end tests replace native dialogs with a folder (`PROJECTFORGE_TEST_DIALOG_DIR`), honoured only by unpackaged builds.

**Verification (2026-10-17):**

| Check | Result |
|---|---|
| `npm run check` | Passed — 205 tests (24 new data-safety tests, 1 file-token test) |
| `npm run test:e2e` | Passed — 7 of 7, including workflow 6 (backup → test restore → restore as new profile → contents match) and profile trash |
| Backup end-to-end stability (`--repeat-each=3`) | Passed — 6 of 6 |
| Timing (small profile) | Export 0.8 s, check 0.25 s, test restore 1.2 s, restore 1–4 s |

**Critical defect found and fixed during the phase:** replacing a profile's data could delete the original data if the restored file then failed to open. The open step ran crash recovery, which mistook the in-progress replacement for an interrupted one and removed the original copy, so the rollback had nothing to restore. Found by the rollback test before any release; fixed by never running crash recovery inside a replacement. The test now guards it.

**Other fixes:** a test assumption about snapshot timing; ambiguous test locators.

**Known limitations:** live profile data is not encrypted (L2); app-wide registry (`app.db`) corruption still shows a native error dialog without an in-app recovery path (profiles' own files are unaffected and can be restored from backups); restoring large profiles has not been measured yet (Phase 6).

**Next step:** Phase 6 — Release hardening.

## 2026-10-17 — Phase 4: Core UI implemented

**Approval:** the product owner delegated approval for Phase 4 onward ("start the next phase automatically… do what you recommend… tell me after"), and later extended it to the remaining phases. Decisions made under that delegation are listed below for review.

**Scope completed:** all 51 IPC channels (domain operations exposed, validated, and typed); design tokens and shared components; sidebar navigation with search, quick add, and project list; Today dashboard; My tasks; projects list with folders; project overview with progress, actions, workflow editor, and task list grouped by the project's statuses; task details panel (title, status, priority, dates, project move, tags, description, subtasks, dependencies, move to trash with preview); global search; trash with restore, permanent delete, and empty; settings with theme, profiles, shortcuts, and about; light, dark, and system themes; fixed keyboard shortcuts; empty, loading, and error states; toasts with undo and suggested actions (complete parent, mark project completed or active). Requirements covered with UI: R04–R14, R16–R18, R22, R23, R28 (R05 suggestions, R09 status editing).

**Not included (by plan):** Kanban, calendar, notes (later release); backup and restore (Phase 5).

**Decisions made under delegation:**
- Plain CSS with design tokens instead of Tailwind; invalidate-and-reload data layer instead of a caching library; no router library ([ADR-0008](DECISIONS/0008-ui-styling-and-state.md)).
- Visual identity: Atkinson Hyperlegible Next typeface; steel neutrals with temper-blue accent; priority "heat" pip always paired with a text label.
- The "My tasks" view shows open tasks by default; completed and cancelled groups start collapsed.
- Switching profiles returns to the Today screen and remounts the app so no previous-profile data stays in memory.
- Completion checkbox accessible name is "Done: <title>" and stays stable while toggling.
- New dependencies: lucide-react (ISC), Atkinson Hyperlegible Next font (OFL), Testing Library and jsdom (MIT, dev only).

**Verification (2026-10-17):**

| Check | Result |
|---|---|
| `npm run check` (typecheck, lint, format, tests) | Passed — 180 tests (163 unit/persistence, 17 component) |
| `npm run test:e2e` | Passed — 5 of 5 |
| End-to-end stability (`--repeat-each=5`) | Passed — 25 of 25 |
| Visual review (screenshots at 1280×800 and 1024×700, light and dark) | Reviewed; issues found and fixed (below) |
| Text contrast (WCAG AA 4.5:1) | Checked numerically for every text colour on every background; two colours adjusted |

**Defects found and fixed during the phase:** dashboard columns did not adapt when the details panel narrowed the main area (now container queries); task metadata wrapped mid-phrase; long titles were clipped in the details panel (now a self-sizing field); the theme radio and the completion checkbox briefly flipped back to the old value after a click (now optimistic until the reload catches up); the completion checkbox changed its accessible name while toggling; "faint" text failed AA contrast in light mode and on the selected row in dark mode.

**Known limitations:** no manual screen-reader pass yet (Phase 6); keyboard reordering of tasks is available only through the API, not yet in the UI; project tags are edited in the project dialog only.

**Next step:** Phase 5 — Data safety.

## 2026-10-17 — Phase 3: Core domain implemented (awaiting approval)

**Scope completed:** profile schema v2 (folders, projects, workflow statuses, tasks and subtasks, tags, dependencies, full-text search) with database guards; services for folders, tags, projects (archive, completion suggestion, progress), statuses (add, rename, reorder, default, remove with reassignment), tasks (create, update with notices, move between projects, manual reorder, filtered and sorted listing), dependencies (cycle prevention), trash (task and project batches, restore rules, permanent delete, empty, 30-day purge), and global search; the Inbox; profile maintenance on open and daily. Requirements covered at the service level: R04–R14, R18 (query layer), R28.

**Not included (by plan):** IPC channels and UI for these features (Phase 4); profile trash R15 (Phase 5).

**Decisions made within the approved scope:** services own their SQL (ADR-0003 refinement); folders and tags are deleted immediately rather than trashed (only tasks and projects have a trash, per R14); the default status must be "to do" or "in progress"; the last "done" status cannot be removed; done and cancelled prerequisites count as satisfied; moving a task maps statuses by category and removes cross-project dependencies; new tasks cannot be added to archived projects; permanent deletion removes dependency links (users are warned about dependents first).

**Verification (2026-10-17):**

| Check | Command | Result |
|---|---|---|
| Typecheck, lint, formatting | `npm run check` | Passed |
| Unit, persistence, and invariant tests | `npm test` | Passed — 158 of 158 (93 new) |
| Test strength | Three rules deliberately broken (cycle check, parent exclusion in progress, unresolved-dependency report) | Each caught by its tests (6 failures); files restored and tests pass |
| End-to-end and security tests | `npm run test:e2e` | Passed — 3 of 3 (profile opening now runs migration v2 and maintenance) |
| Upgrade of a Phase 2 profile | Unit test (v1 → v2) | Passed — data kept, snapshot taken |
| Performance probe (temporary, deleted) | 6,250 tasks | List/filter/search 3–38 ms; progress for 20 projects 21 ms |

**Fixed during the phase:** README formatting from the Phase 2 commit did not pass `prettier --check` (it was edited after that phase's final check); now formatted.

**Known limitations:** no UI for any Phase 3 feature yet; the Inbox name is fixed in English; subtasks are limited to one level (approved decision C14).

**Next step:** Phase 4 — Core UI, after approval.

## 2026-10-17 — Phase 2: Foundation implemented (awaiting approval)

**Scope completed:** all nine Phase 2 deliverables in [ROADMAP.md](ROADMAP.md). Not included (by plan): projects, tasks, design system, backups.

**Environment changes:** Visual Studio 2022 Build Tools with the C++ workload installed on the development machine (approved by the product owner). Turned out not to be required for the current driver, which ships Node-API prebuilt binaries; kept as a fallback.

**Verification (all run on 2026-10-17):**

| Check | Command | Result |
|---|---|---|
| Typecheck (main, renderer, e2e configs) | `npm run typecheck` | Passed |
| Lint | `npm run lint` | Passed |
| Formatting | `npm run format:check` | Passed |
| Unit and persistence tests | `npm test` | Passed — 65 of 65 |
| End-to-end and security tests | `npm run test:e2e` | Passed — 3 of 3 |
| Clean copy: install, checks, package | `npm ci`, `npm run check`, `npm run package` in a fresh folder | Passed |
| Development launch | `npm run dev` (temporary data folder) | Passed — log shows `window.loaded` |
| Packaged app launch | `release\win-unpacked\ProjectForge.exe` | Passed — log shows `app.started`, `window.loaded`; test data folder removed afterwards |
| Fuses on packaged executable | `@electron/fuses read` | Passed — as configured |
| Installer signature | `Get-AuthenticodeSignature` | NotSigned (expected) |
| Apache cannot serve the repository | HTTP requests to repository files | Passed — HTTP 403 |
| Dependency audit | `npm audit` | 0 production vulnerabilities; 8 moderate in build tooling (one `sprintf-js` advisory, build-time only), not fixed — see ADR-0002 |
| Running the NSIS installer | — | **Not tested** (installs into the user's Programs and registry; left for the product owner or Phase 6) |

**Defects found and fixed during the phase:** migration snapshots left `-wal`/`-shm` side files (snapshots now converted to single files); the logger could have written error messages containing user content (now logs only names, codes, and stack frames); `GrantFileProtocolExtraPrivileges` fuse was enabled by default (now disabled); installer shipped SQLite binaries for every platform (now Windows x64 only).

**Known limitations:** installer unsigned (SmartScreen warning); default Electron icon; renderer UI is a minimal Phase 2 shell (profile management and About only); startup failures are shown in a native error dialog rather than a recovery screen (recovery UI comes with Phase 5); no profile trash yet (Phase 5).

**Next step:** Phase 3 — Core domain, after approval.

## 2026-10-17 — Phase 1b: planning documents written

- **Completed:** Phase 1 analysis approved by the product owner, including all recommended conflict resolutions and encrypted exported backups in the MVP (C1). Planning documents and ADRs 0001–0007 written.
- **Outstanding:** Product owner review and approval of the planning documents.
- **Decisions:** Recorded in [REQUIREMENTS.md §6](REQUIREMENTS.md#6-resolved-conflicts-and-decisions-approved-2026-10-17) and [DECISIONS/](DECISIONS/).
- **Risks:** Native SQLite module compatibility with Electron 44 is unverified (Phase 2 spike). Repository lives under Apache `htdocs` until moved. Installer is unsigned.
- **Code:** None written. No dependencies installed.
- **Next step:** Phase 2 — Foundation, after approval.

## 2026-10-17 — Phase 1: discovery

- Repository contained only `README.md` (one commit, clean tree, remote `origin` on GitHub).
- Environment: Windows 11 Home x64, Node 24.20.0, npm 11.19.0, Git 2.47, Python 3.12.6, Visual Studio Build Tools 2019 (C++ workload unverified), WebView2 runtime present; Rust and .NET SDK not installed. XAMPP Apache and MySQL running.
- Stack compared (Electron, Tauri 2, .NET); Electron selected ([ADR-0001](DECISIONS/0001-desktop-framework.md)).
