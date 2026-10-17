# Release Checklist — 0.1.0 (MVP)

Each item is marked **pass**, **fail**, **blocked**, or **not tested**, with the evidence. Results recorded 2026-10-17 on Windows 11 Home (x64), Electron 44.5.1.

## Release gate (ROADMAP.md, Phase 6)

| Gate item | Result | Evidence |
|---|---|---|
| Clean installation and launch on the target Windows environment | **pass** (same machine, current user) | Silent per-user install (`/S`) to `%LOCALAPPDATA%\Programs\ProjectForge`: exit code 0, Start menu shortcut and uninstall entry created; installed app launched and logged `window.loaded`. Verified beforehand that no previous install, shortcut, uninstall entry, or data folder existed. |
| Install on a separate clean account or VM | **not tested** | Windows 11 Home has no Windows Sandbox; creating a Windows account or VM was not done. Recommended before public distribution. |
| Uninstall | **pass** | Silent uninstall: exit code 0; program folder, shortcut, and uninstall entry removed; user data folder kept (by design). Test data then removed. |
| Repeatable build and package process | **pass** | `npm ci` → `npm run check` → `npm run package` succeeded from a clean copy (Phase 2) and from the working tree (Phase 6). Exact dependency versions locked. |
| Tested upgrade/migration path for supported prior versions | **pass** | Committed fixture databases for every schema version so far (`tests/fixtures/`: app v1, profile v1, profile v2) upgrade to the current schema with integrity, references, and data intact (`tests/unit/fixtures.test.ts`). Older-schema backups also upgrade on restore. No prior public release exists. |
| Backup and restore procedure tested on a separate profile | **pass** | End-to-end: encrypted export → test restore → restore as a new profile → contents match (`tests/e2e/backup.spec.ts`). Unit tests cover every failure case in TESTING.md. |
| No known critical data-loss or security defects | **pass** | The one critical defect found (rollback during database replacement could delete original data) was fixed in Phase 5 and is guarded by a test. No open critical defects. |
| Known limitations and recovery documented | **pass** | README "Known limitations" and "If something goes wrong"; SECURITY.md §1–2. |

## Quality checks

| Check | Result | Evidence |
|---|---|---|
| Typecheck, lint, formatting | **pass** | `npm run check` |
| Unit, persistence, and component tests | **pass** | 211 of 211 |
| End-to-end tests (all 7 roadmap workflows, security, profile trash, theme) | **pass** | 9 of 9 (`npm run test:e2e`); core suites also passed 5 repeated runs in Phase 4 |
| Accessibility scan (axe-core, WCAG 2.2 A/AA) of all main screens and the new-task dialog, light and dark | **pass** | 0 violations (`tests/e2e/accessibility.spec.ts`); scanner confirmed to catch injected violations |
| Text contrast | **pass** | Every text colour checked numerically against WCAG AA 4.5:1 on its backgrounds (Phase 4) |
| Keyboard operation | **pass** (automated paths) / **not tested** (full manual pass) | Shortcuts and Enter/Escape flows exercised in E2E; full manual keyboard and screen-reader pass not done |
| Screen reader (NVDA or Narrator) | **not tested** | Recommended before public distribution |
| Performance with 5,000 tasks + 1,250 subtasks (20 projects) | **pass** | Through the real UI: Today 244 ms, My tasks (500 rows) 153 ms, load 500 more 267 ms, project page 136 ms, complete a task 103 ms, global search 275 ms; main process 174 MB; database 3.9 MB |
| Window sizes | **pass** | Reviewed at 1280×800 and 1024×700 in both themes; minimum window 900×600 |

## Security

| Check | Result | Evidence |
|---|---|---|
| Electron hardening checklist | **pass** | All items in SECURITY.md §3 verified; renderer isolation, exact bridge surface, IPC validation, CSP, navigation and pop-up blocking tested end to end |
| Fuses on the packaged executable | **pass** | RunAsNode, NODE_OPTIONS, CLI inspect, file-protocol privileges disabled; ASAR integrity, OnlyLoadAppFromAsar, cookie encryption enabled (read back from `release/win-unpacked/ProjectForge.exe`) |
| Production dependency vulnerabilities | **pass** | `npm audit --omit=dev`: 0 |
| Build-tool dependency vulnerabilities | **accepted** | 8 moderate, all one `sprintf-js` advisory in electron-builder's download proxy support; build-time only; the suggested fix is a downgrade (ADR-0002) |
| No network use | **pass** | No telemetry, update checks, or remote content; CSP blocks remote origins; fonts and icons bundled |
| Code signing | **not done (by decision)** | Installer unsigned; Windows SmartScreen will warn (ADR-0002) |

## Before a public release

1. Upgrade Electron to the newest 44.x patch that is at least two weeks old (44.5.1 is pinned; later patches include Chromium security fixes), then rerun this checklist.
2. Install and use the app on a clean Windows account or VM.
3. Do a manual keyboard-only and screen-reader pass (NVDA or Narrator).
4. Freeze the product name and `appId` (they determine the data folder; ADR-0002).
5. Decide on code signing.
