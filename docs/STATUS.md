# Project Status Log

Newest entries first.

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
