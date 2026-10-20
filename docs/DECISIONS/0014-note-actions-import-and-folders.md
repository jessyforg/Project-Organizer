# ADR-0014: Note actions, Markdown import, and note folders

- Status: Approved (the product owner approved the actions-menu plan with its recommended options, added import and folders, and approved "everything … up until you commit and have a new build" on 2026-10-21; implemented the same day on a feature branch, not merged)
- Date: 2026-10-21

## Context

After visual editing ([ADR-0013](0013-visual-note-editing.md)), the product owner asked for:
- the basic actions a note needs;
- a way to bring existing Markdown files into Notes;
- folders for notes.

[ADR-0009](0009-markdown-notes.md) had made each note's project its only folder. The product owner now wants folders of their own.

## Decisions

### Note actions menu

- **Location:** one **Note actions** (⋯) menu at the top of the open note (product owner's choice), built on the existing accessible `MenuButton`. Every action first saves pending edits, so it works on what is on screen.
- **Rename:** focuses and selects the title field, which already saves as you type. No dialog was added, because it would duplicate the field.
- **Duplicate:** `notes:duplicate` copies the body, project, folder, and tags in one transaction, titled "… (copy)" and cut to fit the title limit. Search indexing follows from the existing triggers. A note in an archived project cannot be duplicated, the same rule as creating notes there.
- **Copy as Markdown:** `notes:copyMarkdown` writes the *saved* body to the clipboard from the main process (Electron's `clipboard`).
  - The renderer keeps every browser permission denied (`setPermissionCheckHandler(() => false)`).
  - It sends only a note ID, so it cannot place arbitrary text on the clipboard.
- **Export as Markdown…:**
  - `notes:exportMarkdown` opens a save dialog named after the title (made safe for Windows, including reserved device names).
  - It writes `# Title`, a blank line, then the body (product owner's choice), so the file stands on its own.
  - It uses the same write-then-rename as the JSON export, and cancelling writes nothing.
- **Move to trash…:** now asks first, with "You can restore it from Trash for 30 days". It replaces the red button at the bottom of the note, keeping destructive actions in menus (ADR-0011). The existing Undo notice remains.

### Markdown import

- **Sources:** files picked with **Import Markdown**, dropped onto the Notes screen, or pasted after copying them in File Explorer.
  - Pasting is ignored while focus is in a field or the editor, so normal paste keeps working.
  - Dropping outside the Notes area does nothing; the main process already blocks navigation to files.
- **Reading files in the renderer:** files are read in the renderer (`File.text()`). The main process receives parsed notes through one validated channel, `notes:import`, which creates them all or none. The main process never reads arbitrary file paths. The zod schema limits each import to 50 notes, each body to 1 MB, and each title to 500 characters.
- **Parsing** (`src/shared/markdown-file.ts`, shared so both sides agree):
  - A leading `# Heading` becomes the title, and the rest is the body. Otherwise the file name is the title and the whole text is the body.
  - A byte order mark is dropped, and Windows line endings become `\n`.
  - Import and export round-trip.
- **Skipped files:** only `.md` and `.markdown` files up to 1 MB are imported. The notice names each skipped file and why.
- **Destination:** notes go to the project and folder being viewed, otherwise to the Inbox with no folder.

### Note folders

- **Schema v4:** adds `note_folders` (`id`, `name`, case-insensitive unique `name_key`, timestamps) and a nullable `notes.folder_id` with `ON DELETE SET NULL` ([DATA_MODEL.md](../DATA_MODEL.md)).
- **Independent of projects:** a note has a project *and* optionally a folder. Folders organise the Notes screen across projects, the way people use folders in other note apps, without changing what a project is.
- **Like project folders:**
  - folders are flat and listed by name;
  - they are never trashed;
  - deleting one keeps its notes, including notes in the trash, and moves them to "No folder".
- **Rejected alternatives:**
  - **Nesting and manual ordering:** left out to keep the MVP small.
  - **Folders inside each project:** rejected because a note's project already does that job.
- **Notes screen:**
  - folder filters above the list: All notes, each folder with its count, No folder;
  - a per-folder menu for Rename and Delete;
  - New folder.
- **New notes** go into the folder being viewed. The note's Folder field moves it (`notes:setFolder`).
- **Counts** use the same rules as the list: live notes in live, unarchived projects.
- **Backups:** `note_folders` is among the counted tables, so encrypted backups, restore checks, and JSON exports include it.
- **Upgrade:** a committed `profile-v3.db` fixture (0.2.0's schema) tests the upgrade to v4.
- **Shared dialog:** the folder name dialog is now shared by project folders and note folders.

### IPC

Nine channels were added (81 in total), each with a zod schema and a typed response:

| Group | Channels |
|---|---|
| Notes | `notes:setFolder`, `notes:duplicate`, `notes:import`, `notes:copyMarkdown`, `notes:exportMarkdown` |
| Note folders | `noteFolders:list`, `noteFolders:create`, `noteFolders:rename`, `noteFolders:delete` |

## Consequences

- **Schema:** the profile data schema is now version 4. Profiles upgrade automatically after a verified snapshot. A backup made by this version cannot be restored by an older app, which already refuses newer schemas.
- **Import copies:** imported notes are not linked to their files. Editing the file later does not change the note.
