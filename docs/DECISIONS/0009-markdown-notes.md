# ADR-0009: Markdown notes — storage, rendering, and saving

- Status: Approved (implemented on 2026-10-20; the product owner accepted these choices the same day). Notes are edited visually since [ADR-0013](0013-visual-note-editing.md), and have their own folders since [ADR-0014](0014-note-actions-import-and-folders.md); storage, the preview's rendering rules, and saving here still apply.
- Date: 2026-10-20

## Context

Notes are the first item of the next feature work ([ROADMAP.md](../ROADMAP.md#after-the-mvp)). The register asks for Markdown notes per project with a safe preview, no raw HTML, and an unsaved-change guard (R26), and a document list with search, tags, and simple folders (L1.5). Notes are user content shown inside a privileged desktop app, so rendering is a security boundary, and the app must never contact a server.

## Decisions

### Storage

- Profile schema v3 adds `notes`, `note_tags`, and `notes_fts` ([DATA_MODEL.md](../DATA_MODEL.md)). The body is stored as the Markdown the user typed; HTML is never stored.
- **Every note belongs to a project.** Notes created without one go to the Inbox, as tasks do (C12). **The project is the note's folder.** No separate note-folder table was added; this is a simplification of L1.5's "simple folders" for the product owner to confirm or reject.
- Notes use the same trash model as tasks: their own deletion batch, or the project's batch when the project is trashed. They are included in search, encrypted backups (counted in the manifest), and JSON exports.

### Rendering

- `react-markdown` 10.1.0 with `remark-gfm` 4.0.1 (tables, task lists, strikethrough, autolinks). Both are MIT-licensed, have no install scripts, were published in early 2025, and are bundled into the renderer as dev dependencies, like the other UI libraries (ADR-0008). Together they add 95 packages (94 MIT, 1 ISC), none with install scripts.
- **No raw-HTML plugin** (`rehype-raw` is not used). `react-markdown` then shows HTML as text, so a `<script>` or `onerror` attribute in a note can never become an element. The Content Security Policy remains a second barrier.
- **Links:** only `http`, `https`, and `mailto` become links. They open in the system browser through the existing window-open handler, which checks the same list. Anything else (including `javascript:` and `file:`) renders as inert text.
- **Images are never loaded.** Fetching a remote image would contact a server, which could track the user, so the preview shows "[Image not shown: alt text]". Local images may come later with attachments (L5.4).
- Rejected alternative: writing a Markdown parser, or using `marked` plus an HTML sanitiser. Producing HTML and then cleaning it is a larger attack surface than never producing HTML.

### Saving

- **Autosave:** the note saves 0.8 s after typing pauses, and Ctrl+S saves immediately. Explicit-save-only editing was rejected because forgetting to save loses data, and data safety comes first.
- **Unsaved-change guard (R26):**
  - Leaving the screen first waits for the save. If saving fails, a dialog asks before discarding.
  - Closing the window holds the close (`beforeunload`) while the save runs. The main process retries the close once after one second. If the page still holds it, the save has failed, and a native dialog offers "Keep editing" or "Close without saving".
- A blank title is saved as "Untitled note" rather than rejected, so a save never fails on the title.

## Consequences

- One more full-text table makes database files larger. A damaged backup could then fail with a raw SQLite error during validation. Backup validation now reports any unexpected SQLite error as "wrong password or damaged file". The existing corrupted-file test found this.
- When notes gain version history (L5.1) or rich text (L6.12), the storage and rendering rules here are their starting point.
