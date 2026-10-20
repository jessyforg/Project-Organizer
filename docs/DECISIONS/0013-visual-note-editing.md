# ADR-0013: Visual editing of Markdown notes

- Status: Approved (the product owner approved the plan and its recommended options on 2026-10-21; implemented the same day)
- Date: 2026-10-21

## Context

The product owner wants Notes to edit like a document editor instead of a Markdown text box with Write and Preview. The phase brief set the constraints:
- Markdown stays the stored format, as text in SQLite.
- Metadata stays in its columns.
- The IPC and service layers stay as they are.
- Saving must stay reliable.

The prototype editor from [ADR-0012](0012-block-editor.md) is the editing surface. [ADR-0009](0009-markdown-notes.md) still governs storage, rendering of the Markdown preview, and saving.

The main risk is silent data loss. Every save converts the note from Markdown to the editor's document and back. Anything the editor cannot represent, such as a table, would vanish on the next autosave.

## Decisions

### Storage and saving: unchanged

- `notes.body` stays Markdown. No migration, IPC channel, or service change was needed. Search, backup, and JSON export keep working on the same text.
- Autosave (0.8 s), Ctrl+S, the leave guard, and the window-close guard are unchanged. In visual mode an edit only marks the body as changed. The document is converted to Markdown when a save runs, so long notes are not converted on every keystroke.
- Opening a note never saves it. A note's Markdown can be spelled differently from what the editor would write (for example `*` bullets instead of `-`). The stored text changes only after the user edits.

### Conversion

- **Library:** `@tiptap/markdown` 3.31.4, Tiptap's official converter. It parses Markdown with `marked` 17.0.6. Both are MIT-licensed, without install scripts, and add 2 packages.
- **Supported in notes** (`noteExtensions`):
  - headings 1–6 (the toolbar offers 1–3);
  - bold, italic, strikethrough, and inline code;
  - bulleted, numbered, and task lists, nested;
  - quotes, code blocks, dividers, hard breaks, and links.
- **Not supported:** underline is off because Markdown has no syntax for it.
- **Saved text:** typed Markdown characters are escaped (`\*`), so they stay literal. Trailing blank lines are dropped. They come from the empty paragraph the editor keeps at the end of every document, and the editor adds that paragraph back when the note opens.

### Safety check before visual editing

- When a note opens, `fromMarkdown` checks it before showing it visually:
  1. It parses the text and validates the result against the editor's schema.
  2. It converts the result back to Markdown.
  3. It compares both texts as Markdown syntax trees, using `remark-parse` and `remark-gfm`, the parser the preview already uses. Source positions and list looseness are ignored.
- If anything differs, the note opens in **Markdown mode** with a notice, and its text is not touched. This applies to:
  - tables and images (product owner's choice: no table editing yet);
  - raw HTML;
  - reference-style links.
- The same check runs when switching from Markdown mode to Visual. If it fails, the note stays in Markdown mode.
- `remark-parse` and `unified` became direct dev dependencies at the versions `react-markdown` already installed, so no packages were added.

### Modes

- **Visual** is the default when the check passes.
- **Markdown** is the previous text box. Write and Preview now live only inside it (product owner's choice); the visual editor already shows formatting.
- Switching modes carries unsaved text across.

### Links

- The editor keeps every link in the Markdown, so nothing is lost.
- A link is a usable `href` only for `http`, `https`, and `mailto`. Tiptap renders any other address with an empty `href`, so it cannot be followed. This matches the preview's rule.
- Ctrl+click opens an allowed link through `window.open`. The main process's window-open handler checks the address again and opens it in the system browser.
- Plain clicks place the cursor, as in other editors.

### Component changes (ADR-0012)

- `DocumentEditor` gained optional `extensions`, `onEdit` (a cheap per-change callback), `label`, and `className`.
- Its title field is shown only when `onTitleChange` is given; the note keeps its own title row with the save state.
- The toolbar hides actions whose extension is not loaded.
- New toolbar actions: strikethrough, inline code, and checklist.

## Consequences

- **Bundle size:** the production renderer now includes Tiptap, ProseMirror, and `marked`. The JavaScript bundle grew from 1.43 MB to 2.42 MB uncompressed. It is loaded from disk, so the cost is startup parsing, not download.
- **Visible escapes:** text like `snake_case` written in visual mode is stored as `snake\_case`. It renders the same, but the backslash is visible in Markdown mode.
- **Tables and images:** notes with tables or images are edited as Markdown until those get editor support. That would be a later decision, with roadmap item L6.12.
- **Test setup:** renderer tests give jsdom stand-ins for `Range` geometry and `document.elementFromPoint`, which ProseMirror needs.
