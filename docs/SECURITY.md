# Security and Privacy

Status: **Approved design, not yet implemented** (2026-10-17).

## 1. What this application does and does not protect (MVP)

- **Exported backups** are encrypted with a password the user chooses at export time.
- **Live profile data is not encrypted** in the MVP. It is stored as ordinary files in the user's Windows profile folder, readable by anyone who can sign in as that Windows user, by administrators, and by malware running as that user.
- **JSON exports are not encrypted**; the app warns before saving one.
- The application never claims to be "secure" or "encrypted" in general terms.

Profile passwords and encryption at rest are release step L2 and require their own approved threat model and recovery design before implementation.

## 2. Threat model

**Assets:** project, task, and note content; file paths; backups; the ability to recover data.

| Threat | Mitigation (MVP) | Remaining limitation |
|---|---|---|
| Application bugs corrupt or lose data | Transactions, integrity checks on open, pre-migration snapshots, trash, verified backups | Untested code paths |
| Malicious or malformed import/backup file | Full validation before writing; size limits; no execution; opened read-only into a temporary location | — |
| Malicious Markdown or links in content | Markdown rendered without raw HTML; strict Content Security Policy; external links restricted to http/https/mailto and opened in the system browser | — |
| Compromised renderer (e.g. via injected content) | Context isolation, sandbox, no Node.js, narrow typed bridge, sender verification, schema validation on every IPC message, no generic file or shell API | Vulnerabilities in Electron/Chromium themselves (mitigated by staying on a supported Electron line) |
| Someone obtains an exported backup | Password encryption via SQLCipher scheme | Weak passwords; offline guessing |
| Another Windows account on the same PC | Windows per-user folder permissions on `%APPDATA%` | Administrators can read all data |
| Another person using the same Windows account; malware running as the user | **None in MVP** | Full access to live data. L2 protects data only while a profile is locked; decrypted data in memory and on screen is always exposed |
| Development repository served by Apache (`htdocs`) | `.htaccess` deny-all; no real data or secrets in the repository; generated files in gitignored folders | Applies until the repository is moved |
| Unintended network transmission | No telemetry, crash upload, analytics, remote content, or update checks; CSP blocks remote sources | — |
| Tampered installed application files | Electron fuses and ASAR integrity (to verify in Phase 2) | Unsigned installer: no publisher verification; SmartScreen warns |

## 3. Electron hardening checklist

Each item is verified by an automated or documented manual check before release.

- [ ] `contextIsolation: true`
- [ ] `nodeIntegration: false` (renderer cannot `require`)
- [ ] `sandbox: true`
- [ ] `webSecurity: true`; no `allowRunningInsecureContent`
- [ ] App content served from a custom privileged protocol (`app://`), not `file://`
- [ ] Restrictive Content Security Policy: `default-src 'self'`, no remote origins, no `unsafe-eval`
- [ ] `setWindowOpenHandler` denies new windows; allowlisted external URLs go to `shell.openExternal`
- [ ] `will-navigate` blocked except for the app's own origin
- [ ] Permission request handler denies all permissions not explicitly needed
- [ ] IPC handlers verify `senderFrame` origin and validate payloads with Zod
- [ ] Preload exposes named functions only; no raw `ipcRenderer`, no generic invoke
- [ ] No arbitrary filesystem path from the renderer; user-chosen paths come from main-process dialogs
- [ ] No shell command execution anywhere in the MVP
- [ ] Electron fuses: disable `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`; enable ASAR integrity validation and `OnlyLoadAppFromAsar` (exact configuration verified in Phase 2)
- [ ] DevTools and development-only features absent from production builds
- [ ] Single-instance lock

## 4. Exported backup encryption (MVP)

Design approved 2026-10-17; mechanism to be verified by a spike in Phase 2 before Phase 5 relies on it.

- Library: `better-sqlite3-multiple-ciphers` (SQLite3MultipleCiphers), using its **SQLCipher v4-compatible** cipher configuration so backups can be opened with standard SQLCipher tools by the user if ever necessary. No custom cryptography, key derivation, or file format.
- Key derivation and cipher parameters are the library's documented SQLCipher v4 defaults; the exact values are recorded here after verification in Phase 2.
- Process: online backup API copies the live DB to `profiles/<id>/tmp/` → the copy is encrypted in place with the password (rekey) → reopened with the password and verified (integrity check, schema version, manifest, record counts) → atomically moved to the user-chosen destination. The temporary plaintext copy lives in the same folder as the already-plaintext live database, so it creates no new exposure for unprotected profiles. This must be revisited for protected profiles in L2.
- Password: entered twice at export, minimum 10 characters, never stored, logged, or remembered after the operation.
- A wrong password and a damaged file are indistinguishable by design; the message says "wrong password or damaged file".

## 5. Content handling

- Markdown: rendered with `react-markdown`, no raw HTML plugins; links pass the external-link allowlist.
- Input size limits: titles 500 characters, descriptions and notes 1 MB, import files size-checked before parsing (limits finalised in Phase 2).
- Logs: error codes, stack traces, and operation names only; never content, titles, passwords, or user file paths.

## 6. Dependency policy

Before adding a dependency: purpose, whether a built-in suffices, licence, maintenance status, and security relevance are recorded in the pull request or ADR. Versions are pinned via `package-lock.json`. `npm audit` is run at every phase checkpoint and findings are reported.
