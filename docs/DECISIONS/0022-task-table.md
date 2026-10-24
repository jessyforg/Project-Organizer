# ADR-0022: Tasks as a table (0.9.0 stage 3)

- Status: Approved (part of the single remaining-features release requested on 2026-10-24; stage 3 on `feature/milestones-0.9`, not merged)
- Date: 2026-10-24

## Context

Feature #15 shows tasks as a spreadsheet-like table, with sorting, grouping, inline editing, and a layout that is remembered. Custom fields (stage 4) will appear in it as extra columns. No schema change is needed: the layout is a profile setting.

## Decisions

### Where it appears (criterion 1)

- **Project page:** a third view, **Table**, beside List and Board. It uses the same filters as List.
- **My tasks:** a **List** and **Table** switch above the tasks.
- **Rows:** the table shows top-level tasks, as List does. Subtasks stay in a task's details.
- **Paging:** up to 5,000 tasks are loaded, with a note when there are more. Sorting and grouping happen in the window over the loaded tasks, so changing them needs no reload.

### Columns (criterion 2)

- **The columns:** Title, Status, Priority, Due date, Start date, Tags, Milestone, Project (My tasks only), Created, and Updated.
  - **Shown at first:** Title, Status, Priority, Due date, Milestone, and Tags, plus Project on My tasks.
- **The Columns menu:** a dialog lists every column with a checkbox, to show or hide it, and Move up and Move down buttons, to reorder it. Title is always shown and always first.
- **Resizing:**
  - With the mouse, by dragging the edge of a header.
  - With the keyboard, through the same edge: it is a focusable `separator` that the arrow keys resize in steps of 16 px.
  - Widths range from 60 to 800 px.
- **Saving the layout:** the layout of each view (project tables share one, My tasks has its own) is saved in the profile setting `taskTables`.
  - It is checked with zod, and unknown or invalid entries fall back to the defaults.
  - A change shows at once and is saved in the background; if saving fails, the saved layout comes back with a message.
  - The default widths fit a 1280 px window beside the sidebar, so Title is not scrolled out of view.
  - Column IDs are strings, so custom fields can add columns later.

### Sorting and grouping (criterion 3)

- **Sorting:** a header button sorts by its column, ascending, then descending, then back to the filter's sort. The header carries `aria-sort`.
  - Empty values sort last in both directions.
  - Priority sorts from urgent to low.
  - Status sorts by category (to do, in progress, done, cancelled), then by name.
- **Grouping:** a "Group by" choice of None, Status, Priority, Milestone, or Project (My tasks).
  - Each group has a header row, with its name and count, and groups follow the same order rules.

### Editing (criterion 4)

- **Editable cells:** Title (text), Status, Priority, and Milestone (choices from the task's project), and the Due and Start dates. Tags, Project, Created, and Updated are read-only in the table.
- **The same path as the panel:** edits go through the same `tasks:update` call and `applyUpdate` helper as the task panel.
  - So the same validation messages appear, such as a start date after the due date.
  - The same notices appear too, such as "All subtasks are done".
- **Undo:** after a cell is changed, its toast offers Undo, which writes the previous value back. The activity log records both.
- **Keyboard (the WAI-ARIA grid pattern):**
  - **Moving:** the grid's body is one Tab stop. The header's sort buttons and resize handles are ordinary Tab stops before it, because each needs its own name and keys. The arrow keys move between cells; Home and End go to the row's ends; Ctrl+Home and Ctrl+End go to the first and last cells; Page Up and Page Down move by a screenful.
  - **Editing:** Enter or F2 starts editing a cell. On the Title cell, Enter opens the task's details and F2 renames it.
  - **Finishing:** in an editor, Enter commits and Escape cancels. Either way, focus returns to the cell.
  - **Choices:** select editors commit as soon as a choice is made.

### Speed (criterion 5)

- **Virtualised rows:** rows are a fixed 40 px tall, and only those in view (plus 10 above and below) are in the page. Spacers keep the scroll height.
- **ARIA counts:** the grid sets `aria-rowcount`, and each row its `aria-rowindex`, so assistive technology knows the full size.
- **Test:** a component test renders 5,000 tasks and checks that fewer than 60 rows are in the page.

### Accessibility (criterion 6)

- The axe scans include the table, the Columns dialog, and the table while a cell is being edited, in light and dark.

## Consequences

- No schema change and no new dependency. The virtualisation is about 40 lines of code; a library was not worth adding.
- Inline styles are set through React's style property, which the Content Security Policy allows, as the colour swatches already do. Column widths need them.
