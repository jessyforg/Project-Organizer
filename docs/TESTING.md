# Testing Strategy

Status: **Unit, persistence, end-to-end, and security layers running since Phase 2** (2026-10-17). Component tests (React Testing Library) start in Phase 4.

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
| `npm test` | Unit and persistence tests (Vitest) |
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

## 5. End-to-end workflows

1. First launch → create profile → dashboard empty state.
2. Create project → tasks and subtasks → change statuses and priorities.
3. Search and filter; clear filters.
4. Restart application → data persists.
5. Trash and restore a task hierarchy.
6. Export encrypted backup → restore into new profile → contents match.
7. Archive and unarchive a project.

## 6. Reporting

Each checkpoint reports every check as **passed**, **failed**, **blocked**, **not run**, or **not applicable**, with the exact command used. No result is reported that was not observed.
