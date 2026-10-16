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

- Native module must be built for Electron's ABI; prebuilt binary availability for the chosen Electron version is unverified. Phase 2 begins with a spike; fallback is compiling with Visual Studio Build Tools (C++ workload), then plain better-sqlite3 plus a revised backup-encryption decision.
- Fork maintenance risk: if it stops tracking upstream, switching back to better-sqlite3 requires only an import change for unencrypted features.
- Synchronous calls block the main process; measured in Phase 6, worker thread is the fallback.
