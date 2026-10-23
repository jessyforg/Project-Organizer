# Changelog

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
