# Architecture

Status: **Implemented through Phase 4 (core UI), 2026-10-17.** Update this document when the implementation diverges.

## 1. Overview

ProjectForge is an Electron application. The user interface is React rendered in a sandboxed Chromium window. All data, filesystem, and operating-system work happens in the trusted main process.

```
┌──────────────────────────────── Renderer (untrusted) ───────────────────────────────┐
│ React UI · routing · forms · views · design system                                   │
│ No Node.js, no filesystem, no SQLite. Talks only to window.api.                      │
└───────────────────────────────────────┬──────────────────────────────────────────────┘
                                        │ window.api.tasks.create(input)   (typed)
┌───────────────────────────────── Preload (bridge) ──────────────────────────────────┐
│ contextBridge exposes one function per allowed operation; no raw ipcRenderer.        │
└───────────────────────────────────────┬──────────────────────────────────────────────┘
                                        │ ipcRenderer.invoke('tasks:create', payload)
┌──────────────────────────────── Main process (trusted) ─────────────────────────────┐
│ ipc/        verify sender → Zod-validate payload → call service → Result             │
│ services/   use cases, transactions, business rules                                  │
│ domain/     pure functions: progress, cycle detection, sorting, date rules           │
│ db/         connection, pragmas, migrations, repositories (SQL)                      │
│ profiles/   registry, open/switch/trash, profile directory management                │
│ platform/   paths, atomic files, dialogs, external links, logging, snapshots         │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## 2. Planned folder structure

```
src/
  main/
    index.ts            app lifecycle, single-instance lock
    window.ts           BrowserWindow creation and hardening
    ipc/                trusted boundary: sender check, validation, Result conversion
    security.ts         trusted origins, external-link allowlist, CSP
    protocol.ts         app:// handler serving the renderer build
    errors.ts           AppError (expected, user-safe failures)
    db/
      connection.ts     open, pragmas, integrity checks
      migrator.ts       forward-only migration runner with snapshot
      migrations/       app.ts and profile.ts (ordered SQL lists)
    domain/             pure rules: progress, dates, sort keys, search terms, name keys
    services/           one class per aggregate (folders, tags, projects, statuses, tasks,
                        dependencies, trash, search); each owns its SQL; rows.ts holds
                        shared column lists and row mappers
    profiles/           registry (app.db) and profile lifecycle service (trash, atomic
                        database replacement with crash recovery, snapshot recovery)
    backup/             encrypted backup export/restore, manifest, snapshots, JSON export
    platform/           paths, logger
  preload/
    api.ts              typed API factory (type-only imports)
    index.ts            contextBridge exposure
  renderer/
    app/                shell, routing, providers
    features/           dashboard/, projects/, tasks/, search/, settings/, backup/
    components/ui/      shared design-system components
    styles/tokens.css   design tokens (light/dark)
  shared/
    ipc-contract.ts     channel names + request/response schemas
    domain.ts           domain types and constants (statuses, priorities, colours)
    schemas.ts          Zod input schemas shared by IPC and forms
    result.ts           Result<T> and AppError types
tests/
  unit/                 Vitest (plain Node; the SQLite driver is Node-API)
  e2e/                  Playwright Electron tests
  fixtures/             databases from each released schema version
docs/
```

Rule: `domain/` and `services/` must not import Electron. Services receive repositories and a clock as parameters, so they run in plain unit tests.

## 3. IPC contract

- Channel names are listed in `src/shared/ipc-channels.ts` (no runtime imports, so the sandboxed preload can use it). The preload builds `window.api` from this fixed list: one named, frozen function per channel (`api.tasks.create(...)` → `tasks:create`). A test checks the list matches the schemas, and an end-to-end test checks the renderer sees exactly these functions.
- Request/response only, via `ipcMain.handle` / `ipcRenderer.invoke`. Main-to-renderer events are limited to a small allowlist (e.g. `profile:changed`).
- Channel names: `<domain>:<action>` (e.g. `tasks:create`, `backup:export`).
- Every channel has a Zod request schema and a response type in `src/shared/ipc-contract.ts`. The preload imports only types from it, so zod never enters the sandboxed preload.
- `registerIpcHandlers` takes a mapped object with one implementation per channel, so a missing handler is a compile error.
- Each handler first verifies that the sender frame is the application's own origin, then validates the payload. Unknown fields are rejected.
- Response shape:

```ts
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; details?: unknown } };
```

- Error codes are a closed set in `src/shared/result.ts` (currently `VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`, `FORBIDDEN_SENDER`, `DB_INTEGRITY`, `DB_NEWER_VERSION`, `MIGRATION_FAILED`, `IO_ERROR`, `UNEXPECTED`; later phases add codes such as `DEPENDENCY_CYCLE` and `BACKUP_INVALID`). Unexpected errors are logged locally and returned with a generic message.
- File paths chosen by the user arrive only from main-process dialogs; the renderer never sends arbitrary paths to read or write.

## 4. Persistence

- Driver: `better-sqlite3-multiple-ciphers` ([ADR-0003](DECISIONS/0003-sqlite-driver-and-data-access.md)), synchronous, main process only.
- One database file per profile plus `app.db` for the profile registry ([ADR-0004](DECISIONS/0004-one-database-per-profile.md)).
- Pragmas on open: `foreign_keys = ON` (verified by reading it back), `journal_mode = WAL`, `synchronous = FULL`, `busy_timeout`.
- Writes involving more than one row run in `db.transaction(...)`.
- Plain SQL, no ORM. Services own their SQL; column lists and row mappers shared between services live in `services/rows.ts`. A separate repository layer was planned but would only have forwarded calls; it will be extracted if a query needs sharing beyond the mappers.
- Services take a `ServiceContext` (`db`, `clock`, `newId`) so tests run against real SQLite files with a controllable clock.
- When a profile opens, and every 24 hours while it stays open, maintenance ensures the Inbox exists and purges expired trash.
- Migrations: forward-only, numbered, transactional, preceded by a verified snapshot ([ADR-0005](DECISIONS/0005-forward-only-migrations.md)).
- A single-instance lock (scoped to the data folder) prevents two app processes from opening the same database.
- Snapshots and backups are converted to rollback-journal mode so each is a single self-contained file.
- Profile lifecycle operations (create, switch, rename) are serialised so overlapping IPC calls cannot interleave. Switching opens and migrates the target before closing the current profile, so a failed switch keeps the current one open.
- Synchronous queries block the main process while they run. This is acceptable at the expected data size; the performance gate measures it, and moving the database to a worker thread is the documented fallback.

## 5. Data locations

```
%APPDATA%\ProjectForge\
├─ app.db             profile registry
├─ snapshots\         pre-migration snapshots of app.db
├─ profiles\<profile-uuid>\
│   ├─ profile.db
│   └─ snapshots\      daily-*, pre-migration-*, pre-restore-* copies
├─ tmp\               staging for backup and restore; emptied at every start
├─ logs\              main.log, rotated at 1 MB, 3 older files kept
└─ electron\          Chromium's own storage (Electron userData)
```

`%APPDATA%` resolves to `C:\Users\<user>\AppData\Roaming`. The folder name comes from the application name and must be frozen before the first release ([ADR-0002](DECISIONS/0002-build-and-packaging.md)). Development builds use a separate folder (`ProjectForge-dev`) so development never touches real data. Unpackaged builds also honour `PROJECTFORGE_DATA_DIR`, which tests use for isolated temporary folders; packaged builds ignore it.

## 6. Renderer

See [ADR-0008](DECISIONS/0008-ui-styling-and-state.md) for the reasoning.

- React 19. `app/` holds the shell (sidebar, routing state, data layer, toasts, quick add, shortcuts); `features/` holds screens (dashboard, tasks, projects, search, trash, settings, profiles); `components/ui.tsx` holds shared pieces (dialog, confirm dialog, progress meter, priority label, error notice).
- Plain CSS with design tokens in `styles/tokens.css` (light and dark sets); container queries adapt layout to the main area's width.
- Data: `useQuery` loads through `window.api`; successful changes call `invalidate()` so visible queries reload. Toggle controls are optimistic until the reload arrives.
- Navigation is a typed route union in React state; the task details panel is a separate piece of state so it can stay open across screens.
- Switching profiles remounts the whole shell, so nothing from the previous profile stays in memory.
- Dialogs use the native `<dialog>` element (focus trap and Escape handling built in).
- Markdown (later) will be rendered without raw HTML.

## 7. Security boundary

See [SECURITY.md](SECURITY.md) for the hardening checklist and threat model.

## 8. Decision records

| ADR | Title |
|---|---|
| [0001](DECISIONS/0001-desktop-framework.md) | Desktop framework: Electron |
| [0002](DECISIONS/0002-build-and-packaging.md) | Build and packaging: electron-vite + electron-builder |
| [0003](DECISIONS/0003-sqlite-driver-and-data-access.md) | SQLite driver and data access |
| [0004](DECISIONS/0004-one-database-per-profile.md) | One database file per profile |
| [0005](DECISIONS/0005-forward-only-migrations.md) | Forward-only migrations with pre-migration snapshot |
| [0006](DECISIONS/0006-backup-and-export-formats.md) | Backup and export formats |
| [0007](DECISIONS/0007-typescript-version-pin.md) | TypeScript 6.0 version pin |
| [0008](DECISIONS/0008-ui-styling-and-state.md) | UI styling, data loading, and visual identity |
| [0009](DECISIONS/0009-markdown-notes.md) | Markdown notes: storage, rendering, and saving |
| [0010](DECISIONS/0010-kanban-and-calendar.md) | Kanban board and calendar |
| [0011](DECISIONS/0011-interface-refresh.md) | Interface refresh and design system |
| [0012](DECISIONS/0012-block-editor.md) | Block-based document editor (prototype) |
| [0013](DECISIONS/0013-visual-note-editing.md) | Visual editing of Markdown notes |
| [0014](DECISIONS/0014-note-actions-import-and-folders.md) | Note actions, Markdown import, and note folders |
| [0015](DECISIONS/0015-notes-views-archive-colours-menus.md) | Notes library and note views, archived notes, colour palettes, tag management, right-click menus |
| [0016](DECISIONS/0016-slash-commands.md) | Slash commands in the visual editor |
| [0017](DECISIONS/0017-notes-release-0.6.md) | Notes release 0.6.0: formatting bubble, outline, blocks, links, mentions, attachments |
| [0018](DECISIONS/0018-command-palette-and-switcher.md) | Command palette and quick switcher (0.7.0) |
