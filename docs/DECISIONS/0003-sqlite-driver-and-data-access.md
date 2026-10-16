# ADR-0003: SQLite driver and data access

- Status: Approved
- Date: 2026-10-17

## Context

We need reliable local relational storage with transactions, foreign keys, an online backup API, and a path to encryption (exported backups in MVP; profile encryption in L2), without paid components.

## Options considered

1. **better-sqlite3.** Synchronous, fast, well maintained, MIT. No encryption.
2. **better-sqlite3-multiple-ciphers.** Fork tracking better-sqlite3 releases (13.0.3 at time of writing) with the same API, bundling SQLite3MultipleCiphers (SQLCipher-compatible and other ciphers). MIT. Smaller maintainer base.
3. **Node built-in `node:sqlite`.** No native build; API less mature; no encryption.
4. **Query layer:** plain SQL repositories vs Drizzle ORM / Kysely (both 0.x).

## Decision

`better-sqlite3-multiple-ciphers` with plain SQL in typed repository modules. Zod validates data at the IPC boundary.

## Rationale

Same proven API as better-sqlite3, plus a maintained encryption implementation, so no custom cryptography is needed for backups or future profile protection. Plain SQL keeps the schema explicit, avoids a pre-1.0 dependency, and teaches the underlying database.

## Trade-offs and risks

- Native module compatibility: resolved in Phase 2 (Node-API prebuilt binaries; see below). If a future version drops prebuilt binaries, the fallback is compiling with Visual Studio Build Tools (installed), then plain better-sqlite3 plus a revised backup-encryption decision.
- Fork maintenance risk: if it stops tracking upstream, switching back to better-sqlite3 requires only an import change for unencrypted features.
- Synchronous calls block the main process; measured in Phase 6, worker thread is the fallback.

## Phase 2 verification (2026-10-17)

- `better-sqlite3-multiple-ciphers` 13.0.3 ships **Node-API prebuilt binaries** (`prebuilds/win32-x64.node`). Node-API is ABI-stable, so the same binary loads in Node 24 (unit tests) and Electron 44 (app). No compilation against Electron is needed.
- Its `node-gyp rebuild` install script is denied through npm's `allowScripts` in `package.json`; the prebuilt binary is used instead. electron-builder runs with `npmRebuild: false` and unpacks only `win32-x64.node` from the asar archive.
- Bundled SQLite: 3.53.4. FTS5 available. Foreign keys enforced.
- Visual Studio 2022 Build Tools (C++ workload, Windows SDK 10.0.26100) were installed on the development machine as a fallback for native modules without prebuilt binaries. They are not required to build this project today.
- TypeScript: the package's `exports` field hides its type file under `moduleResolution: bundler`; `tsconfig.base.json` maps the types explicitly.

## Phase 3 refinement (2026-10-17)

Services own their SQL instead of delegating to a separate repository layer; shared column lists and row mappers live in `src/main/services/rows.ts`. Each repository would only have forwarded calls, and services are already tested against real SQLite files. A repository module will be extracted when a query needs sharing beyond the mappers. Business rules that need no database (progress, sort keys, date arithmetic, search-term sanitising) live in `src/main/domain/` as pure functions.
