# Testing Strategy

Status: **All layers running** (Phase 4, 2026-10-17): unit and persistence (Node), component (jsdom), end-to-end and security (Electron).

## 1. Layers

| Layer | Tool | Scope | Runs against |
|---|---|---|---|
| Domain unit | Vitest | Progress, cycle detection, sorting, date rules, validation schemas | Pure functions |
| Service / persistence | Vitest | Services + repositories + migrations + backup/restore | Real SQLite files in a temporary directory |
| Component | Vitest + React Testing Library | Forms, task details, filters, empty/error states, keyboard interaction | jsdom with a mocked `window.api` |
| End-to-end | Playwright (Electron support) | Complete workflows in the built app | Isolated user-data directory per test |
| Security | Playwright + Vitest | Renderer has no Node, IPC rejects invalid payloads and foreign senders, navigation and window-open blocked | Built app |

Playwright's Electron API is marked experimental, so critical rules are covered by the lower layers and end-to-end tests stay a thin set of workflows.

## 2. Native module and test runtime

The SQLite driver ships a Node-API prebuilt binary, which is ABI-stable, so the same binary loads in plain Node 24 and in Electron 44 (verified in Phase 2). Unit and persistence tests therefore run in plain Node with `npm test`.

End-to-end tests remove `ELECTRON_RUN_AS_NODE` from the launch environment. Some editors (including VS Code) set it for child processes, and it would make Electron start as plain Node.

The packaged app cannot be driven by Playwright, because its fuses disable the debugging flags Playwright needs. Packaged builds are smoke-tested by launching the executable and checking `logs\main.log` for `app.started` and `window.loaded`.

## Commands

| Command | What it runs |
|---|---|
| `npm test` | Unit, persistence, and component tests (Vitest projects `unit` and `renderer`) |
| `npm run test:e2e` | Builds the app, then runs Playwright against `out/` |
| `npm run check` | Typecheck, lint, format check, unit tests |

## 3. Test data rules

- Every persistence and end-to-end test uses a fresh temporary directory; the real `%APPDATA%\ProjectForge` folder is never touched.
- Development builds use `ProjectForge-dev` as their data folder.
- Time-dependent behaviour (trash purge, overdue, snapshots) uses an injected clock.
- Fixture databases are generated for every released schema version and committed under `tests/fixtures/` for migration tests.

## 4. Required coverage (MVP)

- Every invariant in [DATA_MODEL.md](DATA_MODEL.md#4-invariants).
- Project and task CRUD, archive/unarchive, Inbox rules.
- Status removal with reassignment.
- Sort orders including no-priority and undated tasks.
- Dependencies: direct and indirect cycles, cross-project rejection, delete warnings, unresolved links after restore.
- Progress: no tasks, all cancelled, mixed, parents with subtasks, reopen.
- Trash: hierarchy restore, 30-day purge with fake clock, permanent delete.
- Profiles: create, switch, rename, isolation, duplicate names, trash.
- Migrations: empty DB, every fixture version, failure leaves original intact, newer-version DB refused.
- Backup: success path verified by reopening; wrong password; truncated file; corrupted bytes; newer format; interrupted mid-write; insufficient disk space (simulated).
- Restore: into temporary profile; replacement keeps a pre-restore backup; interruption leaves the original usable.
- JSON export validates against its schema.

### Invariant coverage (as of Phase 3)

| Invariant ([DATA_MODEL.md §4](DATA_MODEL.md#4-invariants)) | Tests |
|---|---|
| 1 Task belongs to an existing project | `services/guards.test.ts`; Inbox default in `services/tasks.test.ts` |
| 2 Status belongs to the task's project | `guards.test.ts`, `tasks.test.ts` |
| 3 Subtask parent same project, depth 1 | `guards.test.ts`, `tasks.test.ts` |
| 4 No hierarchy cycles | `guards.test.ts` |
| 5 Dependencies same project, acyclic | `guards.test.ts`, `services/dependencies-trash.test.ts` |
| 6 Stable IDs on rename | `services/projects.test.ts`, `profiles/profile-service.test.ts` |
| 7 One default status per project; one Inbox | `guards.test.ts`, `projects.test.ts` |
| 8 `completed_at` iff done | `tasks.test.ts`, `projects.test.ts` (status removal), move tests |
| 9 Trash/restore hierarchy together | `dependencies-trash.test.ts` |
| 10 No recreation of permanently deleted records | `dependencies-trash.test.ts` |
| 11 No double-counted progress | `domain.test.ts` |
| 12 Archive independent of status | `projects.test.ts` |
| 13 Unique profile names | `profiles/profile-service.test.ts` |
| 14 Imports and restores all-or-nothing | Trash restore is transactional; backup restore works on a staged copy and swaps atomically (`backup.test.ts`) |
| 15 Backups state their contents | Manifest `includes`/`omits`, shown before restoring (`backup.test.ts`, E2E) |
| 16 Notes belong to a project; trashed with it | `services/notes.test.ts` |

## 5. End-to-end workflows

1. First launch → create profile → dashboard empty state.
2. Create project → tasks and subtasks → change statuses and priorities.
3. Search and filter; clear filters.
4. Restart application → data persists.
5. Trash and restore a task hierarchy.
6. Export encrypted backup → restore into new profile → contents match.
7. Archive and unarchive a project.
8. Notes (L1.5): write Markdown in Markdown mode → autosave → preview → leave the screen while typing (saved first) → global search finds the body → trash and restore → restart → note persists.
9. Visual note editing (ADR-0013): type with Markdown shortcuts and Ctrl+B in the visual editor → autosave → leave and reopen → restart → the formatting is shown and the stored text is the expected Markdown.
10. Note actions, import, and folders (ADR-0014): create a folder → import two `.md` files into it → duplicate → copy as Markdown (system clipboard checked) → export (file checked) → trash with confirmation → restart → delete the folder; its notes remain.
11. Notes library and views (ADR-0015): right-click a note → Archive → it leaves the library → Archived filter → opens read-only → Unarchive → editable → Ctrl+Shift+F hides the sidebar → Escape inside the editor restores it.
12. Colours and tags (ADR-0015): choose teal and warm → a tag is deleted after a confirmation naming where it was used → restart → the colours persist and the note kept, without the tag.
13. Notes: close the window right after typing in the visual editor → restart → the text was saved. (Removing the editor's `beforeunload` handler makes this test fail.) The retry and the "could not be saved" dialog in the main process, used when a save is still running or fails, are not automated; they were reviewed in code only.

### Status of the end-to-end workflows

14. Kanban: move cards with the Move dialog and by real drag and drop → order and status persist across a restart → Done completes the task.
15. Calendar: a task appears on its due date → open it from the calendar → change the due date → the entry moves at once → completed tasks hidden unless shown.
16. Slash commands (ADR-0016): `/` opens the menu below the cursor and inside the window → `/h2` + Enter → arrow keys + Enter for a checklist → a click for a divider → in focus mode Escape closes only the menu → the stored text is the expected Markdown.
17. Formatting bubble (ADR-0017): double-click a word → bold → link (https added) → Alt+F10 → Turn into Heading 2 → the stored Markdown matches.
18. Outline (ADR-0017): type three sections → Outline → jump to a heading below the window (in view, cursor in it) → edit it → restart → the outline is still open.
19. Blocks (ADR-0017): type a warning callout, a toggle (collapse and expand), and a table (delete a column) → the stored Markdown matches → reopened visually → the preview shows the same blocks → no Content Security Policy message.
20. Note links (ADR-0017): `[[` + Enter → the saved Markdown is the link → the chip opens the note → backlinks list it → Link a mention → rename shows in the chip → trashed: broken and inert → restored: works → Ctrl+click opens focus mode → after a restart the backlinks remain.
21. Mentions (ADR-0017): `@fix` + Enter → the chip shows the status and due date → completing the task shows Done → the chip opens the task → "Mentioned in 1 note" opens the note → the saved Markdown matches.
22. Images and files (ADR-0017): `/file` (its Choose button) and `/image` (Enter on its prompt) through the real file picker → the image loads under the Content Security Policy → its description is set → Save a copy writes the same bytes → the saved Markdown matches → the preview shows the image → after a restart it is still there → no Content Security Policy message.
23. Command palette and quick switcher (ADR-0018): Ctrl+K → New project (the same dialog) → on the project its own actions come first → Move to trash asks first → New note in this project → focus mode and back → Ctrl+O lists recent items → typing finds a task (type and project shown) and opens its details → Ctrl+Enter opens a note in focus mode → Escape returns focus → archived items need "Include archived" → the other theme → restart → theme and recent items kept → no console errors.
24. Favourites, icons, and covers (ADR-0019): add an icon and a gradient cover to a project → star it from its ⋯ menu → a note in it gets an uploaded image cover, loaded under the Content Security Policy, and a star → Move up from the keyboard menu, then back by drag and drop → a trashed note leaves the list and comes back with Undo → an archived project keeps its star with a badge → the palette shows the icon → restart → all kept → Remove icon and Remove cover restore the usual look → no console errors.

All twenty-four workflows are automated: 1–5, 7–9, and 12–15 in `tests/e2e/workflows.spec.ts` and `tests/e2e/app.spec.ts`, 6 in `tests/e2e/backup.spec.ts`, 10–11 and 16–22 in `tests/e2e/notes.spec.ts`, 23 in `tests/e2e/palette.spec.ts`, and 24 in `tests/e2e/personal.spec.ts`. The quick switcher's speed (under 100 ms with 5,000 tasks) is checked in `tests/unit/services/switcher.test.ts`. The accessibility scans include the command palette in both modes, the icon and cover pickers, a project with an icon, a cover, and favourites, the open slash menu, the formatting bubble, its link field, the outline, and a note with every callout kind, toggles, and a table, in the editor and the preview.

Some editor behaviour can only be tested end to end: jsdom does not reproduce ProseMirror marking Escape as handled, so the focus-mode Escape check lives in workflow 11, not in a component test. Native file dialogs are replaced in tests by a folder given in `PROJECTFORGE_TEST_DIALOG_DIR` (unpackaged builds only).

Component tests use the real preload `createApi` over a scripted fake backend (`tests/renderer/harness.tsx`), so they exercise the exact API shape the app uses.

### Data-safety gate coverage (Phase 5)

| Case | Test |
|---|---|
| Backup success, verified by reopening; no readable content in the file | `tests/unit/backup/backup.test.ts`, `tests/e2e/backup.spec.ts` |
| Wrong password | unit and E2E |
| Truncated, corrupted, empty, random-bytes files | unit |
| Encrypted file that is not a backup; missing records (counts differ) | unit |
| Newer backup format; newer data schema | unit |
| Interrupted write (no partial file left) | unit (injected failing copy) |
| Insufficient disk space, before and during the write | unit (injected free-space check and ENOSPC) |
| Test restore into a temporary location changes nothing | unit and E2E |
| Restore as new profile; contents match | unit and E2E |
| Replace current profile keeps a verified pre-restore copy | unit |
| Replace rolls back if the restored data cannot be opened | unit |
| Crash mid-replace: finish if new file usable, undo if not | unit |
| Restore of an older-schema backup upgrades it | unit (v1 backup) |
| Damaged profile recovered from a snapshot, damaged file kept | unit |
| Daily snapshots, retention | unit (controllable clock) |
| Profile trash, restore with rename, permanent delete, 30-day purge | unit and E2E |
| JSON export validates and includes trashed rows | unit and E2E |

### Keyboard-only walkthrough

Partly automated (the core workflow uses Ctrl+K and Enter for search, Ctrl+N, Ctrl+1, Ctrl+4, Ctrl+, , Escape, and Enter-to-submit). Checked by design and code review:

- Every interactive element is a native `button`, `input`, `select`, `textarea`, or `dialog`, so Tab order follows the page and Enter/Space activate controls.
- Task rows expose two stops: the completion checkbox (name "Done: <title>", stable while toggling) and the title button that opens details.
- Dialogs trap focus and close on Escape (native `<dialog>`); the confirm button is focused first.
- After navigation, focus moves to the main area so screen readers start at the new page.
- Visible focus outline on every control (`:focus-visible`).

A full manual pass with a screen reader is still recommended before public release (RELEASE_CHECKLIST.md).

### Accessibility scan

`tests/e2e/accessibility.spec.ts` runs axe-core (WCAG 2.2 A/AA rules) on the start screen, Today, My tasks, a project with the task details panel open, the project board and its Move dialog, Projects, Notes (a note with a table in Markdown preview and write modes, with headings, a task list, a link, code, and an image reference; and a note in the visual editor, in a note folder, with its actions menu open), the notes library and its right-click menu, focus mode, Calendar (month, week, and day views), Trash, Settings (also with the violet and warm palette), and the new-task dialog, in light and dark themes. It uses axe's legacy mode because Electron cannot open the helper page axe otherwise needs. The scanner was confirmed to report injected violations.

### Upgrade fixtures

`tests/fixtures/` holds committed databases from each released schema version (app v1, profile v1, profile v2, profile v3 from the 0.2.0 installer, profile v4 from the 0.3.0 installer, profile v5 from 0.4.0 and 0.5.0, and profile v6 from 0.6.0 and 0.7.0). The v3 fixture is filled with SQL rather than services, because today's services expect columns added later; its test upgrades to v4 and checks that notes, tags, search, and note folders work. `tests/unit/fixtures.test.ts` upgrades copies to the current schema and checks data and relationships. When a version is released with a new migration, add its fixture with `REGENERATE_FIXTURES=1 npx vitest run tests/unit/fixtures.test.ts` (after extending the generator). Only missing fixture files are built, so committed ones are never rewritten.

### Performance

Measured in Phase 6 through the real UI with 5,000 tasks and 1,250 subtasks in 20 projects: every screen under 300 ms (see RELEASE_CHECKLIST.md). Lists load 500 tasks at a time and say so when more exist.

### Window sizes

Screens were captured and reviewed at 1280×800 and 1024×700 in light and dark themes during Phase 4, and the Notes, Kanban board, and Calendar screens again on 2026-10-20. After the interface refresh (ADR-0011), every screen and dialog was captured again at 1280×800 and 960×640 in both themes and compared with the earlier captures, and text contrast was recalculated for every text token on every surface. The minimum window size is 900×600.

## 6. Reporting

Each checkpoint reports every check as **passed**, **failed**, **blocked**, **not run**, or **not applicable**, with the exact command used. No result is reported that was not observed.

### Real keyboard and mouse (manual probe)

Automated tests send simulated keys, which never reach Windows, so Windows' "Hide pointer while typing" cannot be tested there. The file-window pointer problem in ADR-0017 was reproduced, and its fix verified, with a PowerShell probe on the developer's PC.
- **What it does:** it sends real keystrokes and a real mouse move and click to a test instance, then reads `GetCursorInfo`.
- **Safety:** it acts only when the test instance's window is in front.
- **Where it lives:** the probe is kept with the session notes rather than in the suite, because it takes over the mouse and keyboard.

