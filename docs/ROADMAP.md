# Roadmap

Approved 2026-10-17. Each phase ends at a checkpoint; work stops until the product owner approves the next phase. Approval of one phase does not approve later phases.

## Phase 1 — Requirements and architecture ✔ approved

Requirements inventory, conflicts, stack comparison, storage design, recovery strategy, threat model, phase plan.

## Phase 1b — Planning documents ✔ approved

**Deliverables:** [REQUIREMENTS.md](REQUIREMENTS.md), [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md), [SECURITY.md](SECURITY.md), [TESTING.md](TESTING.md), this roadmap, [STATUS.md](STATUS.md), ADRs 0001–0007.

**Acceptance:** every source requirement traceable in the register; product owner approves the documents.

## Phase 2 — Foundation ✔ approved

Results are recorded in [STATUS.md](STATUS.md).

**Deliverables**
1. Native module spike: install `better-sqlite3-multiple-ciphers` for the chosen Electron version; confirm it loads in Electron and in the test runtime; confirm FTS5; confirm SQLCipher v4 encrypt/rekey/reopen flow. Stop and report if any fail.
2. `.htaccess` deny-all, `.gitignore`, `.editorconfig`.
3. electron-vite scaffold with strict TypeScript, ESLint, Prettier, Vitest, Playwright.
4. Hardened window and custom protocol; CSP; navigation and window-open blocking; fuses.
5. Typed preload bridge, IPC contract, Result/error model.
6. Local rotating logger without user content.
7. `app.db`, profile registry, first-run profile creation, switch, rename.
8. Migration runner with pre-migration snapshot and newer-version refusal.
9. Early unsigned NSIS installer build.

**Acceptance**
- App launches in development and from the installer.
- Automated test proves `require`/`process` are unavailable in the renderer.
- Automated test proves malformed IPC payloads and unknown channels are rejected.
- Migration tests pass, including failure rollback and newer-version refusal.
- Profiles are isolated (separate files) and survive restart.
- `npm run lint`, `typecheck`, `test`, `build`, `package` all succeed from a clean clone.

## Phase 3 — Core domain (services and persistence) ✔ approved

Projects, folders, tags, statuses, Inbox, tasks and subtasks, priorities, dates, dependencies, progress, trash/restore/purge.

**Acceptance:** every invariant in DATA_MODEL.md has a passing test; edge cases in TESTING.md §4 for these areas pass.

## Phase 4 — Core UI ✔ (delegated approval)

Design tokens and shared components; sidebar navigation; dashboard; project overview; list view; task details; search/filter/sort; quick add; themes; fixed shortcuts; empty/loading/error states.

**Acceptance:** component tests pass; end-to-end workflows 1–5 and 7 pass; keyboard-only walkthrough documented; layout checked at 1024×700 and 1920×1080.

## Phase 5 — Data safety ✔ (delegated approval)

Encrypted backup export with verification; restore test into temporary profile; restore as new or replacement; daily snapshots with retention; JSON export; profile trash.

**Acceptance (data-safety gate):** all backup/restore cases in TESTING.md §4 pass, including corrupt, truncated, wrong-password, interrupted, and newer-version inputs; end-to-end workflow 6 passes; restore performed into a separate profile.

## Phase 6 — Release hardening ✔ (delegated approval; see RELEASE_CHECKLIST.md)

Security checklist review; performance with ~5,000 tasks; upgrade test from fixtures; clean-install test on a second Windows account or VM; README with data locations and recovery; known limitations; `npm audit`.

**Acceptance (release gate):** clean install and launch; repeatable build; tested upgrade path; restore tested on a separate profile; no known critical data-loss or security defects; final acceptance checklist with actual results.

## After the MVP

Later Free Local Release steps L1–L6 as listed in [REQUIREMENTS.md](REQUIREMENTS.md#4-later-free-local-release). Each step is proposed with full acceptance criteria and approved individually. L2 (profile protection) requires an approved threat model and key/recovery design before any code.

### Next feature work: priority order (product owner, 2026-10-20)

1. Notes (R26 / L1.5)
2. Kanban board (L1.1)
3. Calendar (L3.4)

This is a priority order only. It does not approve implementing any of these features, does not change the Core MVP scope, and does not set the position of other later-release items (including L2). Each feature still needs its own proposal with full acceptance criteria and a separate approval.

| Feature | Approval | State |
|---|---|---|
| Notes | Product owner's go-ahead on 2026-10-20 ("let's go build it"); decisions accepted the same day | Implemented and verified |
| Kanban board | Product owner's go-ahead on 2026-10-20 ("do the kanban and calendar") | Implemented and verified ([STATUS.md](STATUS.md)) |
| Calendar | Same go-ahead | Implemented and verified for deadlines; milestones and recurring occurrences wait for L1.2 and L3.1 |
