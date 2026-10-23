# Data Model

Status: **Implemented through Phase 3** (2026-10-17): `app.db`, and profile schema v2 (folders, projects, statuses, tasks, tags, dependencies, search). Every invariant below that applies so far has automated tests. Exact SQL is written in Phase 2/3 migrations; this document is updated to match.

## 1. Conventions

| Concern | Rule |
|---|---|
| IDs | UUID v4 text from `crypto.randomUUID()`. IDs never change, including on rename. |
| Timestamps | UTC ISO-8601 text with milliseconds, e.g. `2026-10-17T03:15:00.000Z`. Columns end in `_at`. |
| Calendar dates | Date-only `YYYY-MM-DD` text, interpreted in the user's local calendar. Columns end in `_date`. Never converted through UTC. |
| Booleans | `INTEGER` 0/1 with `CHECK`. |
| Enumerations | `TEXT` with `CHECK (col IN (...))`. |
| Soft delete | `deleted_at` (null = live) and `deletion_batch_id` (shared by all rows deleted in one user action). |
| Ordering | `sort_key INTEGER` with gaps of 1024; renumbered inside a transaction when a gap is exhausted. |
| Text comparison | SQLite `NOCASE` folds only ASCII letters, so case-insensitive uniqueness uses a stored key column (`name_key` = trimmed, NFC-normalised, lower-cased) with a unique index. Applies to profiles now and to tags/folders/statuses in Phase 3. |
| Table mode | All tables are `STRICT`, so SQLite rejects values of the wrong type. |
| Foreign keys | Always declared; `ON DELETE` rules listed per table. Enforcement verified on every open. |

## 2. `app.db` (application registry)

| Table | Columns | Notes |
|---|---|---|
| `schema_migrations` | `version` PK, `name`, `checksum`, `applied_at` | |
| `profiles` | `id` PK, `display_name`, `name_key`, `created_at`, `updated_at`, `last_opened_at`, `trashed_at` | Partial unique index on `name_key` where `trashed_at IS NULL`. The last-used profile is the one with the latest `last_opened_at`. |
| `app_settings` | `key` PK, `value_json`, `updated_at` | Reserved for app-level preferences (e.g. window bounds); unused in Phase 2 |

## 3. `profile.db` (one per profile)

### Tables

**schema_migrations** — as above.

**settings** — `key` PK, `value_json`, `updated_at`. Theme, primary colour (`accent`) and background tone (`surface`) ([ADR-0015](DECISIONS/0015-notes-views-archive-colours-menus.md)), and similar preferences. Unknown or invalid stored values fall back to defaults. The quick switcher keeps the 10 most recently opened items under `recentItems`, as a JSON list of `{ kind, id }` ([ADR-0018](DECISIONS/0018-command-palette-and-switcher.md)); a damaged list counts as empty.

**folders**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| name | TEXT NOT NULL | |
| name_key | TEXT NOT NULL UNIQUE | Case-insensitive uniqueness |
| sort_key | INTEGER NOT NULL | |
| created_at, updated_at | TEXT NOT NULL | |

Folders are not trashed: deleting one is immediate and only moves its projects to "no folder".

**projects**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| folder_id | TEXT NULL → folders(id) ON DELETE SET NULL | |
| name | TEXT NOT NULL CHECK(length(trim(name)) > 0) | |
| description | TEXT NULL | |
| kind | TEXT NOT NULL CHECK IN ('general','software') DEFAULT 'general' | |
| status | TEXT NOT NULL CHECK IN ('active','completed') DEFAULT 'active' | |
| is_inbox | INTEGER NOT NULL DEFAULT 0 | Exactly one Inbox (partial unique index). A CHECK keeps it active, unarchived, and out of the trash. Created on profile open. |
| color | TEXT NULL | Token name, not raw CSS |
| start_date, target_date | TEXT NULL | Date-only |
| archived_at | TEXT NULL | Separate from status so unarchive restores exactly |
| created_at, updated_at | TEXT NOT NULL | |
| deleted_at, deletion_batch_id | TEXT NULL | |

**project_statuses**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT NOT NULL → projects(id) ON DELETE CASCADE | |
| name, name_key | TEXT NOT NULL | Unique per project (case-insensitive key) |
| category | TEXT NOT NULL CHECK IN ('todo','in_progress','done','cancelled') | Business rules use the category, never the name |
| sort_key | INTEGER NOT NULL | |
| is_default | INTEGER NOT NULL | Exactly one default per project; used for new tasks; must be `todo` or `in_progress` |
| created_at, updated_at | TEXT NOT NULL | |

Default workflow seeded per project: To do (todo, default), In progress (in_progress), Done (done), Cancelled (cancelled).

Status rules: the default status cannot be removed (choose another default first); the last `done` status cannot be removed (otherwise no task could ever complete); removing a status reassigns all its tasks, including trashed ones, to a chosen replacement in the same project, adjusting `completed_at` to the replacement's category.

**tasks**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT NOT NULL → projects(id) ON DELETE CASCADE | |
| parent_task_id | TEXT NULL → tasks(id) ON DELETE CASCADE | Parent must be in same project and must itself have no parent (MVP) |
| status_id | TEXT NOT NULL → project_statuses(id) (NO ACTION) | Status must belong to the same project. NO ACTION rather than RESTRICT so a project's permanent deletion can cascade statuses and tasks in one statement. |
| title | TEXT NOT NULL CHECK(length(trim(title)) > 0) | |
| description | TEXT NULL | |
| priority | TEXT NULL CHECK IN ('urgent','high','medium','low') | NULL = no priority |
| start_date, due_date | TEXT NULL | Date-only; `start_date <= due_date` when both set |
| sort_key | INTEGER NOT NULL | Manual order within parent |
| completed_at | TEXT NULL | Set when moved into a `done`-category status, cleared when moved out |
| created_at, updated_at | TEXT NOT NULL | |
| deleted_at, deletion_batch_id | TEXT NULL | |

**tags** — `id` PK, `name`, `name_key` UNIQUE, `color` NULL (token), `created_at`, `updated_at`. Deleting a tag is immediate and removes it from every task, project, and note.

**task_tags** — (`task_id` → tasks ON DELETE CASCADE, `tag_id` → tags ON DELETE CASCADE), PK (task_id, tag_id).

**project_tags** — (`project_id` → projects ON DELETE CASCADE, `tag_id` → tags ON DELETE CASCADE), PK (project_id, tag_id).

**task_dependencies**
| Column | Notes |
|---|---|
| task_id → tasks ON DELETE CASCADE | The dependent task |
| depends_on_task_id → tasks ON DELETE CASCADE | The prerequisite |
| created_at | |
| PK (task_id, depends_on_task_id), CHECK (task_id <> depends_on_task_id) | Same project enforced by a trigger; acyclicity by a recursive query in the service, inside the write transaction (SQLite triggers cannot run recursive queries) |

Done and cancelled prerequisites count as satisfied. Unfinished prerequisites produce a warning, never a block.

**notes** (schema v3)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT NOT NULL → projects(id) ON DELETE CASCADE | Every note belongs to a project; notes created without one go to the Inbox |
| folder_id | TEXT NULL → note_folders(id) ON DELETE SET NULL | Schema v4 ([ADR-0014](DECISIONS/0014-note-actions-import-and-folders.md)). The note's folder on the Notes screen, independent of its project; null means no folder |
| title | TEXT NOT NULL CHECK(length(trim(title)) > 0) | A blank title is saved as "Untitled note" |
| body | TEXT NOT NULL DEFAULT '' | Markdown source as typed, up to 1,000,000 characters (Zod limit); never stored or rendered as HTML |
| archived_at | TEXT NULL | Schema v5 ([ADR-0015](DECISIONS/0015-notes-views-archive-colours-menus.md)). Archived notes leave lists and folder counts and are read-only until unarchived; search still finds them |
| created_at, updated_at | TEXT NOT NULL | `updated_at` changes only when the title, body, project, folder, tags, or archived state change |
| deleted_at, deletion_batch_id | TEXT NULL | Same trash model as tasks |

Notes cannot be created in, or moved into, an archived project; notes already in one stay readable and editable.

**note_tags** — (`note_id` → notes ON DELETE CASCADE, `tag_id` → tags ON DELETE CASCADE), PK (note_id, tag_id).

**note_folders** (schema v4, [ADR-0014](DECISIONS/0014-note-actions-import-and-folders.md))
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| name | TEXT NOT NULL CHECK(length(trim(name)) > 0) | |
| name_key | TEXT NOT NULL UNIQUE | Case-insensitive uniqueness |
| created_at, updated_at | TEXT NOT NULL | |

Note folders are flat and listed by name. Like project folders, they are not trashed: deleting one is immediate and only moves its notes, including notes in the trash, to "no folder".

**note_links** (schema v6, [ADR-0017](DECISIONS/0017-notes-release-0.6.md))
| Column | Type | Notes |
|---|---|---|
| source_note_id | TEXT NOT NULL → notes(id) ON DELETE CASCADE | The note containing the link |
| target_kind | TEXT NOT NULL CHECK IN ('note', 'task', 'project') | |
| target_id | TEXT NOT NULL | No foreign key: a link may point to something missing or trashed (shown as broken) |

PK (source_note_id, target_kind, target_id).
- **A derived index.** A note's Markdown is the source of truth. The links in it are `[Label](projectforge://kind/id)`, outside code.
- **Kept current:** the index is rebuilt for a note in the same transaction as every create, update, import, and duplicate.
- **Built on opening:** when a profile opens, the index is built if it is empty while notes contain app links, for example after an upgrade from v5 or for imported Markdown.
- **Trash:** links from trashed notes stay in the index, but backlinks leave those notes out.

**attachments** (schema v6, [ADR-0017](DECISIONS/0017-notes-release-0.6.md) stage 6)
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | Referred to as `projectforge://file/<id>` in note Markdown |
| note_id | TEXT NULL → notes(id) ON DELETE SET NULL | The note it was added to; a file can outlive it |
| name | TEXT NOT NULL CHECK(length(trim(name)) > 0) | The file name alone, without folders |
| kind | TEXT NOT NULL CHECK IN ('image', 'file') | Decided from the bytes: PNG, JPEG, GIF, and WebP are images |
| mime | TEXT NOT NULL | The image type, or `application/octet-stream` |
| size | INTEGER NOT NULL CHECK(size >= 0) | At most 20 MB; 1 GB per profile in total |
| sha256 | TEXT NOT NULL | |
| data | BLOB NOT NULL | The bytes; in the JSON export as Base64 |
| created_at | TEXT NOT NULL | |
| unused_since | TEXT NULL | Set when no note body (trashed ones included) refers to the file; removed after the trash retention period; cleared when referred to again |

Since schema v7, a file can also be a cover image (`note_id` is null for a project's cover). Clean-up counts a file named by any project's or note's `cover` as in use.

**favourites** (schema v7, [ADR-0019](DECISIONS/0019-favourites-icons-covers.md))
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT NULL → projects(id) ON DELETE CASCADE | Unique when set |
| note_id | TEXT NULL → notes(id) ON DELETE CASCADE | Unique when set |
| sort_key | INTEGER NOT NULL | Order in the sidebar |
| created_at | TEXT NOT NULL | |

`CHECK ((project_id IS NULL) <> (note_id IS NULL))`: each favourite names exactly one item.
- **Trash:** a favourite whose item, or whose note's project, is in the trash is not listed. Restoring the item brings it back.
- **Reordering:** the listed favourites swap their keys among themselves, so hidden ones keep their place.

**Icons and covers** (schema v7): `projects.icon`, `projects.cover`, `notes.icon`, and `notes.cover` are nullable TEXT.
- **Icons:** `emoji:<character>` or `lucide:<name>`, checked against the 60 values in `src/shared/icons.ts`.
- **Covers:** `preset:<name>` (16 presets in `src/shared/covers.ts`) or `image:<attachment id>`.
- Null means the usual look.

`ON DELETE CASCADE` only fires on **permanent** deletion (trash purge or "delete permanently"). Moving to trash is an `UPDATE` of `deleted_at`.

### Database guards

Triggers reject, even if application code is bypassed: a task whose status belongs to another project; a subtask whose parent is in another project or is itself a subtask; giving a parent task its own parent; dependencies across projects. `CHECK` constraints enforce date format (`YYYY-MM-DD`), start ≤ due/target, enumerated values, and that `deleted_at` and `deletion_batch_id` are set together.

### Moving tasks between projects

Kanban moves (`tasks:moveOnBoard`) change a top-level task's status and manual position in one transaction; no schema change was needed for the board or the calendar.

Only top-level tasks move between projects; their subtasks (including trashed ones) move with them. Each status is mapped to the target project's first status of the same category, or to its default status if that category is missing. Dependencies that would cross projects are removed and their count is reported.

### Indexes and search

- `tasks(project_id, deleted_at)`, `tasks(parent_task_id)`, `tasks(status_id)`, `tasks(due_date) WHERE deleted_at IS NULL`, `tasks(updated_at)`, `tasks(deletion_batch_id)`.
- `projects(deleted_at, archived_at)`, `projects(folder_id)`, `projects(deletion_batch_id)`.
- `task_dependencies(depends_on_task_id)`, `task_tags(tag_id)`, `project_tags(tag_id)`, `note_tags(tag_id)`.
- `notes(project_id, deleted_at)`, `notes(folder_id, deleted_at)`, `notes(archived_at)` (partial, archived only), `notes(updated_at)`, `notes(deletion_batch_id)`, `note_links(target_kind, target_id)` (backlinks), and the two partial unique indexes on `favourites`. Note lists read only the first 600 characters of each body (for the excerpt).
- Full-text search: FTS5 tables `tasks_fts` (title, description), `projects_fts` (name, description), and `notes_fts` (title, body) with the `unicode61 remove_diacritics 2` tokenizer, so "cafe" finds "Café". Each keeps its own copy keyed by ID rather than rowid, so it stays correct even if SQLite renumbers rowids; triggers keep it in sync. User input is converted to quoted prefix terms, so search text is never interpreted as query syntax.
- Measured in Phase 3 with 6,250 tasks: list, filter, and search queries 3–38 ms; progress for 20 projects 21 ms.

## 4. Invariants

These must always hold and each has an automated test.

1. Every task belongs to an existing project in the same profile database.
2. A task's status belongs to the task's project.
3. A subtask's parent is in the same project and has no parent of its own (MVP depth 1).
4. Parent/child relationships contain no cycles.
5. Dependencies link tasks in the same project and contain no cycles.
6. IDs never change; renaming changes only display fields.
7. Each live project has exactly one default status; each profile has exactly one live Inbox project.
8. `completed_at` is set if and only if the task's status category is `done`.
9. Trashing a task trashes its subtasks in the same deletion batch; restoring the batch restores them together.
10. Restoring never recreates permanently deleted records. Dependencies pointing at a still-trashed task are reported as unresolved on restore. Permanently deleting a task removes its dependency links (the user is warned about dependents before deleting).
11. Progress never counts a parent and its subtasks together.
12. A project's archived state is independent of its status; unarchiving restores the prior status and tasks unchanged.
13. Profile display names are unique (case-insensitive) among non-trashed profiles.
14. Imports and restores are all-or-nothing.
15. Backups and exports accurately state which content is included.
16. Every note belongs to an existing project in the same profile database; trashing a project trashes its live notes in the same deletion batch.

## 5. Progress calculation

Applies to a project (and to a parent task for its own display).

1. Consider live (not trashed) tasks of the project.
2. A **leaf** is a task with no live subtasks. Parents are never counted; their subtasks are.
3. Exclude leaves whose status category is `cancelled`.
4. Progress = (leaves in a `done` category) ÷ (remaining leaves).
5. If the denominator is 0, progress is **undefined** and displayed as "—", not 0% or 100%.
6. A parent task's own status does not affect progress. When all its subtasks are done, the UI suggests completing the parent.
7. Displayed values are labelled "calculated". Manual overrides and weights are L6.9.

Archived projects keep their progress value; trashed tasks are excluded.

## 6. Deletion and retention model

| Action | Effect |
|---|---|
| Move task to trash | Task and its subtasks get `deleted_at` and one `deletion_batch_id`. Dependencies are kept. Warning lists tasks that depend on it. |
| Move note to trash | The note gets its own batch. |
| Move project to trash | Project and all its tasks and notes get one batch. Inbox cannot be trashed. |
| Restore batch | Clears `deleted_at` for the batch. Refused with a message if the task's or note's project, or the task's parent task, is still in the trash (restore that first). Tasks and notes trashed in an earlier, separate action stay in the trash when their project is restored. |
| Permanent delete / purge | Hard `DELETE`; cascades remove tag links, dependencies, statuses, subtasks, and a deleted project's notes. |
| Automatic purge | When a profile opens and every 24 hours while it stays open, batches trashed more than 30 days ago are purged. The clock is injected for tests. |
| Delete folder | Projects in it move to "no folder"; no project is deleted. |
| Trash profile | Registry row gets `trashed_at` (the profile is closed if open); files untouched. Restoring renames it if its name was taken meanwhile. Purged with its files 30 days later, at app start. |
| Automatic snapshots | `snapshots/` in each profile: `daily-*.db` (one per day, last 7 kept), `pre-migration-*.db` and `pre-restore-*.db` (last 5 of each). Each is a verified single-file copy. |

Independent backups and exports may still contain copies after permanent deletion; the UI says so on permanent delete.

## 7. Settings structure

Key/value with JSON values, validated by a Zod schema per key on read and write. Unknown keys are ignored on read and never written. Defaults live in code, so missing keys fall back to defaults.
