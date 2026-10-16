# ADR-0004: One database file per profile

- Status: Approved
- Date: 2026-10-17

## Context

Profiles must be isolated, independently backed up, restorable, trashable, and (in L2) independently encryptable.

## Options considered

1. **One shared database with `profile_id` on every table.** Simpler connection handling; every query must filter by profile, and one missed filter leaks data; per-profile encryption is impractical.
2. **One database file per profile plus a small registry database.** Isolation by construction; backup, trash, and encryption operate on one folder.

## Decision

Option 2. `app.db` holds the profile registry and app settings; each profile has `profiles/<uuid>/profile.db`.

## Trade-offs and risks

- Cross-profile features (e.g. duplication, L6.6) must copy between files rather than run one query.
- Migrations must run for each profile database when it is opened; the runner handles this per file.
- Only the active profile's database is open at a time.

## Consequences

Profile switching closes one connection and opens another. Encryption in L2 converts a single file per profile.
