# ADR-0024: Project templates (0.9.0 stage 5, schema v11)

- Status: Approved (part of the single remaining-features release requested on 2026-10-24; stage 5 on `feature/milestones-0.9`, not merged)
- Date: 2026-10-24

## Context

Feature #7 (requirements L4.1 and L4.2) starts a project from a template: three built-in ones, plus templates saved from your own projects, which can be renamed, deleted, exported, and imported. Templates carry what earlier stages added, namely milestones and custom fields.

## Decisions

### What a template holds

- **Content:** a versioned JSON document (`version: 1`), checked by one zod schema (`templateContentSchema`) wherever it enters:
  - when a template is saved from a project;
  - when one is imported;
  - when one is read back from the database.
- **It holds:**
  - the project's kind, colour, and description;
  - its statuses, in order, with their categories and default;
  - tags, by name and colour;
  - milestones, with a target date as a number of days from the start, or none;
  - custom fields, with their choice labels;
  - tasks with their subtasks, including priority, tags by name, milestone, status by position, dates as day offsets, and field values by choice label;
  - notes (title and Markdown).
- **It leaves out:** completion state (every task starts in the default status), IDs, activity, attachments, icons, covers, and favourites.
- **Links in notes:** note bodies are copied as written. Links to files or to items of the original project keep pointing there, and they show as broken in an exported template opened elsewhere.
- **Limits** (checked by the schema):
  - 1,000 tasks including subtasks;
  - 100 notes of up to 200,000 characters each;
  - 50 milestones, 30 fields, 50 tags, and 30 statuses;
  - about 4 MB in total.

### Storage (schema v11)

- **The `templates` table:** `id`, `name` (with `name_key` unique), `description`, `content_json`, `created_at`, and `updated_at`.
- **Built-in templates** live in the code (`src/main/templates/builtin.ts`), not the database.
  - They are listed first, with IDs like `builtin:software`.
  - They cannot be renamed or deleted, but they can be exported.
- **Backups and export:** the `templates` table is added to the manifest's counted tables and the JSON export.
- **Fixture:** a committed `profile-v10.db` (with a custom field and a value), plus an upgrade test.

### Built-in templates (criterion 1)

- **Software development:** a workflow of Backlog, In progress, In review, Done, and Won't do.
  - Milestones: Design (day 14), Beta (day 42), and Launch (day 70).
  - Fields: Estimate (a number) and Area (Front end, Back end, Infrastructure).
  - Tags: Bug, Feature, and Chore.
  - About a dozen tasks with subtasks, and a "Project brief" note.
- **Personal productivity:** To do, Doing, Done; tags Home, Errands, and Health; a weekly review milestone (day 7); a few routine tasks; and a "How I use this project" note.
- **Study and learning:** To study, Studying, Reviewing, Learned; Midterm (day 30) and Final exam (day 90) milestones; a Confidence choice field (Low, Medium, High); topic tasks with exercise subtasks; and a "Study plan" note.

### Saving your own (criterion 2)

- **Where:** "Save as template…" in a project's ⋯ menu (and the palette) asks for a name, an optional description, and **Keep dates**.
- **Dates:** with Keep dates, dates become day offsets from the project's start date. Without a start date, the earliest date in the project is used. Without Keep dates, no dates are kept.
- **What is copied:** live, unarchived items only.

### Creating a project from a template (criterion 3)

- **Where:** "New from template" on the Projects page opens a picker. Choosing a template shows a **preview**: its statuses, milestones (with their days), fields, tags, the first 30 tasks with their subtasks, and the notes.
- **The form:** a name and, when the template has dates, a **start date** (today by default). Offsets are counted from it.
- **All or nothing:** creation is one transaction. A failure, for example a name that is already taken, leaves nothing behind.
- **Through the services:** it uses the project, status, task, milestone, field, and note services, so the usual checks and the activity log apply.
- **Tags:** template tags are matched by name to existing tags, or created.
- **The template itself is only read, never changed.**

### Managing templates (criterion 4)

- **Where:** a "Templates…" dialog on the Projects page lists them all.
- **Actions:** saved templates can be renamed and deleted, the latter after a confirmation. Every template can be exported.
- **Export:** writes a `.pftemplate.json` file through the save dialog, with an atomic write, as `{ format: "projectforge-template", version: 1, name, description, content }`.
- **Import:**
  - It reads the chosen file in the window, refusing files over 4 MB, and sends the text.
  - The main process parses it and checks it with zod, then stores it, adding " (2)" and so on to a name that is taken.
  - An invalid file is refused with a plain message, such as "This is not a ProjectForge template" or "The template has too many tasks".

### Channels, all checked with zod

- `templates:list`, `templates:get`, `templates:saveFromProject`, `templates:rename`, `templates:delete`, `templates:export`, `templates:import` (`{ text }`, at most 4 MB), and `templates:createProject`.

## Consequences

- **Upgrade:** profiles move to schema v11 after a verified snapshot.
- **Import:** imported files are untrusted. They are only ever parsed as JSON and checked against the schema, which makes their size, counts, and every string length bounded.
- **No dependency or Content Security Policy change.**
