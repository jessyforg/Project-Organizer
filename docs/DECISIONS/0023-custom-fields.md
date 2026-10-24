# ADR-0023: Custom fields (0.9.0 stage 4, schema v10)

- Status: Approved (part of the single remaining-features release requested on 2026-10-24; stage 4 on `feature/milestones-0.9`, not merged)
- Date: 2026-10-24

## Context

Feature #14 lets each project define its own task fields, such as "Estimate" (a number), "Area" (a single select), or "Reviewed" (a checkbox). The values appear in the task panel and the table, and changes are logged. Templates (stage 5) will carry the fields.

## Decisions

### Storage (schema v10)

- **`custom_fields` columns:**
  - `id` and `project_id`, cascading on permanent delete;
  - `name`, with `name_key` unique per project among live fields;
  - `type`, one of text, number, date, checkbox, select, or multi_select;
  - `options_json`, for selects: a list of `{ id, label }`, at most 50 options of up to 60 characters;
  - `sort_key`, `created_at`, and `updated_at`;
  - `deleted_at` and `deletion_batch_id`, following the usual trash rules.
- **`custom_values` columns:** `(task_id, field_id)` as the key, both cascading, and `value_json`.
  - **No row means no value.** A cleared text, an unticked checkbox, and an empty multi-select remove the row.
  - **Database guard:** a trigger refuses a value whose field belongs to another project than the task's.
- **Limits:** at most 30 live fields per project.
- **Backups and export:** both tables are added to the manifest's counted tables and the JSON export.
- **Fixture:** a committed `profile-v9.db` (with an activity event), plus an upgrade test.

### Values

| Type | Stored value | Editor |
|---|---|---|
| Text | string, up to 1,000 characters | text box |
| Number | a finite number | number box |
| Date | `YYYY-MM-DD` | date box |
| Checkbox | `true` (unticked is no value) | checkbox |
| Select | one option ID | choice list |
| Multi select | a list of option IDs | checkboxes (panel); read-only text in the table |

- **Validation:** values are checked by the service against the field's type and options, and `tasks` gains `customValues: { [fieldId]: value }` for live fields only.
- **Moving a task to another project** removes its values, because the fields belong to the old project. The move notice says how many were removed.
- **Removing an option** removes it from every task: a select becomes empty, and a multi select keeps its other options.

### Changing a field's type (criterion 3)

- **Each value is converted through its text form:**
  - a select shows its option's label, and a multi select its labels joined by commas;
  - a checkbox shows "Yes";
  - a number shows its digits, and a date its `YYYY-MM-DD`.
- **The text is then read as the new type:**
  - **number:** a plain decimal;
  - **date:** a real `YYYY-MM-DD` date;
  - **checkbox:** yes, true, or 1;
  - **select:** each distinct text becomes an option;
  - **multi select:** comma-separated labels become options;
  - **text:** always works.
- **All or nothing:** if any value does not convert, nothing changes. The message names up to five tasks and their values, for example: `3 values cannot become a number: “about 2” (Write copy), …`. A multi select with more than one choice cannot become a select.
- **The conversion runs in one transaction,** with the field's new options.

### Deleting a field (criterion 4)

- **Move to trash** asks first, saying how many tasks have a value.
- **Undo appears inside the fields dialog, not in a toast.** The dialog is modal, so nothing else in the window, including toasts, can be used while it is open.
- **Trash and restore:** the field goes to the trash as its own batch and its values are kept, so restoring brings everything back. Trashing a project includes its fields.
- **Permanent deletion** removes the values through the foreign key.
- **Trash entry:** it is shown as "Field" with its project.

### Where fields appear (criterion 2)

- **Task panel:** a "Fields" section with one editor per field, saving on change like the other fields. "Manage fields" opens the fields dialog.
- **Project page:** "Custom fields…" in the ⋯ menu (and the palette) opens the fields dialog. There, fields can be added, renamed, given options, changed in type, reordered, and moved to the trash.
- **Table (project pages only):**
  - **Columns:** each field is a column, `field:<id>`, sortable and resizable. Fields differ between projects, so My tasks shows none.
  - **Saved layout:** layouts keep entries for other projects' fields, so switching projects does not forget them.
  - **Grouping:** by any select or checkbox field.
  - **Filter:** a "Field filter" chooses a field and a value. Text matches if it contains the value; selects and checkboxes match exactly; numbers and dates match equal values.
  - **Editing:** text, number, date, checkbox, and select fields are edited in the cell. Multi select is edited in the panel.
- **Activity:** value changes are recorded on the task as `changed` with the field `custom:<field name>` and the old and new values as text, for example "Estimate changed from 3 to 5".

### Channels, all checked with zod

- `customFields:list` takes `{ projectId }`, and `customFields:create`, `customFields:update`, `customFields:changeType`, and `customFields:reorder` change fields.
- `customFields:setValue` takes `{ taskId, fieldId, value }`.
- `trash:trashCustomField` moves a field to the trash.

## Consequences

- `Task` gains `customValues`, read with one JSON subquery per row.
- `ActivityField` gains `custom:<name>`. The `field` column is plain text, so the schema needs no change for it.
- **Upgrade:** profiles move to schema v10 after a verified snapshot.
- **No dependency or Content Security Policy change.**
