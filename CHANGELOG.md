# Changelog

## 0.9.0 — Milestones, activity log, task table, custom fields, and templates (2026-10-24, not yet publicly released)

Everything left in the feature plan, in one release. Profiles upgrade from schema v7 to v11 automatically, after a verified snapshot.

**New name and licence:** ProjectForge is now **Katha**, released under the MIT licence ([ADR-0025](docs/DECISIONS/0025-name-and-licence.md)). Katha installs as a separate app with its data in `%APPDATA%\Katha`. To keep profiles from a ProjectForge build, follow "Moving from a ProjectForge build" in the README. Backups made by ProjectForge restore unchanged.

**New look:** a new app icon and logo, the banig weave ([ADR-0026](docs/DECISIONS/0026-brand-banig-weave.md)). It appears on the installer, the taskbar, and in the app's sidebar and first-run screen.

**Updated:** Electron 44.10.1, which includes the fix for advisory GHSA-jr5w-w6x2-84p9. The zod library is now 4.6.7, which fixes advisory GHSA-mrhx-c7xc-m3w5, where a crafted backup or template file could exhaust memory.

**Licence notices:** the installed app now includes `THIRD_PARTY_NOTICES.txt`, the licence texts of every library, the font, and the SQLite components it ships. The build writes it and stops if a library has no licence text.

### Milestones

- **Milestones:** a project can have milestones, such as "Beta" or "Launch", each with a name, description, and target date.
  - Create them in the new Milestones section of a project page.
  - Each shows its progress over its tasks, counted like project progress, and is marked "Overdue" when its date has passed.
  - "Mark completed" and "Reopen" do not change the milestone's tasks.
- **Tasks in a milestone:** choose a task's milestone in its details. Subtasks count through their parent task.
- **Filter:** the project's task list has a Milestone filter. Choosing a milestone's name shows its tasks.
- **Where milestones appear:**
  - on the Today screen (overdue, and due within 7 days);
  - on the calendar, on their target dates;
  - on board cards.
- **Favourites:** milestones can be starred. Opening one shows its project, filtered to its tasks.
- **Trash:** trashing a milestone keeps its tasks. Restoring it brings their links back. Trashing a project takes its milestones with it.
- **Moving a task to another project** removes its milestone.
- Profile data schema version 8. Existing profiles upgrade automatically after a verified snapshot.

### Activity log

- **Every change is recorded.** That covers creating, renaming, changes of status, priority, due date, milestone, and folder, archiving, moving, the trash, and files added to or removed from notes.
- **Where to see it:**
  - Tasks and projects have an **Activity** tab, in plain sentences, newest first. A project's tab includes its tasks, notes, and milestones.
  - **Recent activity** on Today replaces "Recently updated". Each entry opens its item.
- **Note editing:** autosaves are not listed one by one. Edits to a note within 10 minutes count as one.
- **Retention:** choose how long activity is kept in Settings → Activity history (1 year by default). It is included in backups.
- **Permanent deletion:** deleting something permanently from the trash also removes its history.
- Profile data schema version 9.

### Tasks as a table

- **Where:** a new **Table** view beside List and Board on project pages, and on My tasks.
- **Columns:** title, status, priority, due date, start date, tags, milestone, project (on My tasks), and when it was created and updated.
  - Show, hide, and reorder them from **Columns**.
  - Resize them by dragging a header's edge, or with the arrow keys on it.
  - Each view remembers its layout.
- **Sorting and grouping:** sort by any column from its header, and group by status, priority, milestone, or project.
- **Editing in place:** edit the title, status, priority, dates, and milestone in the table. Each change can be undone from its message.
- **Keyboard:** the arrow keys move between cells; Enter or F2 edits; Enter on a title opens the task.
- **Large lists:** large tables stay fast, because only the rows in view are drawn.

### Custom fields

- **Adding fields:** give a project its own task fields from ⋯ → **Custom fields…**. A field can be text, a number, a date, a checkbox, a single choice, or a multiple choice.
- **Setting values:** set them in a task's details, under **Fields**.
- **In the table:** each field is a column on the project's table. You can sort and group by it, filter with **Field filter**, and edit it in place.
- **Changing a field's type** keeps every value. If a value does not fit the new type, nothing changes, and the message says which tasks to fix first.
- **Trash:** a field moved to the trash keeps its values until it is deleted for good, and Undo or Restore brings everything back.
- **Activity:** changes to field values appear in a task's Activity.
- **Moving a task** to another project removes its field values, and the move message says so.
- **Fixed:** confirming inside a dialog no longer closes the dialog around it.
- Profile data schema version 10.

### Project templates

- **Starting from a template:** **New from template** on the Projects page starts a project from a template. You see a preview of its workflow, milestones, fields, tags, tasks, and notes first, and dates are counted from the start date you choose.
- **Three built-in templates:** Software development, Personal productivity, and Study and learning.
- **Your own templates:** save any project as a template from its ⋯ menu (**Save as template…**). You can keep its dates, counted from the start. Tasks always start as not done.
- **Managing templates:** **Templates…** on the Projects page renames, deletes, exports, and imports templates. Exported templates are `.pftemplate.json` files, and an imported file is checked before it is used.
- Creating a project from a template is all or nothing, and the template itself never changes.
- Profile data schema version 11.

## 0.8.0 — Favourites, icons, and covers (2026-10-23, not yet publicly released)

- **Favourites:** star a project or note from its ⋯ menu, its right-click menu, or the command palette.
  - Starred items appear under "Favourites" at the top of the sidebar.
  - Drag them to reorder, or use Move up and Move down in a favourite's right-click menu (Shift+F10 from the keyboard).
  - An item in the trash leaves the list until it is restored. Archived items stay, marked "Archived".
- **Icons:** give a project or note one of 60 built-in icons (emoji and line icons).
  - It is shown in the sidebar, the project and note lists, the command palette, and above the title.
  - Nothing is downloaded.
- **Covers:** add a coloured or gradient cover above a project or note, or upload an image (PNG, JPEG, GIF, or WebP, up to 20 MB).
  - Covers are softer in light mode and dimmed in dark mode.
  - Images are stored with the profile, so encrypted backups include them.
- **Removing:** "Remove icon" and "Remove cover" restore the usual look.
- **Projects** now have a right-click menu in the sidebar and on the Projects page.
- Profile data schema version 7. Existing profiles upgrade automatically after a verified snapshot.

## 0.7.0 — Find and act fast (2026-10-23, not yet publicly released)

- **Command palette (Ctrl+K):** type to find and run an action.
  - New task, note, or project; go to any screen; switch between light and dark; show the keyboard shortcuts.
  - On a note or project, its own actions come first: the same ones as its buttons and ⋯ menu, with the same confirmations and undo.
  - Each action shows its shortcut, if it has one.
  - The last entry, "Search everything for …", opens the search page.
- **Quick switcher (Ctrl+O):** type a name to jump to a project, note, or task.
  - Each result shows its type, project, and folder. Titles that start with what you typed come first.
  - With nothing typed, it lists the 10 items you opened most recently.
  - Archived items show only when "Include archived" is ticked. Items in the trash never show.
  - Enter opens the item, and Ctrl+Enter opens a note in focus mode.
  - In the palette, deleting the `>` switches to finding items, and typing `>` switches back.
- **Changed:** Ctrl+K used to move to the sidebar search box. The box still works with the mouse, and the palette's last entry opens the same search.
- No data changes. Recent items are kept in the profile, so backups include them.

## 0.6.0 — Notes (2026-10-23, not yet publicly released)

- **Formatting bubble:** select text in a note to get a small toolbar above it.
  - It has bold, italic, strikethrough, inline code, link, and "Turn into" for headings, lists, quotes, and code blocks.
  - Alt+F10 moves into it from the keyboard.
  - Links accept web and email addresses; `https://` is added when left out.
- **Outline:** the Outline button shows a panel of the note's headings beside the text.
  - Click a heading to jump to it.
  - The heading you are in is highlighted.
  - The choice to show it is remembered per profile.
- **New blocks:** callouts (note, tip, warning), toggles that open and close, and tables.
  - Each is available from the `/` menu, and callouts also from "Turn into".
  - Each is saved as standard Markdown that GitHub and Obsidian read.
  - Notes with tables now open in the visual editor.
- **Table toolbar:** add or delete rows and columns while the cursor is in a table.
- **Note links:** type `[[` to link to another note, or to create one.
  - A link always shows the note's current title.
  - Click to open it, Ctrl+click to open it in focus mode.
  - A link to a note in the trash shows as broken until the note is restored.
- **Backlinks:** below each note, see the notes that link to it, and notes that mention its title without a link. "Link" turns such a mention into a link.
- **Mentions:** type `@` to mention a task or project.
  - A task shows its status and due date, and updates when the task changes.
  - Clicking opens the task's details, or the project.
  - A task's details list the notes that mention it.
- **Images and files:** paste or drop them into a note, or use `/image` and `/file`. These show a "Choose…" button that opens the file window.
  - Images show in the note, with a description for screen readers.
  - Other files can be opened or saved as a copy. Files that run programs can only be saved.
  - Files are kept with the profile, so encrypted backups include them.
  - Up to 20 MB per file and 1 GB per profile.
  - Images on the web are still never loaded.
- Profile data schema version 6 (a link index and attachments). Existing profiles upgrade automatically after a verified snapshot.
- **Fixed:** opening a note that ends in a list could mark it "Unsaved changes" without anything being typed.

## 0.5.0 — Slash commands (2026-10-21, not yet publicly released)

- **Slash commands in notes:** type `/` at the start of a line (or after a space) to insert a block: text, headings 1–3, bulleted, numbered, and checklists, a quote, a code block, or a divider.
  - Keep typing to filter (`/h2`, `/todo`).
  - ↑ and ↓ choose, and Enter, Tab, or a click inserts. Escape closes the menu (in focus mode it closes only the menu).
- An empty line shows the hint "Type / for commands".
- Notes are still saved as the same Markdown; no data changes.

## 0.4.0 — Notes library, archiving, colour themes, and right-click menus (2026-10-21, not yet publicly released)

- **Notes library and note view:** Notes opens on a library (folders beside a full-width list with search, project, tag, and sort filters). Opening a note shows it on its own, with "← All notes" and a breadcrumb.
- **Focus mode:** Ctrl+Shift+F (or the Focus button) hides the sidebar and the note's details while you write; Escape leaves it.
- **Archive notes:** archived notes leave the library and folder counts, appear under Archived, stay searchable, and are read-only until you unarchive them. Archive and Unarchive can be undone.
- **Right-click menus:** right-click a note (or press Shift+F10) for Open, Rename, Duplicate, Move to folder, Archive, Copy, Export, and Move to trash; right-click a folder to rename or delete it.
- **Colour themes:** in Settings → Appearance, choose a primary colour (blue, teal, green, violet, rose, amber) and a background tone (cool grey, neutral grey, warm). Every combination is checked for readable contrast in light and dark.
- **Manage tags:** Settings → Tags lists each tag and where it is used; rename, recolour, or delete tags. Deleting a tag keeps the items that used it.
- Profile data schema version 5; existing profiles upgrade automatically after a verified snapshot.

## 0.3.0 — Visual note editing, note actions, import, and folders (2026-10-21, not yet publicly released)

### Notes

- **Visual editing:** notes open in a visual editor with a formatting toolbar and Markdown shortcuts (for example `# ` for a heading, `- ` for a list). They are still saved as Markdown. Notes with formatting the editor cannot show yet, such as tables or images, open in Markdown mode unchanged. Visual and Markdown modes can be switched at any time; Write and Preview are inside Markdown mode.
- **More formatting:** strikethrough, inline code, checklists, dividers, and headings 1–6. Ctrl+click opens web and mail links.
- **Note actions menu (⋯):** Rename, Duplicate, Copy as Markdown, Export as Markdown, and Move to trash, which now asks first.
- **Import Markdown:** pick `.md` files, drop them on the Notes screen, or paste them after copying them in File Explorer. A leading `# Heading` becomes the title. Files that cannot be imported are listed with the reason.
- **Note folders:** create, rename, and delete folders on the Notes screen; filter by folder; move a note with its Folder field. Deleting a folder keeps its notes.
- Encrypted backups and JSON exports include note folders. Profile data schema version 4; existing profiles upgrade automatically after a verified snapshot.

### Interface refresh

- **Sidebar:** grouped by purpose (planning views, projects and notes, the projects list, then Trash, Settings, and your profile). The search box shows its shortcut, and long project names no longer break the list.
- **Every screen:** a consistent page header, lists on clean panels, compact filter toolbars, and helpful empty states.
- **Project page:** a summary panel and a breadcrumb back to Projects. Less common actions (complete, archive, move to trash) are in a "More project actions" menu; an archived project shows an Unarchive button.
- **Settings:** grouped into cards. The Workflow dialog has aligned rows.
- **First run:** a welcome card.
- **Behaviour and accessibility:** subtle motion that respects "reduce motion"; text contrast re-checked in both themes.
- **Fixed:** the whole window could scroll and leave a blank strip under the sidebar.
- **Fixed:** dropdown lists were white on white in dark mode.

## 0.2.0 — Notes, Kanban board, and calendar (2026-10-20, not yet publicly released)

### Kanban board (L1.1)

- Each project's tasks can be shown as a board with one column per workflow status (switch between List and Board).
- Drag cards between columns and within a column, or use a card's Move button to choose a column and position from the keyboard.
- Moving a card to a Done status completes the task; the order is saved.

### Calendar (L3.4)

- A Calendar screen shows tasks on their due dates in month, week, and day views, starting the week as Windows does for your region.
- Overdue tasks are marked in red with an icon; a notice links to today's list of them.
- Select an entry to open the task; changing its due date moves it at once.
- Filter by project and choose whether to show done and cancelled tasks.

### Notes (L1.5)

- Markdown notes in every project (loose notes go to the Inbox), with tags, a Notes screen with search and filters, and a Notes section on each project page.
- Write and Preview modes. The preview supports headings, lists, task lists, tables, quotes, code, and links. Raw HTML is shown as text, images are never loaded, and only web and mail links open (in the system browser).
- Notes save themselves while you type (Ctrl+S saves at once). Leaving a note or closing the window saves first, and asks before discarding changes that could not be saved.
- Global search, the trash (including moving a project to the trash), encrypted backups, and JSON exports include notes.
- Profile data schema version 3; existing profiles upgrade automatically after a verified snapshot.

### Fixed

- A backup damaged in a particular place could fail with a technical database error instead of "wrong password or damaged file".

## 0.1.0 — MVP (2026-10-17, not yet publicly released)

First complete version of the free, local-first project organizer for Windows.

### Profiles

- Separate local profiles, each in its own database file; create, rename, switch.
- Profile trash with 30-day recovery.

### Projects and tasks

- Projects with description, type (general or software), colour, dates, folders, and tags.
- Per-project workflows: rename, add, reorder, and remove statuses (tasks are reassigned, never lost).
- Archive and unarchive; mark completed or active; suggestion when every task is done.
- Tasks with subtasks, priorities (Urgent, High, Medium, Low, or none), start and due dates, tags, and dependencies with cycle prevention.
- Progress calculated from tasks, counting subtasks instead of their parents and leaving cancelled tasks out.
- Inbox for tasks without a project; move tasks between projects.
- Trash for tasks and projects: restore whole hierarchies, delete permanently, automatic purge after 30 days.

### Working with tasks

- Today dashboard: overdue, due today, next 7 days, recently updated, recently completed, active projects with progress.
- Task lists grouped by status, with filters (status, priority, due, tag, project), sorting, and search.
- Global search across projects (including archived) and tasks; accent-insensitive.
- Task details panel; quick add from anywhere (Ctrl+N); keyboard shortcuts.
- Light, dark, and system themes.

### Data safety

- Password-encrypted backups (SQLCipher v4), verified after writing.
- Backup check, test restore, restore as a new profile, or replace the open profile (with a verified copy of the previous data and crash-safe swapping).
- Automatic daily copies (7 days) plus copies before updates and restores; recovery of a damaged profile from these copies.
- JSON export (unencrypted, with a warning).

### Security and privacy

- No network use, accounts, or telemetry.
- Hardened Electron configuration: isolated, sandboxed renderer; narrow validated bridge; strict Content Security Policy; locked-down fuses.
