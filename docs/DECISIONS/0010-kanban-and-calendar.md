# ADR-0010: Kanban board and calendar

- Status: Approved (built on 2026-10-20 after the product owner's go-ahead: "do the kanban and calendar")
- Date: 2026-10-20

## Context

Kanban (L1.1) and Calendar (L3.4) are the second and third items of the next feature work ([ROADMAP.md](../ROADMAP.md#after-the-mvp)). Neither needs new stored data: the board is another view of tasks and their per-project statuses, and the calendar is another view of due dates.

## Decisions

### Kanban board (L1.1)

- **Where:** a List/Board switch in each project's Tasks section. Each project has its own workflow, so a board spanning several projects would have no shared columns.
- **Columns:** every status of the project's workflow in workflow order, including Done and Cancelled.
- **Cards:** top-level tasks in manual order. Subtasks are shown as a count on their parent's card, because they belong to their parent rather than to a column.
- **Moves are atomic:** the new channel `tasks:moveOnBoard` sets the status and the position in one transaction, so a failed move changes nothing. It reuses the existing rules:
  - completion dates are set or cleared like any status change;
  - the usual suggestions still appear (for example, "every task is done");
  - positions use the manual sort keys.
- **Mouse:** native HTML drag and drop. A marker shows where the card will land. Dropping on a card's upper half puts it above that card; dropping on empty column space puts it at the bottom.
- **Keyboard and screen readers:** every card has a Move button. It opens a dialog to choose the column and the position ("At the top", "After …", "At the bottom"). Dragging is never the only way to move a card.
- The board has no filters: it always shows the whole workflow. The list view keeps its filters.
- No new dependency. Drag-and-drop libraries were not needed for one level of columns.

### Calendar (L3.4)

- **Entries are task due dates only.** L3.4 also mentions milestones (L1.2) and recurring occurrences (L3.1), which the app does not have yet. They will be added to the calendar when those features exist.
- **Views:**
  - Month: whole weeks; up to three entries per day, then "N more".
  - Week: seven columns.
  - Day: the full task list, with checkboxes.
  - The first day of the week comes from the Windows locale (Sunday for English (Philippines) and English (US); Monday for many others).
- **Overdue:** overdue open tasks show on their due date in red, with an icon and screen-reader text ("overdue"), so colour is never the only signal. A notice counts them and opens today's Day view, which lists them.
- **Navigate to task:** an entry opens the task details panel. Changing the due date there moves the entry at once, because every change reloads visible data (ADR-0008).
- **Filters:** done and cancelled tasks are hidden unless "Show done and cancelled" is checked; tasks in archived projects are not shown; one project can be chosen.
- **Dates are calendar dates, never times.** All arithmetic works on `YYYY-MM-DD` values built from their parts, so time zones and daylight-saving changes cannot move a task to another day. This is unit-tested with a time zone that observes daylight saving.
- Not included: dragging entries to another day (change the due date in the details panel instead), start dates and date ranges, and reminders (L3.5).
