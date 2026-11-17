# ADR-0020: Milestones (0.9.0, schema v8)

- Status: Approved (the product owner said "continue 0.9.0" on 2026-10-24, after approving the plan in `docs/plans/2026-10-21-next-features-plan.md`; built on a feature branch, not merged)
- Date: 2026-10-24

## Context

Release 0.9.0 holds feature #6, milestones (requirements L1.2 and L1.3). A milestone is a checkpoint inside a project, such as "Beta" or "Launch", with its own target date, and tasks can belong to it. The plan lists the acceptance criteria, and this ADR records how they are met. ADR-0019 also promised that milestones could be starred from 0.9.0.

## Decisions

### Data (schema v8, one forward-only migration)

- **`milestones` columns:**
  - `id`;
  - `project_id`, cascading on permanent delete;
  - `name`, which must not be blank;
  - `description`;
  - `target_date`, a checked `YYYY-MM-DD` date or null;
  - `completed_at`;
  - `created_at` and `updated_at`;
  - `deleted_at` and `deletion_batch_id`, which follow the same trash rules as tasks and notes.
- **`tasks.milestone_id`** is nullable, references `milestones`, and becomes null when the milestone is deleted for good (`ON DELETE SET NULL`).
- **Database guards (triggers):**
  - a task's milestone must belong to the task's project;
  - only top-level tasks have a milestone, because subtasks count through their parent;
  - these hold even if application code is bypassed, like the existing guards.
- **`favourites` is rebuilt** with a third item column, `milestone_id`, because SQLite cannot change a `CHECK` in place.
  - Rows are copied over, and the "exactly one item" check now covers three columns.
  - The migration runs after the usual verified snapshot.
- **Backups and export:** `milestones` is added to the backup manifest's counted tables and to the JSON export.
- **Fixture:** a committed `profile-v7.db` (with a favourite, an icon, and a cover), plus an upgrade test.

### Rules

- **Progress (criterion 2):**
  - The project's progress rules (R13, `computeProgress`) are applied to the milestone's live top-level tasks and their live subtasks.
  - A milestone with nothing countable has no ratio. Like a project, it shows "No tasks to count yet" with an empty meter and no percentage, never 0%.
- **The task filter:** a milestone that went to the trash while the list was filtered to it stops filtering, so the list never stays empty because of a milestone that is no longer shown.
- **Completing (criterion 4):**
  - Completing sets `completed_at`, and reopening clears it.
  - Neither changes the milestone's tasks.
- **Overdue:** a milestone is overdue when its target date is before today and it is not complete.
- **Trash (criterion 5):**
  - **Trashing a milestone** keeps its tasks, which stay in the project. Their `milestone_id` is kept but not shown while the milestone is in the trash, so restoring the milestone brings the links back.
  - **Trashing a project** puts its milestones in the same batch.
  - **Restoring** a milestone whose project is still in the trash is refused, with "Restore the project first".
  - **Permanent deletion** clears the links through the foreign key.
- **Moving tasks:**
  - Moving a task to another project clears its milestone, in the same update.
  - A milestone that is in the trash cannot be assigned, and neither can one from another project.
- **Archived projects** are read-only for milestones, as they are for tasks.

### Where milestones appear (criterion 3)

- **Project page:**
  - **A Milestones section:** each milestone has a name, target date, progress meter, overdue or done label, and a ⋯ menu with Edit, Complete or Reopen, star, and Move to trash.
  - **A "New milestone" dialog.**
  - **A Milestone filter** in the task filters: any, a milestone, or "No milestone".
- **Task details:** a Milestone field for top-level tasks.
- **Calendar:** milestones in the visible range, on their target dates, marked with a flag and labelled as milestones.
- **Dashboard:** a "Milestones" section with overdue milestones first, then those due within the next 7 days. Completed milestones and archived projects are left out.
- **Kanban cards:** the milestone name.
- **Favourites:**
  - Milestones can be starred from their ⋯ menu.
  - Opening a starred milestone shows its project, filtered to that milestone.
- **The task table (0.12.0)** will add a Milestone column.

### Channels, all checked with zod

- `milestones:list` takes `{ projectId }`, and `milestones:inRange` takes `{ from, to }` (calendar).
- `milestones:create`, `milestones:update`, and `milestones:setCompleted`.
- `trash:trashMilestone`.
- `tasks:create` and `tasks:update` accept `milestoneId`, and `tasks:list` filters by `milestoneId` (an ID, or null for "no milestone").

## Consequences

- **Upgrade:** profiles move from schema v7 to v8 after a verified snapshot.
- **Task data:** `Task` gains `milestoneId`, and test helpers gain the field.
- **No dependency or Content Security Policy change.**
