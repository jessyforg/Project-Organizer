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

## 5. End-to-end workflows

1. First launch → create profile → dashboard empty state.
2. Create project → tasks and subtasks → change statuses and priorities.
3. Search and filter; clear filters.
4. Restart application → data persists.
5. Trash and restore a task hierarchy.
6. Export encrypted backup → restore into new profile → contents match.
7. Archive and unarchive a project.

### Status of the end-to-end workflows

All seven workflows are automated: 1–5 and 7 in `tests/e2e/workflows.spec.ts` and `tests/e2e/app.spec.ts`, 6 in `tests/e2e/backup.spec.ts`. Native file dialogs are replaced in tests by a folder given in `PROJECTFORGE_TEST_DIALOG_DIR` (unpackaged builds only).

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

Partly automated (the core workflow uses Ctrl+K, Ctrl+N, Ctrl+1, Ctrl+4, Ctrl+, , Escape, and Enter-to-submit). Checked by design and code review:

- Every interactive element is a native `button`, `input`, `select`, `textarea`, or `dialog`, so Tab order follows the page and Enter/Space activate controls.
- Task rows expose two stops: the completion checkbox (name "Done: <title>", stable while toggling) and the title button that opens details.
- Dialogs trap focus and close on Escape (native `<dialog>`); the confirm button is focused first.
- After navigation, focus moves to the main area so screen readers start at the new page.
- Visible focus outline on every control (`:focus-visible`).

A full manual pass with a screen reader is part of the Phase 6 release gate.

### Window sizes

Screens were captured and reviewed at 1280×800 and 1024×700 in light and dark themes during Phase 4. The minimum window size is 900×600.

## 6. Reporting

Each checkpoint reports every check as **passed**, **failed**, **blocked**, **not run**, or **not applicable**, with the exact command used. No result is reported that was not observed.
