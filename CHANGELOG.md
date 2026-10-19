# Changelog

## 0.2.0 — Notes, Kanban board, and calendar (2026-10-20, not yet publicly released)

### Kanban board (L1.1)

- Each project's tasks can be shown as a board with one column per workflow status (switch between List and Board).
- Drag cards between columns and within a column, or use a card's Move button to choose a column and position from the keyboard.
- Moving a card to a Done status completes the task; the order is saved.

### Calendar (L3.4)

- A Calendar screen shows tasks on their due dates in month, week, and day views, starting the week as Windows does for your region.
- Overdue tasks are marked in red with an icon; a notice links to today's list of them.
- Select an entry to open the task; changing its due date moves it at once.
- Filter by project and choose whether to show done and cancelled tasks.

### Notes (L1.5)

- Markdown notes in every project (loose notes go to the Inbox), with tags, a Notes screen with search and filters, and a Notes section on each project page.
- Write and Preview modes. The preview supports headings, lists, task lists, tables, quotes, code, and links. Raw HTML is shown as text, images are never loaded, and only web and mail links open (in the system browser).
- Notes save themselves while you type (Ctrl+S saves at once). Leaving a note or closing the window saves first, and asks before discarding changes that could not be saved.
- Global search, the trash (including moving a project to the trash), encrypted backups, and JSON exports include notes.
- Profile data schema version 3; existing profiles upgrade automatically after a verified snapshot.

### Fixed

- A backup damaged in a particular place could fail with a technical database error instead of "wrong password or damaged file".

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
