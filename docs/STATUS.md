# Project Status Log

Newest entries first.

## 2026-10-17 — Phase 3: Core domain implemented (awaiting approval)

**Scope completed:** profile schema v2 (folders, projects, workflow statuses, tasks and subtasks, tags, dependencies, full-text search) with database guards; services for folders, tags, projects (archive, completion suggestion, progress), statuses (add, rename, reorder, default, remove with reassignment), tasks (create, update with notices, move between projects, manual reorder, filtered and sorted listing), dependencies (cycle prevention), trash (task and project batches, restore rules, permanent delete, empty, 30-day purge), and global search; the Inbox; profile maintenance on open and daily. Requirements covered at the service level: R04–R14, R18 (query layer), R28.

**Not included (by plan):** IPC channels and UI for these features (Phase 4); profile trash R15 (Phase 5).

**Decisions made within the approved scope:** services own their SQL (ADR-0003 refinement); folders and tags are deleted immediately rather than trashed (only tasks and projects have a trash, per R14); the default status must be "to do" or "in progress"; the last "done" status cannot be removed; done and cancelled prerequisites count as satisfied; moving a task maps statuses by category and removes cross-project dependencies; new tasks cannot be added to archived projects; permanent deletion removes dependency links (users are warned about dependents first).

**Verification (2026-10-17):**

| Check | Command | Result |
|---|---|---|
| Typecheck, lint, formatting | `npm run check` | Passed |
| Unit, persistence, and invariant tests | `npm test` | Passed — 158 of 158 (93 new) |
| Test strength | Three rules deliberately broken (cycle check, parent exclusion in progress, unresolved-dependency report) | Each caught by its tests (6 failures); files restored and tests pass |
| End-to-end and security tests | `npm run test:e2e` | Passed — 3 of 3 (profile opening now runs migration v2 and maintenance) |
| Upgrade of a Phase 2 profile | Unit test (v1 → v2) | Passed — data kept, snapshot taken |
| Performance probe (temporary, deleted) | 6,250 tasks | List/filter/search 3–38 ms; progress for 20 projects 21 ms |

**Fixed during the phase:** README formatting from the Phase 2 commit did not pass `prettier --check` (it was edited after that phase's final check); now formatted.

**Known limitations:** no UI for any Phase 3 feature yet; the Inbox name is fixed in English; subtasks are limited to one level (approved decision C14).

**Next step:** Phase 4 — Core UI, after approval.

## 2026-10-17 — Phase 2: Foundation implemented (awaiting approval)

**Scope completed:** all nine Phase 2 deliverables in [ROADMAP.md](ROADMAP.md). Not included (by plan): projects, tasks, design system, backups.

**Environment changes:** Visual Studio 2022 Build Tools with the C++ workload installed on the development machine (approved by the product owner). Turned out not to be required for the current driver, which ships Node-API prebuilt binaries; kept as a fallback.

**Verification (all run on 2026-10-17):**

| Check | Command | Result |
|---|---|---|
| Typecheck (main, renderer, e2e configs) | `npm run typecheck` | Passed |
| Lint | `npm run lint` | Passed |
| Formatting | `npm run format:check` | Passed |
| Unit and persistence tests | `npm test` | Passed — 65 of 65 |
| End-to-end and security tests | `npm run test:e2e` | Passed — 3 of 3 |
| Clean copy: install, checks, package | `npm ci`, `npm run check`, `npm run package` in a fresh folder | Passed |
| Development launch | `npm run dev` (temporary data folder) | Passed — log shows `window.loaded` |
| Packaged app launch | `release\win-unpacked\ProjectForge.exe` | Passed — log shows `app.started`, `window.loaded`; test data folder removed afterwards |
| Fuses on packaged executable | `@electron/fuses read` | Passed — as configured |
| Installer signature | `Get-AuthenticodeSignature` | NotSigned (expected) |
| Apache cannot serve the repository | HTTP requests to repository files | Passed — HTTP 403 |
| Dependency audit | `npm audit` | 0 production vulnerabilities; 8 moderate in build tooling (one `sprintf-js` advisory, build-time only), not fixed — see ADR-0002 |
| Running the NSIS installer | — | **Not tested** (installs into the user's Programs and registry; left for the product owner or Phase 6) |

**Defects found and fixed during the phase:** migration snapshots left `-wal`/`-shm` side files (snapshots now converted to single files); the logger could have written error messages containing user content (now logs only names, codes, and stack frames); `GrantFileProtocolExtraPrivileges` fuse was enabled by default (now disabled); installer shipped SQLite binaries for every platform (now Windows x64 only).

**Known limitations:** installer unsigned (SmartScreen warning); default Electron icon; renderer UI is a minimal Phase 2 shell (profile management and About only); startup failures are shown in a native error dialog rather than a recovery screen (recovery UI comes with Phase 5); no profile trash yet (Phase 5).

**Next step:** Phase 3 — Core domain, after approval.

## 2026-10-17 — Phase 1b: planning documents written

- **Completed:** Phase 1 analysis approved by the product owner, including all recommended conflict resolutions and encrypted exported backups in the MVP (C1). Planning documents and ADRs 0001–0007 written.
- **Outstanding:** Product owner review and approval of the planning documents.
- **Decisions:** Recorded in [REQUIREMENTS.md §6](REQUIREMENTS.md#6-resolved-conflicts-and-decisions-approved-2026-10-17) and [DECISIONS/](DECISIONS/).
- **Risks:** Native SQLite module compatibility with Electron 44 is unverified (Phase 2 spike). Repository lives under Apache `htdocs` until moved. Installer is unsigned.
- **Code:** None written. No dependencies installed.
- **Next step:** Phase 2 — Foundation, after approval.

## 2026-10-17 — Phase 1: discovery

- Repository contained only `README.md` (one commit, clean tree, remote `origin` on GitHub).
- Environment: Windows 11 Home x64, Node 24.20.0, npm 11.19.0, Git 2.47, Python 3.12.6, Visual Studio Build Tools 2019 (C++ workload unverified), WebView2 runtime present; Rust and .NET SDK not installed. XAMPP Apache and MySQL running.
- Stack compared (Electron, Tauri 2, .NET); Electron selected ([ADR-0001](DECISIONS/0001-desktop-framework.md)).
