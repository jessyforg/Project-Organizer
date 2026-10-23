# Security and Privacy

Status: **Electron boundary implemented and verified** (Phases 2 and 4); **encrypted backups implemented and tested** (Phase 5), 2026-10-17.

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
- [x] Preload exposes named functions only, built from a fixed channel list and frozen; no raw `ipcRenderer`, no generic invoke — E2E (exact function list equals `IPC_CHANNELS`; objects frozen)
- [x] No arbitrary filesystem path from the renderer — inspected (none of the 51 channels accepts a path; IDs must be UUIDs)
- [x] Data channels refuse to run with no profile open (clear `NOT_FOUND` error) — E2E
- [x] Fonts and icons are bundled; the renderer loads nothing from the network — inspected (CSP `font-src 'self'`)
- [x] Backup and export files are chosen in main-process dialogs; the renderer receives only an opaque, expiring token and a file name, never a path — unit (`file-tokens.test.ts`) and inspected
- [x] The test-only dialog override (`PROJECTFORGE_TEST_DIALOG_DIR`) is ignored by packaged builds — inspected
- [x] No shell command execution anywhere — inspected
- [x] Electron fuses: `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments`, `GrantFileProtocolExtraPrivileges` disabled; ASAR integrity validation, `OnlyLoadAppFromAsar`, cookie encryption enabled — fuses
- [x] DevTools disabled and application menu removed in packaged builds — inspected
- [x] Single-instance lock — inspected
- [x] Whole list re-verified in Phase 6 against the packaged build (RELEASE_CHECKLIST.md)

## 4. Exported backup encryption (MVP)

Implemented in Phase 5 (`src/main/backup/`); see [ADR-0006](DECISIONS/0006-backup-and-export-formats.md) for the full flow and `tests/unit/backup/backup.test.ts` for the failure cases.

- Library: `better-sqlite3-multiple-ciphers` (SQLite3MultipleCiphers), using its **SQLCipher v4-compatible** cipher configuration (`cipher='sqlcipher'`, `legacy=4`) so backups can be opened with standard SQLCipher tools by the user if ever necessary. No custom cryptography, key derivation, or file format.
- Key derivation: SQLCipher v4 defaults. Verified value: `kdf_iter` = 256000. Other parameters are the library's SQLCipher v4 defaults and are not overridden.
- Process: online backup API copies the live DB to `profiles/<id>/tmp/` → the copy is switched to rollback-journal mode → encrypted in place with the password (rekey) → reopened with the password and verified (integrity check, schema version, manifest, record counts) → atomically moved to the user-chosen destination. The temporary plaintext copy lives in the same folder as the already-plaintext live database, so it creates no new exposure for unprotected profiles. This must be revisited for protected profiles in L2.
- Password: entered twice at export, minimum 10 characters, never stored, logged, or remembered after the operation. It is passed to SQLite as bytes via `key()`/`rekey()`, never inside SQL text.
- Staging copies (which are briefly plaintext during export and restore) live in `tmp/` inside the data folder and are deleted when each operation ends and again at every app start.
- A wrong password and a damaged file are indistinguishable by design; the message says "wrong password or damaged file".

## 5. Content handling

- Markdown (notes, implemented): rendered with `react-markdown` and `remark-gfm` only, with no raw-HTML plugin, so HTML in a note is shown as text and never becomes elements ([ADR-0009](DECISIONS/0009-markdown-notes.md)). Links open in the system browser only for `http`, `https`, and `mailto` (checked in the renderer and again by the main process's window-open handler); other links are inert text. Images are never loaded, because fetching one would contact a server; the preview shows "[Image not shown]" instead. Component tests cover each rule.
- **Images and files in notes** ([ADR-0017](DECISIONS/0017-notes-release-0.6.md) stage 6):
  - **Storage:** they are stored in the profile database.
  - **Types:** the type is decided from the bytes, never the name. Only PNG, JPEG, GIF, and WebP are shown as images; SVG never is.
  - **Names:** they are reduced to the file name alone.
  - **Showing images:** the bytes are read over a validated IPC channel that serves only images, and shown through object URLs. The Content Security Policy's only change is `img-src 'self' data: blob:`, which a unit test pins.
  - **Opening a file:** a copy is written to the app's temporary folder and given to the system's default app. Files whose extension runs code (`.exe`, `.bat`, `.ps1`, `.js`, `.lnk`, and others) are never opened from the app, only saved.
  - **Limits:** sizes are limited and free disk space is checked first.
- **Links between notes, tasks, and projects** ([ADR-0017](DECISIONS/0017-notes-release-0.6.md)) are Markdown links to `projectforge://note|task|project/<uuid>`.
  - Only that exact form is recognised, the same in the main process and the renderer (`src/shared/app-links.ts`).
  - They are never `<a href>` elements: the editor shows them as chips, and the preview shows them as buttons that navigate inside the app. So the address is never handed to the operating system or to the window-open handler.
  - The preview keeps these addresses through react-markdown's URL filter and applies the default filter to everything else.
  - Links inside code are text.
- Visual note editor ([ADR-0013](DECISIONS/0013-visual-note-editing.md)): content is parsed into the editor's schema, so only its node and mark types can exist and no HTML element from a note is created. Links other than `http`, `https`, and `mailto` render with an empty `href`; Ctrl+click opens allowed links through the same window-open check. Notes with raw HTML or images stay in Markdown mode, where the rules above apply. The editor injects no `<style>` tags, so the production Content Security Policy is unchanged.
- Note files ([ADR-0014](DECISIONS/0014-note-actions-import-and-folders.md)):
  - **Copy:** "Copy as Markdown" writes to the clipboard from the main process, given only a note ID. The renderer keeps all browser permissions denied.
  - **Export:** writes only to a path chosen in the main process's save dialog, with content read from the database.
  - **Import:** files are read in the renderer, and their parsed text reaches the main process through one zod-validated channel with limits of 50 notes, 1 MB per body, and 500 characters per title. The main process never opens a path supplied by the renderer.
- Colour palettes ([ADR-0015](DECISIONS/0015-notes-views-archive-colours-menus.md)) are applied as CSS custom properties through the CSSOM (`style.setProperty`), which the Content Security Policy allows; no `<style>` element or `unsafe-inline` is needed. Palette names are validated (zod enums) before they are stored.
- Input size limits (Zod, implemented): profile names 100 characters, names 200, titles 500, descriptions and note bodies 1,000,000 characters. Planned: import files size-checked before parsing.
- Logs: event names, IDs, counts, error names/codes, and stack frames only. Error **messages are not logged** because they can contain user content (unit-tested). Never content, titles, profile names, passwords, or user file paths.

### Icons and covers (ADR-0019)

- **Icons** are chosen from a fixed list of 60 built-in values. The IPC schema and the service both refuse anything else, and nothing is fetched.
- **Cover presets** are a fixed list. A cover image goes through the same attachment store as note images:
  - images are detected from their bytes;
  - the 20 MB and 1 GB limits and the free-space check apply;
  - images are shown through `blob:` URLs.
- **Content Security Policy:** unchanged.
- **Stored values:** a stored cover value is parsed before use. An unknown value, or an image ID that is not a UUID, is ignored.

## 6. Dependency policy

Before adding a dependency: purpose, whether a built-in suffices, licence, maintenance status, and security relevance are recorded in the pull request or ADR. Versions are pinned exactly in `package.json` and locked via `package-lock.json`, and must have been published at least two weeks earlier. `npm audit` is run at every phase checkpoint and findings are reported.

Dependency install scripts are governed by npm's `allowScripts` list in `package.json`. Currently all are **denied**: `better-sqlite3-multiple-ciphers` (uses its prebuilt binary instead), `esbuild` (platform binary comes from an optional dependency), and `electron-winstaller` (Squirrel installer format, unused). Any new install script requires a reviewed decision.
