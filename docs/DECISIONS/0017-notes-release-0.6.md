# ADR-0017: Notes release 0.6.0 (formatting bubble, outline, blocks, links, mentions, attachments)

- **Status:** Implemented on 2026-10-23 (all six stages). Awaiting the product owner's check before merging. The plan and its decisions D1–D7 were approved on 2026-10-22: work is reported after each stage, and the product owner checks before any merge or push.
- **Date:** 2026-10-22.
- **Plan:** [plans/2026-10-21-next-features-plan.md](../plans/2026-10-21-next-features-plan.md), section 4.

This record grows by one section per stage.

## Stage 1 — Formatting bubble (#8)

### Decisions

- **Built on Tiptap's `BubbleMenu`:**
  - It comes from `@tiptap/react/menus`, which is already installed through `@tiptap/react`, so no new package is needed.
  - It positions itself with `@floating-ui/dom` through the CSSOM, which the Content Security Policy allows.
- **When it shows:** for a non-empty text selection while the editor or the bubble has focus. It never shows:
  - in read-only notes (it is not even rendered);
  - inside code;
  - for a selected block such as a divider (a node selection);
  - while the slash menu is open.
- **What it contains:**
  - **"Turn into"** reuses the slash-command list (ADR-0016), so any block added later appears in both places. Commands marked `insertOnly`, such as Divider, are left out.
    - Each command now says whether it is active, so the button shows the current kind ("Turn into: Heading 2").
  - **The inline marks** come from the toolbar's actions, so editors without strikethrough or inline code do not show them.
  - **Link** appears only where the link extension is loaded.
- **Links:**
  - `normalizeLink` adds `https://` to a bare address, turns an email address into `mailto:`, and refuses every other scheme (for example `javascript:`) with a visible error. It uses the same rule as the existing link checks (`EXTERNAL_LINK`).
  - An empty field removes the link.
  - Ctrl+K stays the global search shortcut, so the link field has no shortcut of its own.
- **Keyboard:**
  - Alt+F10 moves from the text into the bubble.
  - The bubble follows the toolbar pattern, sharing the new `useRovingFocus` hook with the main toolbar.
  - "Turn into" opens with Arrow Down and uses the shared `MenuList` (now exported).
  - Escape goes back to the text and stops there, so it does not also leave focus mode.

### Defects found and fixed during the stage

- **Opening a note marked it unsaved (data-safety relevant):**
  - **What happened:** `BubbleMenu` sends its options to its plugin as a transaction whenever they change. An options object created on every render therefore caused a transaction on every render. On a note ending in a list, any transaction lets the editor add a trailing paragraph, which Tiptap reports as an edit. The note showed "Unsaved changes", and closing the window had to wait for a save.
  - **How it was found:** the existing end-to-end "visual editor survives closing and reopening" workflow.
  - **Fix:** the options are created once. A component test, which re-renders an editor holding a list, fails without the fix.
- **Escape focus was late:** Tiptap's `focus()` command waits a frame. Escape now focuses the editor view at once, keeping the selection.

### Verification

- **Component tests:** 13 new. They cover every action's Markdown output, link rules (https added, mailto, `javascript:` refused, removal), keyboard use, read-only notes and code, and the re-render regression.
- **End to end:** a new workflow selects a word with a real double-click, then uses bold, a link, Alt+F10, and Turn into → Heading 2. It checks the stored Markdown: `## Hello [**brave**](https://example.com) world`.
- **Accessibility:** the axe scans now include the open bubble and the link field, in both themes.
- **Screenshots:** reviewed in light and dark.

## Stage 2 — Outline sidebar (#3)

### Decisions

- **The panel and its button:** the "Outline" button in the note's mode bar toggles a panel to the right of the text. It lists headings 1–3, indented by level.
- **Where the headings come from:**
  - In the visual editor, the document. The list is rebuilt 300 ms after typing pauses, using `outlineFromDoc`.
  - In Markdown mode, the Markdown syntax tree, parsed the same way the preview and the round-trip check parse it. A `#` inside a code block is therefore never a heading (`outlineFromMarkdown`).
- **Jumping to a heading:**
  - **Visual mode:** the cursor moves to the start of the heading, the heading scrolls into view, and it is highlighted for 1.2 s. The highlight is a ProseMirror decoration (the `FlashBlock` extension), so it never touches the document or its saved text.
  - **Markdown writing:** the cursor moves to the heading line.
  - **Markdown preview:** focus moves to the heading.
  - Scrolling is instant when the system asks for reduced motion.
- **The current heading:** the heading containing the cursor (visual mode, Markdown writing), or the one last jumped to (preview), is marked with `aria-current="location"`.
- **Remembered per profile:** whether the panel is shown is a new setting, `noteOutline`, defaulting to off.
  - It is stored in the existing key–value `settings` table, so there is no schema change.
  - It is validated with zod on both sides, like the other settings. An invalid stored value falls back to off.
- **Focus mode:** the panel is hidden there. The button shows it for the session without changing the saved setting. This is how the plan's "unless pinned" is implemented.
- **Narrow windows:** below 900 px of content width, the panel and its button are left out.

### Fix made alongside: edits are reported only when the document was changed by the edit itself

- **The problem:** `DocumentEditor` reported an edit for any change to the document. That included the empty trailing paragraph StarterKit adds after a transaction that only moves the cursor or carries a plugin message, as happened in stage 1's defect.
- **Why it mattered now:** the outline dispatches such transactions, by moving the cursor and by highlighting.
- **The fix:** `onEdit` and `onChange` now run only when the transaction itself changed the document. A component test checks both sides: moving the cursor in a note ending in a list adds the paragraph but reports nothing, while typing does report an edit.

### Verification

- **Component tests:** 9 for the outline, covering the Markdown parsing, the setting, each mode's jump, the current heading, following edits, and focus mode. Also 1 editor test and 1 settings service test.
- **End to end:**
  - a new workflow types three sections, opens the outline, and jumps to a heading below the window, which comes into view with the cursor in it;
  - it then edits the heading, restarts, and finds the outline still open;
  - the axe scans include the open outline, in both themes.
- **Screenshots:** light and dark, plus a narrow window, where the panel and button are hidden.

## Stage 3 — Callout, toggle, and table blocks (#10)

### Decisions

- **One exact Markdown form for each block:**
  - **Callouts** use GitHub's alert syntax: `> [!NOTE]` (also `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) on a line of its own, followed by quoted lines. Obsidian reads it too.
  - **Toggles** use `<details>` (or `<details open>`), then `<summary>…</summary>`, a blank line, the body, a blank line, and `</details>`.
    - The title is plain text with `&`, `<`, and `>` escaped.
    - Whether the toggle is open is saved, as Notion does.
  - **Tables** use GitHub tables with a header row.
- **The lossless check is the safety net.** Anything written differently fails the check, and the note opens in Markdown mode, unchanged. Examples:
  - a callout with a title, or with a kind in lowercase;
  - a toggle on one line;
  - other HTML.
- **Tables:** `@tiptap/extension-table` 3.31.4 is the first-party Tiptap package. It is pinned and build-time only, and `npm audit --omit=dev` still reports 0.
  - **One line per cell:** cells hold exactly one paragraph, and Enter and Shift+Enter do nothing in a cell. Markdown cells cannot hold more, so a second paragraph or a list could not be saved without changing its meaning.
  - **Always a header row:** a Markdown table needs one. "Delete row" and "Add row above" are unavailable in the header row.
  - **No inline styles:**
    - The extension's widths and alignment are written as inline `style` attributes, which the production Content Security Policy blocks.
    - The table renders without them, and column alignment is a `data-align` attribute styled in editor.css.
    - The end-to-end test fails on any Content Security Policy message in the console.
  - **Ambiguous pipes:** an unescaped `|` inside code in a cell splits the cell in GitHub (and in the preview), but not in the table extension. Such notes therefore stay in Markdown mode, which the lossless check guarantees, and a test covers it.
- **Inserting and converting:**
  - All blocks are in the slash menu: Callout, Tip callout, Warning callout, Toggle, and Table.
  - "Turn into" offers the callouts, which wrap the block, or change the kind when already in a callout. Toggles and tables are inserted only.
  - A new toggle is open, with the cursor in its title.
  - Enter on a toggle's title moves into its body. Ctrl+Enter or its button opens and closes it.
  - Enter on an empty last line leaves a toggle or a callout.
- **Table toolbar:**
  - While the cursor is in a table, a toolbar below it offers: add a row above or below, add a column left or right, delete the row, delete the column, and delete the table.
  - It follows the toolbar pattern. Alt+F10 reaches it when the formatting bubble is not showing.
- **Preview:** two small remark plugins (`preview-blocks.ts`) recognise the same exact forms in the parsed Markdown.
  - Callouts become labelled `aside role="note"` elements.
  - Toggles become real `<details>`/`<summary>` elements built from the parsed text.
  - Raw HTML is still never rendered.
- **Tidier output:** blocks inside callouts and toggles are written without the extra blank lines the table writer adds around itself. Saved text no longer starts with a blank line when a note begins with a table. Only newlines are trimmed, never spaces, because leading spaces can be meaningful.

### Changed expectations

- **Notes with tables now open in the visual editor.** The tests that used a table as the example of "opens in Markdown mode" now use an image, which stays Markdown-only until stage 6.

### Verification

- **Component tests:** 31 new.
  - Codec round trips for every callout kind, toggles (open, escaped, nested), and tables (alignment, escaped pipes, stability), plus the cases that must stay in Markdown mode.
  - The preview's rendering of callouts and toggles, and that other HTML is still not rendered.
  - Editing: slash insertion, changing a callout's kind, the toggle's title, Enter, Ctrl+Enter, and button, leaving blocks, the table toolbar, one-line cells, and "Turn into".
- **End to end:** a new workflow builds a warning callout, a toggle, and a table by keyboard.
  - It collapses and expands the toggle, deletes a column, and checks the stored Markdown.
  - It reopens the note in the visual editor and checks the preview.
  - It asserts that no Content Security Policy message appeared.
- **Accessibility:** the axe scans include a note with all five callout kinds, an open and a closed toggle, and a table with its toolbar, in the editor and the preview, in both themes.
- **Screenshots:** reviewed in light and dark, in the editor and the preview.

## Stage 4 — Note links and backlinks (#1)

### Decisions

- **Storage (D2):** a link is a normal Markdown link with an app address: `[Roadmap](projectforge://note/<id>)`.
  - Links survive renames, because the id is fixed.
  - Exported Markdown stays readable.
  - Only the exact form with a UUID is recognised. Anything else (a malformed address, or a link inside code) is not a link, and the lossless check keeps such notes in Markdown mode.
  - The rules live in `src/shared/app-links.ts`, so the main process's index and the renderer agree.
- **In the editor**, a link is an inline chip (`appLink` node) that shows the target's *current* title, looked up in batches through a new `links:resolve` channel.
  - The lookup is repeated after any data change, so renames show at once.
  - A link to a missing or trashed note is struck through, says "(not found)", and does not open. It works again when the note is restored.
  - **Known limitation:** the label saved in the Markdown is the title when the link was made. It is shown only when the note cannot be found, and exported Markdown carries it.
  - A click opens the note. Ctrl+click opens it in focus mode, through a new `focus` option on the notes route. Enter on a selected chip opens it too.
- **The `[[` picker:**
  - It lists other notes, matching titles first and then notes that only mention the text, up to 8, plus "Create note '…'".
  - A created note goes into the same project and folder as the current one.
  - It reuses the slash menu, which is now a generic suggestion menu (`suggestion-menu.tsx`). While results load, Enter and Tab wait rather than act on an old list.
- **Link index (schema v6):**
  - `note_links` holds the source note, target kind, and target id.
  - It is rebuilt for a note in the same transaction as each create, update, import, and duplicate.
  - It is built for existing notes when a profile opens, if it is empty while notes contain app links. Migrations stay SQL-only.
  - It is counted in the backup manifest and included in the JSON export.
  - Stage 6 will add attachment storage to the same, still unreleased, v6 migration.
- **Backlinks panel**, below the note and hidden in focus mode:
  - **"Linked from"** lists the notes that link here, archived ones included, with the text around each link.
  - **"Unlinked mentions"** lists the notes whose prose contains the title as a whole word, ignoring case. Code, links, and web addresses do not count. Titles shorter than 3 characters, and "Untitled note", are left out.
  - **"Link"** turns the first plain mention into a link, keeping its spelling. Archived notes are not offered, because they are read-only.
- **Preview:** app links are buttons with the current title, and missing ones are marked.

### Defects found and fixed during the stage

- **Picker order:** the first version listed a note that only mentioned "road" in its body above the note titled "Roadmap". Title matches now come first, ranked from 50 candidates, and a component test covers it.
- **Accessible name:** the preview's missing-link button read "Old(not found)", because name computation trims a space at the start of hidden text. The space now sits outside it.
- **Editor hint:** it said "Ctrl+click a link to open it", which is now true only for web links. It now says "Type [[ to link a note. Ctrl+click opens web links."

### Verification

- **Shared rules:** 10 unit tests covering addresses, escaping, links inside code, plain mentions, and snippets.
- **Services:** 11 tests.
  - The index on create, update, import, duplicate, and permanent deletion.
  - Building the index on opening.
  - Backlinks, with trashed notes left out.
  - Unlinked mentions, including code, short titles, and archived notes.
  - Linking a mention, and when it is refused.
  - Resolving notes, tasks, and projects, including missing, trashed, and archived ones.
- **Upgrade:** a committed `profile-v5.db` fixture (the 0.4.0/0.5.0 schema) with a note link written as Markdown. After the upgrade and opening, its backlink appears.
- **Components:** 9 tests covering the codec, chips (current title, open, Ctrl+click focus, broken), the picker (choose, rank, create), the backlinks panel (open, Link), and the preview.
- **End to end:** a new workflow.
  - `[[` with Enter, and the saved Markdown checked.
  - Opening from the chip, the backlinks panel, and linking a mention.
  - A rename shown in the chip.
  - Trash: the chip is broken and does not open; after restoring, it works.
  - Ctrl+click opens focus mode.
  - After a restart, the backlinks are still there.
- **Accessibility:** the axe scans include working and broken links and the backlinks panel, in both themes.

## Stage 5 — Mentions of tasks and projects (#2)

### Decisions

- **The same link, a different kind:** mentions use stage 4's link: `[Fix login](projectforge://task/<id>)` or `…/project/<id>`. The same chip, lookup, index, and preview handle them.
- **The `@` picker:**
  - Typing `@` after a space or at the start of a line searches tasks and projects through the existing global search. An `@` inside a word, as in an email address, does not open it.
  - Title matches come first, up to 8 results.
  - Each result says "Task · status · due date" or "Project", with an "Archived" tag where it applies.
- **Chips:**
  - A task chip shows a status dot (hollow for to do, accent for in progress, green for done, grey for cancelled) and its due date.
  - The full description is the chip's accessible name, for example "Task: Fix login, In progress, due 3 Nov", so colour is never the only cue.
  - Chips update when the task changes, because the lookup repeats after any data change. The note does not need saving.
  - One helper (`link-display.ts`) describes a link for both the editor chip and the preview button, so they always agree. The preview's links now carry the same accessible name as the chips.
- **Opening:**
  - A task chip opens the task details panel (`openTask`). A project chip opens the project.
  - A trashed task or project shows as unavailable and does not open.
- **"Mentioned in N notes":** the task details panel lists the notes that mention the task, with the text around each mention, and each opens the note.
  - It uses the stage 4 index through `links:mentionedIn`.
  - Note backlinks' "Linked from" now uses the same query (`LinkService.mentionedIn`).
  - Project pages do not list mentions yet. That is a candidate for later.
- **Editor hint:** it now reads "Type [[ to link a note, @ for a task. Ctrl+click opens web links."

### Verification

- **Services:** 1 new test, listing mentioning notes for a task and for a project, with trashed notes left out.
- **Components:** 7 new tests.
  - The `@` picker: ranking, each result's details, insertion, and no picker for an `@` inside a word.
  - Task chips: status, due date, and opening details.
  - Project chips: archived state and opening the project.
  - A trashed task shows as unavailable.
  - Task details: "Mentioned in" lists and opens notes, and is hidden when there are none.
- **End to end:** a new workflow mentions a task with `@`.
  - The chip shows its status and due date.
  - Completing the task changes the chip to Done.
  - The chip opens the task, whose "Mentioned in 1 note" opens the note.
  - The saved Markdown is checked.
- **Accessibility:** the axe scans include task and project chips, in both themes, and the due date's contrast on the chip passes.
- **Screenshots:** reviewed in light and dark.

## Stage 6 — Images and attachments, with the Image block (#9)

### Decisions

- **Storage (D3):** files are kept inside the profile database, in the `attachments` table added to the same, still unreleased, v6 migration.
  - **Backups need no change:** a backup stays one encrypted file, and backup, restore, trash, and the manifest count all work unchanged.
  - **What is stored:** name, kind, type, size, SHA-256, the bytes, and `unused_since`.
- **The type comes from the bytes, never the name.**
  - PNG, JPEG, GIF, and WebP are images.
  - Everything else is a file, including SVG, which can carry scripts and is never shown.
  - Names are reduced to the file name alone, without folders or control characters.
- **Limits:**
  - 20 MB per file and 1 GB per profile.
  - At least 100 MB must stay free on the disk after saving; otherwise the file is refused with `NOT_ENOUGH_SPACE`.
  - A file is stored in one statement, so it is stored whole or not at all.
  - Archived notes refuse new files.
- **Lifecycle by references:** a file stays while any note body refers to it, including notes in the trash.
  - Maintenance (when a profile opens, and daily) marks unreferenced files.
  - It removes files that have been unreferenced for the 30-day trash retention period. A file referred to again starts over.
  - This keeps undo working after an image is deleted, and keeps duplicated and restored notes intact. A file outlives the note it was added to (`ON DELETE SET NULL`).
- **Markdown:**
  - An image is `![description](projectforge://file/<id>)` and a file is `[name](projectforge://file/<id>)`.
  - Images on the web are never loaded and still keep a note in Markdown mode, as do malformed addresses.
  - Tiptap's Markdown reader lifts an image that is alone on its line out of its paragraph. The codec puts such inline content back into a paragraph wherever the schema expects blocks.
- **In the editor:**
  - **Images** are inline: they can sit in text and show as blocks. A description field under each image edits its alt text.
  - **Files** are chips with name, size, "Open", and "Save a copy".
  - **Adding files:** paste, drop, `/image`, or `/file`. The commands open the system's file picker.
  - **Executable files** (by extension) can be saved but never opened from the app. This is stricter than the plan's "warning", because there is nothing to gain from launching them from a note.
- **Showing images:** the renderer reads an image's bytes over IPC (`attachments:readImage`, images only) and shows them through an object URL.
  - The Content Security Policy gains exactly one source, `img-src blob:`. A unit test pins the directive.
  - Object URLs are released when the note closes.
- **Opening a file:** a copy is written to the app's own temporary folder, then opened with the system's default app (`shell.openPath`).
- **Saving a copy:** it uses the save dialog and writes next to the destination first, then renames, like Markdown export.
- **JSON export:** file contents are written as Base64 text, and the export's description says so.

### Defects found and fixed during the stage

- **Lone images opened in Markdown mode:** a note with an image alone on its line opened in Markdown mode, because Tiptap lifted the image out of its paragraph. Fixed by the codec's paragraph wrapping.
- **Image merged into a paragraph:** the first version of that wrapping merged a lone image into a paragraph before it, which changed the text. The lossless check caught it and kept the note in Markdown mode. Found in screenshot review; now only loose pieces are grouped. Both cases are regression tests.
- **Small buttons:** the file chip's buttons were smaller than WCAG 2.2's 24 px target size. Found by the new accessibility scan and fixed.

### Verification

- **Services:** 11 tests.
  - Storing and reading back bytes; types from contents (including SVG and a fake ".png").
  - Images only for display; clean names; the size and disk limits; archived and missing notes.
  - Info in order, missing files, executables.
  - Cleanup: kept while referenced, including from the trash; removed after 30 days unused; the clock starting over when referenced again; a duplicated note's images surviving the original's permanent deletion.
- **Channels:** 3 tests. Saving a copy writes identical bytes; opening uses the app's folder; executables are never opened.
- **Exports and backups:**
  - The JSON export carries Base64.
  - An encrypted backup with a 256 KB file restores into a new profile byte for byte, and the manifest counts the file.
- **Security:** a unit test pins `img-src 'self' data: blob:`.
- **Components:** 9 tests covering the codec forms (including lone images, quotes, and an image after a paragraph), web images staying in Markdown mode, an image with its description edited, missing images, pasting a file, file chips (open, save, no Open for executables), and the preview.
- **End to end:** a new workflow.
  - It adds a file with `/file` and an image with `/image` through the real file picker.
  - The image really loads under the Content Security Policy (it has its pixel width), and its description is set.
  - "Save a copy" writes the same bytes, and the saved Markdown is checked.
  - The preview shows the image, and it is still there after a restart.
  - No Content Security Policy message appears.
- **Accessibility:** the axe scans include an image and file chips, in both themes.
- **Screenshots:** reviewed in light and dark.

### Fix after review: the mouse pointer was hidden in the file window

- **Reported by the product owner (2026-10-23):** after `/file`, the mouse pointer was invisible, in ProjectForge and in the Windows file window, even while the mouse moved.
- **Cause, reproduced on their PC with real keystrokes:**
  - Windows' "Hide pointer while typing" (on by default) hides the pointer when `/file` + Enter is typed.
  - The file window opened on that same Enter.
  - Chromium shows the pointer again only when its own window sees the mouse move, which cannot happen while the file window is open.
  - Simulated keys, as in the automated tests, never reach Windows, which is why no test caught it.
  - Neither Electron's `disableAutoHideCursor` (macOS only), a Chromium feature switch, an app-delivered mouse event, nor Electron's own file dialog helped. A native module could show the pointer again, but is not worth a dependency.
- **Fix:** `/image` and `/file` now show a prompt in the note: "Choose an image… / Choose a file…", "or paste or drop one here", and Cancel.
  - The file window opens from the button. Moving the mouse to it shows the pointer.
  - Enter on the prompt still opens the window, for keyboard users. Escape or Cancel closes the prompt without leaving focus mode.
  - Any edit, or moving the cursor away, also closes the prompt.
- **Verified with real input on the same PC:** the pointer is visible on the button and inside the file window. There are 5 component tests, and the end-to-end workflow now uses the button and Enter.

## Release 0.6.0

All six stages are done. Profile schema v6 holds `note_links` and `attachments`, and is upgraded from the committed `profile-v5.db` fixture by a test. The release adds two build-time packages, `@tiptap/extension-table` and the already-present `@tiptap/extensions`; `npm audit --omit=dev` reports 0 vulnerabilities.

