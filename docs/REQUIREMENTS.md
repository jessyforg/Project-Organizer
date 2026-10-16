# Requirements Register

Working product name: **ProjectForge** (temporary; see [ADR-0002](DECISIONS/0002-build-and-packaging.md) for name-freeze rules).

Source: *Project Organizer — Free, Local-First Master Prompt* (revised edition). Section references (§) point to that document. Release classification approved by the product owner on **2026-10-17**.

## 1. Product constraints (non-negotiable)

- Local-first and local-only: fully functional offline after installation.
- No required operating costs: no paid services, SDKs, APIs, hosting, or subscriptions.
- Free to use: no accounts, licence servers, or paid feature gates.
- Privacy by default: no telemetry, crash upload, update checks, or content transmission.
- User data belongs to the user: local backup, restore, export, and deletion controls.
- Future-compatible, not future-built.

Trade-off order when requirements compete: (1) data safety and recoverability, (2) core workflow correctness, (3) ease of use and accessibility, (4) maintainable architecture and tests, (5) additional features.

## 2. Legend

- **Priority:** Must / Should / Could / Deferred.
- **Release:** MVP = Core MVP; L1–L6 = Later Free Local Release step (in recommended order); F = Future Optional Expansion.
- **Status:** Proposed, Approved, In progress, Verified, Deferred, Blocked. "Approved" means the classification is approved; it does not mean implemented.

## 3. Core MVP

| ID | Requirement | Pri | Depends on | Acceptance criteria | Risk | Status |
|---|---|---|---|---|---|---|
| R01 | Windows desktop application shell with a clear, consistent UI | Must | — | App launches in its own window from the installer and in development; navigation reaches every MVP screen | Low | Approved |
| R02 | Local persistent database per profile with migrations and integrity checks | Must | R01 | Fresh DB is created and migrated; `integrity_check` and `foreign_key_check` run on open; failure shows recovery screen, never an empty DB | Data loss | Approved |
| R03 | Local profiles: first-run creation, reopen last-used, switch via Settings, rename keeping stable ID, isolation between profiles | Must | R02 | First launch requires profile creation; restart reopens last profile; rename keeps ID and data; no query can return another profile's records (separate DB files) | Data leakage | Approved |
| R04 | Projects: required name, optional description, status Active/Completed (default Active), kind general/software, colour, start/target dates | Must | R02 | CRUD persists across restart; empty name rejected with message | Low | Approved |
| R05 | Suggest marking a project Completed when all applicable tasks are done (requires confirmation); on reopen, notify without silently changing status | Should | R04, R08, R13 | Suggestion appears only when all non-cancelled tasks are done; status never changes without confirmation | Low | Approved |
| R06 | Archive: hidden from active views, searchable, labelled Archived, restorable with unfinished tasks unchanged | Must | R04 | Archived project absent from dashboard/active lists, present in search with label; unarchive restores identical state | Low | Approved |
| R07 | Simple folders (single level) and project tags | Must | R04 | Projects can be moved between folders and tagged; deleting a folder never deletes projects (they move to "no folder") | Low | Approved |
| R08 | Tasks: title, description, status, priority (Urgent/High/Medium/Low/none), optional start and due dates, one level of subtasks, tags | Must | R04, R09 | Priority defaults to none, never Low; subtask cannot itself have subtasks in MVP; all fields persist | Low | Approved |
| R09 | Per-project status list; each status has a category (todo, in_progress, done, cancelled); default workflow seeded; rename/reorder/add statuses; removing an in-use status requires choosing a replacement | Must (model) / Should (editing UI) | R04 | New projects get defaults; removal of in-use status blocked until replacement chosen; history/completion data preserved | Data integrity | Approved |
| R10 | Default task view grouped by status, sorted Urgent → High → Medium → Low → none; alternative sorts: due date, creation date, manual | Must | R08, R09 | Sort order verified by tests including no-priority tasks last | Low | Approved |
| R11 | Dated tasks first; undated tasks in a separate group afterwards; never invent deadlines | Must | R08 | Undated group appears after dated tasks in deadline sort | Low | Approved |
| R12 | Task dependencies within the same project: show prerequisites in details and views; warn on unfinished prerequisites without blocking; prevent cycles; completed prerequisites count as satisfied; warn when deleting a task others depend on, naming affected tasks | Must | R08 | Cross-project link rejected; cycle (direct and indirect) rejected; status change allowed with warning | Complexity | Approved |
| R13 | Deterministic progress calculation, labelled "calculated" (rules in [DATA_MODEL.md](DATA_MODEL.md#progress-calculation)) | Must | R08, R09 | Unit tests cover no tasks, all cancelled, parent with/without subtasks, reopen | Correctness | Approved |
| R14 | Recoverable trash for tasks (parent and subtasks together) and projects; 30-day automatic purge; early permanent deletion; empty trash; dependency links preserved and unresolved links flagged on restore | Must | R08, R12 | Restore returns whole hierarchy; purge tested with controllable clock; restoring never recreates permanently deleted records | Data loss | Approved |
| R15 | Profile trash with 30-day retention, early permanent deletion | Should | R03 | Trashed profile hidden from switcher, restorable within 30 days | Data loss | Approved |
| R16 | Dashboard: active projects, upcoming deadlines, open tasks, overdue tasks, recently updated, progress | Must | R08, R13 | Every number derived from DB; no demo data; empty states shown | Low | Approved |
| R17 | Project overview (progress, deadlines, recently updated) before the detailed workspace | Must | R13 | Opening a project shows overview first | Low | Approved |
| R18 | List view; global and per-project search; filters (project, status, priority, tag, date range); sorting | Must | R08 | Filtering executed in SQL; clearing filters restores default view; search covers project names, task titles and descriptions | Performance | Approved |
| R19 | Password-encrypted exported profile backup; verification before reporting success; restore test into a temporary profile; restore as new profile or replace existing (after backing up destination) | Must | R02, R03 | See Data-safety gate in [ROADMAP.md](ROADMAP.md); corrupt, truncated, wrong-password, interrupted and newer-version backups rejected safely | Highest | Approved |
| R20 | Automatic local snapshots: always before a migration; daily with fixed retention (7 daily) | Should | R02 | Snapshot exists and passes integrity check before any migration runs | Data loss | Approved |
| R21 | JSON export of a project or profile, with an "unencrypted" warning | Should | R08 | Export validates against its own schema; warning shown before saving | Privacy | Approved |
| R22 | Accessibility basics: light/dark/system theme, visible focus, keyboard navigation, no colour-only signals, reduced motion | Must | R01 | Keyboard-only walkthrough of core flows passes; contrast meets WCAG AA for text | Low | Approved |
| R23 | Fixed essential keyboard shortcuts (navigation, search, quick add) with in-app reference | Should | R01 | Shortcuts do not override Windows/accessibility shortcuts | Low | Approved |
| R24 | Structured error handling; local rotating logs without user content | Must | R01 | Every IPC call returns a typed result; logs contain no titles, notes, or paths of user content | Privacy | Approved |
| R25 | Repeatable Windows installer build; documented data locations | Must | R01 | Clean build from lockfile produces installer; install/launch/uninstall tested on a clean account or VM | Compatibility | Approved |
| R26 | Markdown notes per project with safe preview | Could | R04 | Raw HTML never rendered; unsaved-change guard; moves to L1 if it threatens the release | XSS | Approved |
| R27 | Project resource links (repository, branch, commit, PR URLs) | Could | R04 | Only http/https links opened, via system browser after allowlist check | Low | Approved |
| R28 | Built-in Inbox project per profile for quick-added tasks | Must | R04 | Inbox cannot be deleted; quick add lands there | Low | Approved |

## 4. Later Free Local Release

Acceptance criteria below are the minimum; each step gets full criteria when it is scheduled.

| ID | Requirement | Pri | Depends on | Key acceptance criteria | Risk |
|---|---|---|---|---|---|
| **L1 — visible productivity** |||||
| L1.1 | Kanban board reflecting each project's statuses, with keyboard alternative to drag-and-drop | Should | R09 | Moves persist status and order; accessible move menu | Low |
| L1.2 | Milestones: name, description, target date, completion, progress, optional task association | Should | R04 | Distinct from tasks; progress uses R13 rules over associated tasks | Low |
| L1.3 | Dashboard milestone indicators | Should | L1.2 | — | Low |
| L1.4 | Dashboard sections show/hide/reorder, per profile (no free-form resizing) | Could | R16 | Preferences persist per profile | Low |
| L1.5 | Markdown notes (if R26 slipped); document list with search, tags, simple folders | Should | R04 | As R26 | XSS |
| **L2 — profile protection (security workstream; threat model and recovery design approved first)** |||||
| L2.1 | Optional profile password; verifier stored with a memory-hard KDF, never plaintext | Must (for L2) | R03 | Wrong password rejected; no plaintext anywhere | Security |
| L2.2 | Encryption of protected profile data at rest | Must (for L2) | L2.1 | Interrupted encrypt/decrypt leaves original intact | Data loss |
| L2.3 | Recovery key, securely generated, user confirms it was saved; explain irrecoverable loss | Must (for L2) | L2.2 | Recovery tested end to end | Data loss |
| L2.4 | Inactivity lock (default 15 minutes, configurable); lock on profile switch | Must (for L2) | L2.1 | — | Low |
| L2.5 | Enable/disable protection after authentication and confirmation | Must (for L2) | L2.2 | Conversion is atomic and verified | Data loss |
| L2.6 | Protected backups preserve protection; profile or separate backup password; password change does not invalidate older backups | Must (for L2) | R19, L2.2 | — | Security |
| **L3 — time-based features** |||||
| L3.1 | Recurring tasks: daily, weekly, monthly, custom; original-schedule recurrence | Should | R08 | Occurrences generated once per series and scheduled time, across restarts and offline periods | Duplication |
| L3.2 | Per-occurrence status, deadline, history; skip or reschedule a single occurrence; missed occurrences stay overdue | Should | L3.1 | — | Correctness |
| L3.3 | Completion-based recurrence option | Could | L3.1 | — | Low |
| L3.4 | Calendar day/week/month showing deadlines, milestones, occurrences, overdue tasks; navigate to task | Should | R08 | Deadline change moves entry immediately | Low |
| L3.5 | Reminders: pre-deadline, recurring, optional overdue; recalculated on deadline change; no duplicates; DST- and time-zone-aware | Should | L3.4 | Never claims delivery that cannot be confirmed | Correctness |
| L3.6 | Windows desktop notifications with permission handling; in-app notification centre with read/unread, priorities, preferences | Should | L3.5 | — | Low |
| **L4 — organisation** |||||
| L4.1 | Starter templates: software development, personal productivity, study and learning | Should | R04, R09 | Creating from template never modifies template | Low |
| L4.2 | Save a project structure as a reusable template | Should | L4.1 | — | Low |
| L4.3 | Bugs as specialised tasks: severity, reproduction steps, expected, actual; link to tasks and milestones | Should | R08, L1.2 | — | Low |
| L4.4 | Smart collections with simple rules | Could | R07 | Auto-update when projects change | Low |
| L4.5 | Saved views: filters, sorting, grouping, visible fields, view settings | Should | R18 | — | Low |
| **L5 — history and rich records** |||||
| L5.1 | Version history for projects, project settings, tasks, notes; preview, compare, reversible restore; configurable retention | Should | R08 | Pre-restore state preserved | Data loss |
| L5.2 | Activity feed (replaces "recently updated") | Should | L5.1 | — | Low |
| L5.3 | Task comments with mentions and optional attachments | Could | R08, L5.4 | — | Low |
| L5.4 | Attachments: managed copies, local file references, web links; metadata and size; missing-file warning; disk-space checks; included in backups | Should | R19 | Failed uploads leave no partial file marked successful; path traversal prevented | Data loss / security |
| L5.5 | Time tracking: timer (start/pause/resume/stop), manual entries, task/project summaries, daily log, edit/delete history, overlapping-timer prompt | Should | R08 | Overlapping time never double-counted | Correctness |
| **L6 — portability and power-user features** |||||
| L6.1 | CSV export of structured data | Should | R08 | — | Privacy |
| L6.2 | CSV import of projects/tasks with preview, validation, duplicate skipping, rejection report; never updates existing records | Could | L6.1 | All-or-nothing per import | Data integrity |
| L6.3 | PDF reports (project and profile summary, selectable sections, saved layouts) with a free local library; never silently overwrite | Could | R13 | — | Low |
| L6.4 | Project package export (selected data types, optional file copying, size estimate, missing-file report, optional encryption) | Could | L5.4 | — | Privacy |
| L6.5 | Project package import as new project with preview, unique-name suggestion, all-or-nothing, crash recovery | Could | L6.4 | — | Data integrity |
| L6.6 | Profile duplication with selectable content; new identity | Could | R03 | — | Low |
| L6.7 | Operation history for imports/exports; retention; CSV export; eligible retries linked to originals | Could | L6.5 | Retry never duplicates changes | Duplication |
| L6.8 | Customisable shortcuts with conflict detection and reset | Could | R23 | — | Low |
| L6.9 | Custom task weights and authorised manual progress overrides | Could | R13 | Override clearly labelled; no double-counting | Correctness |
| L6.10 | Approval workflow: Completed vs Approved; per-project rules for progress counting and reopen clearing approval; approval history preserved | Could | R09, L5.1 | — | Correctness |
| L6.11 | Per-project rules for cancelled tasks and skipped occurrences in progress | Could | R13, L3.2 | — | Correctness |
| L6.12 | Rich-text documents alongside Markdown, per-document format preserved through export/backup | Could | L1.5 | — | XSS |
| L6.13 | Adjustable text size; standard/compact density | Could | R22 | — | Low |
| L6.14 | Configurable automatic backup schedule and retention | Could | R20 | — | Low |

## 5. Future Optional Expansion

Each item requires a separate product decision, threat model, and opt-in design. None may make an account, server, or network connection necessary for ordinary local use.

| ID | Requirement | Reason for deferral | Reconsider when |
|---|---|---|---|
| F1 | Cloud sync with conflict detection, side-by-side resolution, idempotent retries | Requires hosted infrastructure and ongoing cost | A free, user-owned sync target is chosen (e.g. user's own folder) |
| F2 | Accounts, authentication, 2FA, sessions, revocation | Requires servers | F1 or F3 approved |
| F3 | Team workspaces, multiple assignees, collaborators, shared views, roles and permissions, audit logs | Personal MVP first | Real multi-user need confirmed |
| F4 | "Team projects" starter template | Meaningless without F3 | F3 approved |
| F5 | GitHub account integration, issue/PR association | External account, network | Developer features in L4 stable |
| F6 | External calendar synchronisation | External account, network | L3 stable |
| F7 | Hosted AI features | Paid APIs, privacy | Explicit opt-in design |
| F8 | Mobile apps, macOS, Linux | Windows first | Windows MVP released |
| F9 | Plugin ecosystem, advanced automation and analytics | Premature abstraction | Concrete use cases exist |
| F10 | Automatic update checks | Network transmission | Explicit opt-in decision |
| F11 | Direct messages, group chat, discussion boards; real-time collaborative editing | Requires F3 | F3 approved |

## 6. Resolved conflicts and decisions (approved 2026-10-17)

| ID | Conflict | Resolution |
|---|---|---|
| C1 | Exported backups must be encrypted (§17) vs encryption gated | Exported backup encryption is in MVP using the database driver's SQLCipher support; no custom cryptography ([ADR-0006](DECISIONS/0006-backup-and-export-formats.md)) |
| C2 | Automatic backups vs never storing backup passwords | Automatic snapshots are internal, stored in the profile folder with the same protection as the live DB; only exported backups are password-encrypted |
| C3 | Profile protection required vs encryption not superficial | MVP ships unprotected profiles only and makes no encryption claim about live data; protection is L2 |
| C4 | Data safety first vs backups in late phase | Backup/restore is MVP and precedes release |
| C5 | Rich progress rules vs MVP simplicity | MVP: equal-weight leaf counting; weights, overrides, approval, recurrence rules deferred to L6 |
| C6 | Ambiguous "equal weighting" with subtasks | Leaf counting: parent replaced by its subtasks |
| C7 | Future assignees vs no purposeless fields | No assignee tables; UUIDs and migrations make later addition routine |
| C8 | "Recent activity" vs history in L5 | MVP shows "recently updated" from timestamps |
| C9 | "Safe updates" vs no update checks | Manual installer upgrades; migrations tested from fixtures; no auto-updater |
| C10 | Markdown notes MVP vs Later | MVP stretch (R26) |
| C11 | Archive as status vs flag | `status` and `archived_at` stored separately |
| C12 | Tasks without project | Built-in Inbox project (R28) |
| C13 | Duplicate profile names | Unique, case-insensitive, among non-trashed profiles |
| C14 | Subtask depth | One level in MVP |
| C15 | Dashboard customisation timing | Fixed default layout in MVP; L1.4 |
| C16 | Clean-install testing on Windows 11 Home (no Sandbox) | Second local Windows account or free VM |
| C17 | Repository inside Apache `htdocs` | `.htaccess` deny-all in first foundation commit; no real data in repository; move repository later |

## 7. Traceability to source sections

| Source § | Covered by |
|---|---|
| §3 Platform/architecture | R01, R02, [ARCHITECTURE.md](ARCHITECTURE.md), ADRs |
| §4 Profiles and security | R03, R15, L2.1–L2.6, L6.6 |
| §5 Dashboard/navigation | R16, R17, L1.4 |
| §6 Projects | R04–R07, R27, R28, L1.2, L4.1, L4.2, L4.4, L5.3, L5.4, L5.5 |
| §7 Tasks | R08–R12, R14, L3.1, L5.3, L5.4, L5.5, L6.10, F3 |
| §8 Progress | R13, L6.9–L6.11 |
| §9 Recurring tasks | L3.1–L3.3 |
| §10 Views and search | R10, R18, L1.1, L3.4, L4.5, F3 |
| §11 Calendar/notifications | L3.4–L3.6, F6 |
| §12 Notes | R26, L1.5, L6.12 |
| §13 Attachments | L5.4 |
| §14 Comments/developer | R27, L4.3, L5.3, F5, F11 |
| §15 Time tracking | L5.5 |
| §16 Appearance/shortcuts | R22, R23, L6.8, L6.13 |
| §17 Backup/version history | R19, R20, L2.6, L5.1, L6.14 |
| §18 Import/export | R19, R21, L6.1–L6.5 |
| §19 Trash | R14, R15 |
| §20 Operation history | L6.7 |
| §21 Offline/sync | Product constraints, F1 |
| §22 Team/permissions | F2, F3 |
| §23 Integrations | F5–F10 |
| §24 Testing | [TESTING.md](TESTING.md) |
