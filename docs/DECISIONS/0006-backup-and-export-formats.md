# ADR-0006: Backup and export formats

- Status: Approved; mechanism verified in Phase 2 (2026-10-17)
- Date: 2026-10-17

## Context

The source requirements state that every exported profile backup must be encrypted, including backups of unprotected profiles (§17), and that backups must be proven restorable. The product owner approved bringing exported-backup encryption into the MVP. Custom cryptography is prohibited.

## Options considered

1. **SQLCipher-encrypted SQLite file** produced with the database driver (SQLite3MultipleCiphers in SQLCipher v4 mode). No custom format or crypto; openable by standard SQLCipher tools.
2. **Custom envelope**: plain SQLite snapshot encrypted with Node `crypto` (AES-256-GCM, scrypt). Uses established primitives but requires designing our own file format and parameters.
3. **Unencrypted backups** in MVP. Violates §17.

## Decision

- **Exported backup** (`.pfbackup`): Option 1. The file is a complete encrypted copy of the profile database plus a `backup_manifest` table (format version, app version, schema version, profile ID and name, creation time, per-table record counts, included/omitted content).
- **Automatic snapshots**: unencrypted SQLite copies inside the profile folder, same protection level as the live database (C2).
- **JSON export**: versioned envelope `{ format: "projectforge-export", formatVersion, schemaVersion, exportedAt, scope, data }`, unencrypted with a warning. Intended for portability, not as the primary backup.

## Verification rules

A backup is reported successful only after it is reopened with the password and passes integrity check, manifest validation, and record-count comparison. Restore always validates fully before changing anything, and replacement restores keep a backup of the destination.

## Risks

- Encryption mechanism: confirmed in Phase 2 (see below). A permanent test fails if a driver upgrade changes it, in which case this ADR returns for re-approval.
- The staged copy is plaintext for a moment inside the profile folder. For unprotected profiles this adds no exposure (the live database is already plaintext there); it must be redesigned for protected profiles in L2.
- Users who forget the backup password cannot restore that backup. The UI explains this before export.

## Phase 2 verification (2026-10-17)

Verified in Electron 44.5.1 and Node 24, and guarded permanently by `tests/unit/db/encryption-mechanism.test.ts`:

1. Copy the live database with the online backup API.
2. Convert the copy to rollback-journal mode (`journal_mode = DELETE`) so it is one self-contained file.
3. Set `cipher = 'sqlcipher'`, `legacy = 4`, then `rekey` with the password.
4. Result: no plaintext and no SQLite header in the file; reopens with the password; integrity check passes; `kdf_iter` = 256000 (SQLCipher v4 default); wrong password fails with `SQLITE_NOTADB`; truncated file fails with `SQLITE_CORRUPT`.

## Phase 5 implementation (2026-10-17)

- **Backup file** (`.pfbackup`): one SQLCipher v4-compatible encrypted SQLite file containing the profile's tables plus a `backup_manifest` row (format, format version, app version, schema version, profile ID and name, creation time, per-table counts, and plain-language lists of what is included and omitted).
- **Passwords** reach SQLite only as bytes through the driver's `key()`/`rekey()` methods, never as SQL text. Minimum length 10 (checked in the UI and at the IPC boundary). Not stored, logged, or remembered.
- **Export**: online backup of the open database → single-file copy → manifest → encrypt → verify → write to `<destination>.partial` → verify the written file → rename. Free disk space is checked first; a full disk or interrupted write leaves no partial file.
- **Validation** on every read: decrypts, `integrity_check`, manifest present and valid, format and schema not newer than this app, `user_version` equals the manifest, row counts equal the manifest, no broken references.
- **Restore** always works on a copy in `tmp/`: validate → drop the manifest → decrypt → upgrade the schema if the backup is older → integrity and reference checks. Then:
  - *Test restore*: report counts, then delete the copy.
  - *Restore as new profile*: register the copy as a new profile with a unique name.
  - *Replace current profile*: save a verified `pre-restore-*.db` snapshot of the current data, then swap atomically with a journal (`replace.journal`). If the swapped-in file cannot be opened, the original is put back. If the app stops mid-swap, the next open finishes or undoes it.
- **JSON export**: `{ format: "projectforge-export", formatVersion: 1, encrypted: false, ... data }` with every profile table's rows under their database column names (snake_case), including trashed rows. Validated against its schema before writing; written via a `.partial` file and rename.
- Measured: export about 0.8 s, check about 0.25 s, test restore about 1.2 s, restore 1–4 s for a small profile. Most of the time is the deliberate SQLCipher key derivation (256,000 iterations, about 0.3 s per open).
