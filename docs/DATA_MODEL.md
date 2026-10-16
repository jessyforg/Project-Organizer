# Data Model

Status: **`app.db` and the profile `settings` table implemented in Phase 2; domain tables planned** (2026-10-17). Exact SQL is written in Phase 2/3 migrations; this document is updated to match.

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
| name | TEXT NOT NULL | Unique (NOCASE) among live folders |
| sort_key | INTEGER NOT NULL | |
| created_at, updated_at | TEXT NOT NULL | |
| deleted_at | TEXT | |

**projects**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| folder_id | TEXT NULL → folders(id) ON DELETE SET NULL | |
| name | TEXT NOT NULL CHECK(length(trim(name)) > 0) | |
| description | TEXT NULL | |
| kind | TEXT NOT NULL CHECK IN ('general','software') DEFAULT 'general' | |
| status | TEXT NOT NULL CHECK IN ('active','completed') DEFAULT 'active' | |
| is_inbox | INTEGER NOT NULL DEFAULT 0 | Exactly one live inbox (partial unique index) |
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
| name | TEXT NOT NULL | Unique (NOCASE) per project |
| category | TEXT NOT NULL CHECK IN ('todo','in_progress','done','cancelled') | Business rules use the category, never the name |
| sort_key | INTEGER NOT NULL | |
| is_default | INTEGER NOT NULL | Exactly one default per project; used for new tasks |

Default workflow seeded per project: To do (todo, default), In progress (in_progress), Done (done), Cancelled (cancelled).

**tasks**
| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | |
| project_id | TEXT NOT NULL → projects(id) ON DELETE CASCADE | |
| parent_task_id | TEXT NULL → tasks(id) ON DELETE CASCADE | Parent must be in same project and must itself have no parent (MVP) |
| status_id | TEXT NOT NULL → project_statuses(id) ON DELETE RESTRICT | Status must belong to the same project |
| title | TEXT NOT NULL CHECK(length(trim(title)) > 0) | |
| description | TEXT NULL | |
| priority | TEXT NULL CHECK IN ('urgent','high','medium','low') | NULL = no priority |
| start_date, due_date | TEXT NULL | Date-only; `start_date <= due_date` when both set |
| sort_key | INTEGER NOT NULL | Manual order within parent |
| completed_at | TEXT NULL | Set when moved into a `done`-category status, cleared when moved out |
| created_at, updated_at | TEXT NOT NULL | |
| deleted_at, deletion_batch_id | TEXT NULL | |

**tags** — `id` PK, `name` NOT NULL UNIQUE COLLATE NOCASE, `color` NULL, `created_at`.

**task_tags** — (`task_id` → tasks ON DELETE CASCADE, `tag_id` → tags ON DELETE CASCADE), PK (task_id, tag_id).

**project_tags** — (`project_id` → projects ON DELETE CASCADE, `tag_id` → tags ON DELETE CASCADE), PK (project_id, tag_id).

**task_dependencies**
| Column | Notes |
|---|---|
| task_id → tasks ON DELETE CASCADE | The dependent task |
| depends_on_task_id → tasks ON DELETE CASCADE | The prerequisite |
| created_at | |
| PK (task_id, depends_on_task_id), CHECK (task_id <> depends_on_task_id) | Same-project and acyclicity enforced in the service layer inside the write transaction |

`ON DELETE CASCADE` only fires on **permanent** deletion (trash purge or "delete permanently"). Moving to trash is an `UPDATE` of `deleted_at`.

### Planned indexes

- `tasks(project_id, deleted_at, status_id)`, `tasks(parent_task_id)`, `tasks(due_date) WHERE deleted_at IS NULL`, `tasks(updated_at)`.
- `projects(deleted_at, archived_at)`, `projects(folder_id)`.
- `task_dependencies(depends_on_task_id)`.
- Full-text search: an FTS5 table over project names/descriptions and task titles/descriptions, kept in sync by triggers. FTS5 availability in the chosen driver build is verified in Phase 2; fallback is indexed `LIKE` queries.

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
10. Restoring never recreates permanently deleted records. Dependencies pointing at a permanently deleted or still-trashed task are reported as unresolved, not silently re-created.
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
| Restore batch | Clears `deleted_at` for the batch. If the parent project is still trashed, the task restore is refused with a message. |
| Permanent delete / purge | Hard `DELETE`; cascades remove tags links, dependencies, statuses. |
| Automatic purge | On startup and every 24 hours while running, rows with `deleted_at` older than 30 days are purged. The clock is injected for tests. |
| Delete folder | Projects in it move to "no folder"; no project is deleted. |
| Trash profile | Registry row gets `trashed_at`; files untouched until purge after 30 days. |

Independent backups and exports may still contain copies after permanent deletion; the UI says so on permanent delete.

## 7. Settings structure

Key/value with JSON values, validated by a Zod schema per key on read and write. Unknown keys are ignored on read and never written. Defaults live in code, so missing keys fall back to defaults.
