# ADR-0021: Activity log (0.9.0 stage 2, schema v9)

- Status: Approved (the product owner asked on 2026-10-24 for all remaining features in one release; this is stage 2, built on `feature/milestones-0.9`, not merged)
- Date: 2026-10-24

## Context

Feature #13 (requirement L5.2) records what changed, when, and on which item. Decision D4 placed it before version history (L5.1), which can later be built from the same events. Later stages (the task table, custom fields, and templates) log their changes from the start.

## Decisions

### Storage (schema v9)

- **The `activity_events` table:**
  - `id`, an integer row ID, so events are ordered within the same millisecond;
  - `at`;
  - `item_kind`, one of task, project, note, or milestone;
  - `item_id`;
  - `project_id`, the item's project, or the project itself;
  - `title`, the item's title at the time, so the feed still reads after a rename;
  - `action`, `field`, `old_value`, and `new_value`.
- **Indexes:** `(item_kind, item_id, at)` for an item's activity, `(project_id, at)` for a project's, and `(at)` for the profile-wide feed and retention.
- **No foreign keys:** events describe the past and outlive renames and moves.
  - **Permanent deletion** also deletes the item's events, and a project's purge deletes the events of everything in it. When someone deletes something for good, its title should not linger in history.
- **Backups and export:** `activity_events` is added to the manifest's counted tables and the JSON export.
- **Fixture:** a committed `profile-v8.db` (with a milestone), plus an upgrade test.

### What is recorded (criterion 1)

| Item | Actions |
|---|---|
| Task | created; renamed; status, priority, due date, or milestone changed; moved to another project; trashed; restored |
| Project | created; renamed; folder changed; completed or reopened; archived or unarchived; trashed; restored |
| Note | created (including duplicates and imports); renamed; edited; folder changed; moved to another project; archived or unarchived; trashed; restored; file added or removed |
| Milestone | created; renamed; target date changed; completed or reopened; trashed; restored |

- **Values are stored as people see them:** status, project, folder, and milestone names; priority keys; dates as `YYYY-MM-DD`. The renderer phrases them as sentences, such as "Changed the status from To do to Done".
- **Trash:** one event for the item the person trashed or restored. A project's tasks are covered by the project's event.
- **Files in notes:**
  - "Added" is recorded when a file is stored.
  - "Removed" is recorded when an edit removes the last reference to a file from that note's text. Clean-up removing an unused file is not a user action, so it records nothing.
- **Not recorded:** changes to descriptions, tags, icons, covers, stars, order, the board position within a column, and settings. They are frequent and of little history value.

### No gaps (criterion 3)

- Each event is written by `recordActivity` inside the same `db.transaction` as the change it describes. A service method that changes data and records an event is always wrapped in a transaction.
- **A change that throws records nothing, and a change that succeeds always records its event.** Service tests check both directions, including a failure forced after the event was written.
- **A call that changes nothing records nothing,** for example archiving a project that is already archived.

### Notes (criterion 4)

- Autosaves are not events. A rename, or an edit of the text, within 10 minutes of the note's previous event of the same kind updates that event's time and new value, instead of adding one.
- So "Renamed from A to B" keeps the title from before the run of edits, and "Edited" moves to the latest save.

### Where it shows (criterion 2)

- **Task details:** a tab list with **Details** and **Activity** (the WAI-ARIA tabs pattern, with arrow keys between the tabs).
- **Project page:** a tab list with **Work** (the existing content) and **Activity**, which shows the project's own events and those of its tasks, notes, and milestones.
- **Today:** "Recent activity" (the latest 10 events, profile-wide) replaces "Recently updated". Each entry opens its item; an item that is gone shows as plain text.
- **Order and paging:** newest first, 50 at a time, with "Show more".

### Retention (criterion 5)

- The new setting `activityRetentionDays` can be 90, 180, 365 (the default), 730, or 1,825 days.
- Older events are deleted when the profile opens, and daily.
- It is shown in Settings under "Activity history".

### Speed (criterion 6)

- A service test inserts 100,000 events across 1,000 items and checks that listing one item's activity takes under 50 ms (best of three, as for the switcher).

### Channels, all checked with zod

- `activity:forItem` takes `{ kind, id, limit }`.
- `activity:forProject` takes `{ projectId, limit }`.
- `activity:recent` takes `{ limit }`.
- The limit is at most 500.

## Consequences

- **Write paths:** every write path in the task, project, note, milestone, attachment, and trash services records activity. New write paths must do the same; the service tests list the expected events for each.
- **Upgrade:** profiles move to schema v9 after a verified snapshot.
- **No dependency or Content Security Policy change.**
