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

**settings** — `key` PK, `value_json`, `updated_at`. Theme, default sort, and similar preferences.

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

**tags** — `id` PK, `name`, `name_key` UNIQUE, `color` NULL (token), `created_at`, `updated_at`. Deleting a tag is immediate and removes it from every task and project.

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

`ON DELETE CASCADE` only fires on **permanent** deletion (trash purge or "delete permanently"). Moving to trash is an `UPDATE` of `deleted_at`.

### Database guards

Triggers reject, even if application code is bypassed: a task whose status belongs to another project; a subtask whose parent is in another project or is itself a subtask; giving a parent task its own parent; dependencies across projects. `CHECK` constraints enforce date format (`YYYY-MM-DD`), start ≤ due/target, enumerated values, and that `deleted_at` and `deletion_batch_id` are set together.

### Moving tasks between projects

Only top-level tasks move; their subtasks (including trashed ones) move with them. Each status is mapped to the target project's first status of the same category, or to its default status if that category is missing. Dependencies that would cross projects are removed and their count is reported.

### Indexes and search

- `tasks(project_id, deleted_at)`, `tasks(parent_task_id)`, `tasks(status_id)`, `tasks(due_date) WHERE deleted_at IS NULL`, `tasks(updated_at)`, `tasks(deletion_batch_id)`.
- `projects(deleted_at, archived_at)`, `projects(folder_id)`, `projects(deletion_batch_id)`.
- `task_dependencies(depends_on_task_id)`, `task_tags(tag_id)`, `project_tags(tag_id)`.
- Full-text search: FTS5 tables `tasks_fts` (title, description) and `projects_fts` (name, description) with the `unicode61 remove_diacritics 2` tokenizer, so "cafe" finds "Café". Each keeps its own copy keyed by ID rather than rowid, so it stays correct even if SQLite renumbers rowids; triggers keep it in sync. User input is converted to quoted prefix terms, so search text is never interpreted as query syntax.
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
| Move project to trash | Project and all its tasks get one batch. Inbox cannot be trashed. |
| Restore batch | Clears `deleted_at` for the batch. Refused with a message if the task's project or parent task is still in the trash (restore that first). Tasks trashed in an earlier, separate action stay in the trash when their project is restored. |
| Permanent delete / purge | Hard `DELETE`; cascades remove tag links, dependencies, statuses, and subtasks. |
| Automatic purge | When a profile opens and every 24 hours while it stays open, batches trashed more than 30 days ago are purged. The clock is injected for tests. |
| Delete folder | Projects in it move to "no folder"; no project is deleted. |
| Trash profile | Registry row gets `trashed_at`; files untouched until purge after 30 days. |

Independent backups and exports may still contain copies after permanent deletion; the UI says so on permanent delete.

## 7. Settings structure

Key/value with JSON values, validated by a Zod schema per key on read and write. Unknown keys are ignored on read and never written. Defaults live in code, so missing keys fall back to defaults.
