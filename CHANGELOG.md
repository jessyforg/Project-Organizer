# Changelog

## 0.1.0 — MVP (2026-10-17, not yet publicly released)

First complete version of the free, local-first project organizer for Windows.

### Profiles

- Separate local profiles, each in its own database file; create, rename, switch.
- Profile trash with 30-day recovery.

### Projects and tasks

- Projects with description, type (general or software), colour, dates, folders, and tags.
- Per-project workflows: rename, add, reorder, and remove statuses (tasks are reassigned, never lost).
- Archive and unarchive; mark completed or active; suggestion when every task is done.
- Tasks with subtasks, priorities (Urgent, High, Medium, Low, or none), start and due dates, tags, and dependencies with cycle prevention.
- Progress calculated from tasks, counting subtasks instead of their parents and leaving cancelled tasks out.
- Inbox for tasks without a project; move tasks between projects.
- Trash for tasks and projects: restore whole hierarchies, delete permanently, automatic purge after 30 days.

### Working with tasks

- Today dashboard: overdue, due today, next 7 days, recently updated, recently completed, active projects with progress.
- Task lists grouped by status, with filters (status, priority, due, tag, project), sorting, and search.
- Global search across projects (including archived) and tasks; accent-insensitive.
- Task details panel; quick add from anywhere (Ctrl+N); keyboard shortcuts.
- Light, dark, and system themes.

### Data safety

- Password-encrypted backups (SQLCipher v4), verified after writing.
- Backup check, test restore, restore as a new profile, or replace the open profile (with a verified copy of the previous data and crash-safe swapping).
- Automatic daily copies (7 days) plus copies before updates and restores; recovery of a damaged profile from these copies.
- JSON export (unencrypted, with a warning).

### Security and privacy

- No network use, accounts, or telemetry.
- Hardened Electron configuration: isolated, sandboxed renderer; narrow validated bridge; strict Content Security Policy; locked-down fuses.
