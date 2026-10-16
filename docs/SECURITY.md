# Security and Privacy

Status: **Electron boundary implemented and verified in Phase 2** (2026-10-17); backup encryption mechanism verified, feature planned for Phase 5.

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
| Development repository served by Apache (`htdocs`) | `.htaccess` deny-all (verified: HTTP 403 for repository files); no real data or secrets in the repository; generated files in gitignored folders | Depends on Apache honouring `.htaccess`; applies until the repository is moved |
| Unintended network transmission | No telemetry, crash upload, analytics, remote content, or update checks; CSP blocks remote sources | — |
| Tampered installed application files | Electron fuses and ASAR integrity validation (verified on the packaged executable) | Unsigned installer: no publisher verification; SmartScreen warns |

## 3. Electron hardening checklist

Each item is verified by an automated or documented manual check before release. Status as of Phase 2 (2026-10-17); "E2E" = Playwright test against the built app, "unit" = Vitest, "inspected" = configuration reviewed, "fuses" = read back from the packaged executable.

- [x] `contextIsolation: true` — E2E (`require`, `process`, `module` undefined in renderer)
- [x] `nodeIntegration: false` — E2E
- [x] `sandbox: true` (plus `app.enableSandbox()`) — inspected; preload is a single bundled file requiring only `electron`
- [x] `webSecurity: true`; no `allowRunningInsecureContent` — inspected
- [x] App content served from a custom privileged protocol (`app://renderer`), not `file://` — E2E; path traversal rejected — unit
- [x] Restrictive Content Security Policy sent as a response header: `default-src 'self'`, no remote origins, no `unsafe-inline`, no `unsafe-eval` — E2E + unit. The development server uses a relaxed policy (inline scripts for hot reload); it is never active in built or packaged apps.
- [x] `setWindowOpenHandler` denies new windows; only http/https/mailto URLs go to `shell.openExternal` — E2E (`window.open` returns null) + unit (allowlist)
- [x] `will-navigate` blocked except for the app's own origin — E2E
- [x] `<webview>` attachment blocked — inspected
- [x] Permission request and check handlers deny everything — inspected
- [x] IPC handlers verify `senderFrame` origin and validate payloads with Zod; unknown fields rejected — unit + E2E
- [x] Preload exposes named functions only; no raw `ipcRenderer`, no generic invoke — E2E (exact API key list)
- [x] No arbitrary filesystem path from the renderer — inspected (no channel accepts a path; profile IDs must be UUIDs)
- [x] No shell command execution anywhere — inspected
- [x] Electron fuses: `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`, `GrantFileProtocolExtraPrivileges` disabled; ASAR integrity validation, `OnlyLoadAppFromAsar`, cookie encryption enabled — fuses
- [x] DevTools disabled and application menu removed in packaged builds — inspected
- [x] Single-instance lock — inspected
- [ ] Re-verify the whole list in Phase 6 (release gate)

## 4. Exported backup encryption (MVP)

Design approved 2026-10-17; mechanism verified in Phase 2 and guarded by `tests/unit/db/encryption-mechanism.test.ts`. The backup feature itself is built in Phase 5.

- Library: `better-sqlite3-multiple-ciphers` (SQLite3MultipleCiphers), using its **SQLCipher v4-compatible** cipher configuration (`cipher='sqlcipher'`, `legacy=4`) so backups can be opened with standard SQLCipher tools by the user if ever necessary. No custom cryptography, key derivation, or file format.
- Key derivation: SQLCipher v4 defaults. Verified value: `kdf_iter` = 256000. Other parameters are the library's SQLCipher v4 defaults and are not overridden.
- Process: online backup API copies the live DB to `profiles/<id>/tmp/` → the copy is switched to rollback-journal mode → encrypted in place with the password (rekey) → reopened with the password and verified (integrity check, schema version, manifest, record counts) → atomically moved to the user-chosen destination. The temporary plaintext copy lives in the same folder as the already-plaintext live database, so it creates no new exposure for unprotected profiles. This must be revisited for protected profiles in L2.
- Password: entered twice at export, minimum 10 characters, never stored, logged, or remembered after the operation.
- A wrong password and a damaged file are indistinguishable by design; the message says "wrong password or damaged file".

## 5. Content handling

- Markdown: rendered with `react-markdown`, no raw HTML plugins; links pass the external-link allowlist.
- Input size limits: profile names 100 characters (implemented). Planned: titles 500 characters, descriptions and notes 1 MB, import files size-checked before parsing; each limit is set in the Zod schema when its field is introduced.
- Logs: event names, IDs, counts, error names/codes, and stack frames only. Error **messages are not logged** because they can contain user content (unit-tested). Never content, titles, profile names, passwords, or user file paths.

## 6. Dependency policy

Before adding a dependency: purpose, whether a built-in suffices, licence, maintenance status, and security relevance are recorded in the pull request or ADR. Versions are pinned exactly in `package.json` and locked via `package-lock.json`, and must have been published at least two weeks earlier. `npm audit` is run at every phase checkpoint and findings are reported.

Dependency install scripts are governed by npm's `allowScripts` list in `package.json`. Currently all are **denied**: `better-sqlite3-multiple-ciphers` (uses its prebuilt binary instead), `esbuild` (platform binary comes from an optional dependency), and `electron-winstaller` (Squirrel installer format, unused). Any new install script requires a reviewed decision.
