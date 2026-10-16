# ADR-0005: Forward-only migrations with pre-migration snapshot

- Status: Approved
- Date: 2026-10-17

## Context

Schema changes must never lose user data. SQLite's `ALTER TABLE` is limited, which makes reliable "down" migrations difficult.

## Options considered

1. **Reversible up/down migrations.** Down scripts for table rebuilds are complex and rarely tested on real data.
2. **Forward-only migrations, each in a transaction, preceded by a verified snapshot.**

## Decision

Option 2.

- Migrations are numbered SQL (or TypeScript, when data transformation is needed) files recorded in `schema_migrations` with a checksum.
- Before applying any pending migration, the runner creates a snapshot with the SQLite online backup API in `snapshots/` and verifies it with `integrity_check`.
- Each migration runs inside a transaction; on failure it rolls back, the app shows a recovery screen, and the snapshot remains.
- A database whose schema version is newer than the app supports is refused, not opened or rewritten.
- Applied migrations are never edited; checksum mismatch is an error.

## Consequences

Rollback means restoring the snapshot, not running down scripts. Migration tests run against fixture databases from every released schema version.
