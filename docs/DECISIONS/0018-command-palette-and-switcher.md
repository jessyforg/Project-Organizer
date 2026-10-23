# ADR-0018: Command palette and quick switcher (0.7.0)

- Status: Approved (the product owner said "start 0.7.0" on 2026-10-23, after approving the plan in `docs/plans/2026-10-21-next-features-plan.md` and decision D1; built on a feature branch, not merged)
- Date: 2026-10-23

## Context

Release 0.7.0 of the plan, "Find and act fast", holds two features: #5 the command palette and #4 the quick switcher. Decision D1 chose one component with two modes: Ctrl+K for actions and Ctrl+O to jump to an item. The plan lists the acceptance criteria, and this ADR records how they are met.

## Decisions

### One dialog, two modes

- **Ctrl+K** opens the palette with `>` already typed. Text after `>` filters **actions**.
- **Ctrl+O** opens it empty. Text without a leading `>` lists **projects, notes, and tasks**. Deleting the `>` switches modes, as in VS Code.
- Both shortcuts work on every screen except while a dialog is open, like the other shortcuts (R23).
- **Ctrl+K used to focus the sidebar search.** That box still works with the mouse. The palette's last entry, "Search everything for '…'", opens the same search page, so nothing is lost.

### Actions

- **Everywhere:**
  - New task, New note, and New project;
  - Go to Today, My tasks, Calendar, Projects, Notes, Trash, or Settings;
  - Switch to light or dark theme;
  - Show keyboard shortcuts.
- **On a screen:** pages add their own actions while they are shown, through `usePaletteActions(group, items)`.
  - **A note:** the editor's ⋯ menu items, plus Save now and Focus mode.
  - **A project:** Edit, Workflow, and the ⋯ menu items (Mark completed, Archive, Move to trash…), plus New note in this project.
- **The same code as the buttons (criterion 6):** a page passes the very `MenuItem` list its menu button draws.
  - Confirmations, undo toasts, and saving a note's pending edits therefore happen exactly as with the buttons.
  - The palette closes first, and the action runs once it has closed. A confirmation dialog then opens on its own, not on top of the palette.
  - New note uses a hook shared with the Notes page's button. New project opens the same `ProjectDialog`.
- **Shortcuts:** each action shows its shortcut, if it has one, and exposes it as `aria-keyshortcuts`.
- **Filtering:** every typed word must appear in the action's name or group, ignoring case. Names that start with the text come first.

### Items (quick switcher)

- **A new service, `SwitcherService`, with three channels**, all checked with zod:
  - `switcher:search` takes `{ text, includeArchived }`;
  - `switcher:recent` takes `{ includeArchived }`;
  - `switcher:recordOpened` takes `{ kind, id }`.
- **Matching:**
  - full-text search (the existing FTS5 indexes, with prefix terms) on titles and bodies;
  - plus a title match on the whole typed text (`LIKE`, with `%` and `_` escaped).
- **Ranking:** titles that start with the text first, then titles that contain it, then body matches. Ties go to the most recently updated. At most 30 results.
- **Speed (criterion 2):** a service test seeds 5,000 tasks and checks that a search finishes within 100 ms.
- **Each result shows** its type, and:
  - a task, its project;
  - a note, its project and note folder;
  - a project, its folder;
  - archived items, an "Archived" label.
- **Archived and trashed:**
  - Archived items are hidden unless "Include archived" is ticked. A note or task counts as archived when it, or its project, is.
  - Trashed items, and items whose project is trashed, are never shown.
- **Recent items (criterion 3):**
  - Opening a project, a note, or a task's details records it, from one place in the shell that watches the route.
  - The list keeps the newest 10 distinct items, stored per profile as JSON in the profile's `settings` table under the key `recentItems`.
  - The settings service ignores keys it does not know, so this needs no schema change.
  - Reading the list drops items that were trashed or deleted since, so it never points at nothing. It also drops archived items unless they are asked for.
  - Recording does not refresh the app's data, so opening an item never reloads the screen.
- **Opening (criterion 5):**
  - Enter opens a project or note, or shows a task's details on the current screen.
  - Ctrl+Enter opens a note in focus mode.

### Accessibility

- The palette is a native modal `<dialog>`, labelled "Command palette".
- The text box uses the ARIA combobox pattern, as the slash menu does:
  - `aria-expanded`, `aria-controls`, and `aria-activedescendant` point into a `listbox`;
  - options are grouped (`role="group"`) by section.
- ↑ and ↓ move the highlight and wrap; Home and End stay in the text box; Enter runs the highlighted option.
- Escape closes the palette, and the dialog returns focus to where it was.
- A live status line announces the number of results.
- Axe scans run with the palette open in both modes, in light and dark.

### Not included

- **Fuzzy matching** (typos, skipped letters). Word matching is predictable and fast, and it can be revisited.
- **Rebinding the shortcuts.**
- **Actions on the selected task in a list.** The task details panel keeps its own buttons.

## Consequences

- No schema change and no new dependency. The Content Security Policy is unchanged.
- Recent items live inside the profile, so they come back with a restored backup and are included in the JSON export (the `settings` table).
- Ctrl+K no longer focuses the sidebar search. The shortcuts table, the search page's hint, and the end-to-end workflows are updated.
