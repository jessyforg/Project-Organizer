# Architecture

Status: **Approved design, not yet implemented** (2026-10-17). Update this document when the implementation diverges.

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
    ipc/                one handler module per domain; registry of channels
    services/           projects, tasks, tags, trash, backup, profiles …
    domain/             pure, framework-free business rules
    db/
      connection.ts     open, pragmas, integrity checks
      migrations/       0001_initial.sql, 0002_… (forward-only)
      repositories/     SQL per aggregate
    profiles/
    platform/
  preload/
    index.ts
  renderer/
    app/                shell, routing, providers
    features/           dashboard/, projects/, tasks/, search/, settings/, backup/
    components/ui/      shared design-system components
    styles/tokens.css   design tokens (light/dark)
  shared/
    ipc-contract.ts     channel names + request/response schemas
    schemas/            Zod schemas shared by IPC and forms
    result.ts           Result<T> and AppError types
tests/
  e2e/                  Playwright Electron tests
  fixtures/             databases from each released schema version
docs/
```

Rule: `domain/` and `services/` must not import Electron. Services receive repositories and a clock as parameters, so they run in plain unit tests.

## 3. IPC contract

- Request/response only, via `ipcMain.handle` / `ipcRenderer.invoke`. Main-to-renderer events are limited to a small allowlist (e.g. `profile:changed`).
- Channel names: `<domain>:<action>` (e.g. `tasks:create`, `backup:export`).
- Every channel has a Zod request schema and a response type in `src/shared/ipc-contract.ts`.
- Each handler first verifies that the sender frame is the application's own origin, then validates the payload. Unknown fields are rejected.
- Response shape:

```ts
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: AppErrorCode; message: string; details?: unknown } };
```

- Error codes are a closed set (e.g. `VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`, `DEPENDENCY_CYCLE`, `DB_INTEGRITY`, `BACKUP_INVALID`, `BACKUP_WRONG_PASSWORD_OR_DAMAGED`, `IO_ERROR`, `UNEXPECTED`). Unexpected errors are logged locally and returned with a generic message.
- File paths chosen by the user arrive only from main-process dialogs; the renderer never sends arbitrary paths to read or write.

## 4. Persistence

- Driver: `better-sqlite3-multiple-ciphers` ([ADR-0003](DECISIONS/0003-sqlite-driver-and-data-access.md)), synchronous, main process only.
- One database file per profile plus `app.db` for the profile registry ([ADR-0004](DECISIONS/0004-one-database-per-profile.md)).
- Pragmas on open: `foreign_keys = ON` (verified by reading it back), `journal_mode = WAL`, `synchronous = FULL`, `busy_timeout`.
- Writes involving more than one row run in `db.transaction(...)`.
- Plain SQL in repository modules; no ORM.
- Migrations: forward-only, numbered, transactional, preceded by a verified snapshot ([ADR-0005](DECISIONS/0005-forward-only-migrations.md)).
- A single-instance lock prevents two app processes from opening the same database.
- Synchronous queries block the main process while they run. This is acceptable at the expected data size; the performance gate measures it, and moving the database to a worker thread is the documented fallback.

## 5. Data locations

```
%APPDATA%\ProjectForge\
├─ app.db
├─ profiles\<profile-uuid>\
│   ├─ profile.db
│   ├─ snapshots\
│   └─ tmp\            staging for backup/restore operations
└─ logs\
```

`%APPDATA%` resolves to `C:\Users\<user>\AppData\Roaming`. The folder name comes from the application name and must be frozen before the first release ([ADR-0002](DECISIONS/0002-build-and-packaging.md)). Development builds use a separate folder (`ProjectForge-dev`) so development never touches real data.

## 6. Renderer

- React 19 with feature folders; shared components in `components/ui`.
- Design tokens as CSS variables in `tokens.css`, with light and dark sets; Tailwind configured to use them.
- Server state (data from the main process) is fetched through `window.api` and cached per screen; mutations refresh affected queries. Choice of caching library is decided in Phase 4 and recorded.
- Markdown rendered without raw HTML.

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
