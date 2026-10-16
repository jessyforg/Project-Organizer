# Project Status Log

Newest entries first.

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
