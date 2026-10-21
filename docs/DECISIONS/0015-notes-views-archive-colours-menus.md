# ADR-0015: Notes library and note views, archived notes, colour palettes, tag management, and right-click menus

- Status: Approved (the product owner approved all recommended options on 2026-10-21; implemented the same day on a feature branch, not merged)
- Date: 2026-10-21

## Context

The product owner asked for:
- a dedicated view to browse notes and another to focus on one;
- archiving of notes;
- primary and secondary theme colours;
- a way to delete tags;
- right-click menus on list items.

The recommendations they approved:
- the secondary colour is the **background tone**;
- archived notes are **read-only**;
- right-click menus are on **Notes only** for now;
- 0.3.0 is **merged first** and this work branches from it.

## Decisions

### Notes library and note view

- **One page, two views:** the Notes page shows a **library** when no note is open, and a **note view** when one is.
  - The library has folder filters (All, each folder, No folder, Archived) beside a full-width list.
  - The list has search, project, tag, and **sort** (last updated, newest, title A–Z) filters.
  - Rows show the folder, project, update time, and tags.
- **Filters are kept:** the page stays mounted between the views, so the library keeps its filters when you come back.
- **Note view:**
  - It shows one note at a reading width, with "← All notes" and a breadcrumb (Notes / folder / Archived).
  - It is **keyed by the note**, so every note gets fresh data. Reusing the previous note's data while the next one loads showed, and would then have saved, the wrong text. The end-to-end duplicate test found this; a component test now covers it.
- **Focus mode:** the Focus button or Ctrl+Shift+F.
  - It hides the app sidebar and the note's details (project, folder, tags) and drops the note's panel.
  - Escape or Exit focus leaves it, and so does leaving the note.
  - Escape is honoured even though ProseMirror marks it handled (it selects the parent block), except inside a dialog. Open menus stop Escape themselves.
  - jsdom does not reproduce ProseMirror's handling, so the end-to-end test is what guards this.

### Archived notes

- **Schema v5:** adds `notes.archived_at`.
- **Lists:** archived notes leave lists and folder counts by default. The `archived` list option is `exclude` (default), `only`, or `include`; global search includes them, labelled.
- **Read-only:**
  - `NoteService.update` refuses archived notes (CONFLICT).
  - The editor shows a banner with **Unarchive**, read-only title and text, and no toolbar.
  - Moving, filing, tagging, duplicating, exporting, and trashing stay available.
- **Making the editor editable is not an edit:** `setEditable(…, false)`. Tiptap's default reports an update, which re-saved, and reformatted, a note just by unarchiving it.
- **Undo:** Archive and Unarchive show an Undo notice.

### Colour palettes

- **Two settings per profile:**
  - **Primary colour** (`accent`): blue, teal, green, violet, rose, amber.
  - **Secondary colour** (`surface`): cool grey, neutral grey, warm backgrounds.
- **Presets only:** a free colour picker was rejected because it allows unreadable combinations.
- **One source of truth:** palettes are data in `src/shared/palettes.ts`.
  - A unit test checks every combination, 6 × 3 × light and dark, for 4.5:1 contrast of all text tokens on all surfaces, including button text on the accent.
  - Another test keeps blue/cool equal to `tokens.css`.
  - The contrast test was confirmed to fail on an unreadable colour.
- **Applying the palette:** the renderer sets CSS custom properties on the root element through the CSSOM, which the Content Security Policy allows (a `<style>` element is blocked). The theme decides light or dark values, and the palette is re-applied when Windows switches modes under "Match Windows".
- **Reset:** the profile screen (no profile open) removes the palette. A palette left from a profile could be for the other mode, putting light text on light surfaces (found in screenshot review).

### Tag management

- **Settings → Tags** lists every tag with its colour and how many live tasks, projects, and notes use it (`tags:usage`). From there a tag can be edited (name and colour) or deleted.
- **Delete** asks first and names what will lose the tag. Deleting a tag keeps the items; the `tags:delete` channel already existed.

### Right-click menus

- **Hook:** `useContextMenu()` binds a right-click to open a menu at the pointer, or Shift+F10 and the Menu key to open it below the element. The menu stays inside the window and closes on a click elsewhere, scrolling, or resizing; Escape returns focus to the element.
- **Shared code:** `MenuList` is now shared with `MenuButton`, so both behave the same. `MenuButton` can build its items when it opens, which keeps functions that read refs out of render.
- **Note rows:** Open, Rename, Duplicate, Move to folder…, Archive/Unarchive, Copy as Markdown, Export as Markdown…, Move to trash…
  - These come from one `useNoteActions` hook, shared with the note's ⋯ menu.
  - From a list, Rename and Move to folder open small dialogs.
  - In the editor, Rename focuses the title.
- **Folders and tags:** folders get Rename and Delete. Tag rows in Settings get Edit and Delete; the ⋯ button remains their keyboard route.

### IPC

Three channels were added (84 in total): `notes:archive`, `notes:unarchive`, `tags:usage`. The note list query gained `archived` and `sort`, and settings gained `accent` and `surface`.

## Consequences

- **Upgrades:** profiles upgrade to schema v5 after a verified snapshot. A committed `profile-v4.db` fixture (0.3.0's schema) tests the upgrade.
- **Palette maintenance:** new palettes must pass the contrast test before they can ship.
- **Right-click menus elsewhere:** projects, tasks, and the sidebar can adopt `useContextMenu` later without new infrastructure.
