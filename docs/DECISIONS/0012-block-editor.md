# ADR-0012: Block-based document editor (Phase 1 prototype)

- Status: Approved (prototype implemented on 2026-10-21 at the product owner's request; not yet used by any feature)
- Date: 2026-10-21

## Context

The product owner wants a document editor closer to Notion than the current Markdown text box with a Write/Preview switch. They want it to grow into project documentation, notes, reusable AI prompts, and code snippets. Phase 1 is an isolated prototype: a reusable component with a formatting toolbar, structured JSON output, and no saving.

Notes stay Markdown under [ADR-0009](0009-markdown-notes.md) for now. This ADR does not change how anything is stored.

## Decisions

### Library

- **Tiptap 3.31.4** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`), built on ProseMirror. All MIT-licensed. It's bundled into the renderer as a dev dependency, like the other UI libraries (ADR-0008).
  - It adds 51 packages: all MIT, none with install scripts.
  - The production dependency audit stays at 0 vulnerabilities.
- **Why 3.31.4:** 3.32.0 was eight days old when this was decided. 3.31.4 had been out for three weeks.
- **Why Tiptap:** the product owner named it in the phase brief. Its extension model suits the planned block types (prompts, snippets), and its React integration manages the editor's creation and cleanup.
- **Rejected alternative:** a custom contenteditable editor. Cursor, selection, undo, and paste handling are where hand-written editors fail.

### Scope of the prototype

- **Enabled formats:** headings 1–3, paragraphs, bold, italic, bulleted and numbered lists, blockquotes, code blocks, undo/redo, and hard breaks. StarterKit's list keymap, drop and gap cursors, and trailing paragraph are also on.
- **Turned off:**
  - **Links:** they need the same rules as note links (only `http`, `https`, `mailto`; opened in the system browser) before they are enabled.
  - **Inline code, strikethrough, underline, and horizontal rules:** outside the requested scope.
- Tiptap's own keyboard shortcuts and Markdown-style input (`# `, `- `, `> `, and three backticks) are used as they are; the app adds no editing behaviour of its own.
- **Structure:**
  - `editor-config.ts` holds the extensions and the toolbar's action list.
  - `DocumentEditor` and `EditorToolbar` only present them.
- The component's interface is `title`, `onTitleChange`, `initialContent` (Tiptap JSON, read once), `onChange(json)`, and `onReady(editor)`.

### Security

- **Content Security Policy:** the production policy is `style-src 'self'`. That policy blocks the `<style>` tag Tiptap injects by default. The editor sets `injectCSS: false`, and ProseMirror's base styles are in `editor.css`.
- **Pasted HTML** is parsed into the editor's schema, so only the enabled node and mark types survive. Elements and attributes outside the schema, such as scripts and event handlers, are dropped. No HTML is stored, because nothing is stored yet.

### Accessibility

- **Toolbar:** follows the WAI-ARIA toolbar pattern.
  - It is one Tab stop; arrow keys, Home, and End move between buttons.
  - Toggle buttons expose `aria-pressed`.
  - Undo and Redo use `aria-disabled` so they stay discoverable when unavailable.
- **Labels:** the body is a labelled multi-line textbox. The title is a separate labelled field; Enter in the title moves to the body.

### Trying it

- A development-only **Editor lab** screen shows the editor beside the JSON it reports.
- The screen and its sidebar entry exist only when `import.meta.env.DEV` is true.
- The screen is loaded with a dynamic import inside that check. A static import would have kept Tiptap in the production bundle even though the screen was unreachable (2.04 MB against 1.43 MB). Production builds therefore contain neither the screen nor Tiptap.

## Consequences

- **Storage is open:** storing JSON, converting existing Markdown notes, search indexing of rich text (FTS), and export formats are decisions for the phase that connects the editor to data. Roadmap item L6.12 (rich-text documents) is the natural home for them.
- **Renderer size:** the production JavaScript bundle is unchanged until a feature uses the editor; only the small `editor.css` is always included. It then grows by about 0.6 MB (ProseMirror and Tiptap, before compression).
- **Test setup:** jsdom has no layout, so the renderer test setup gives `Range` empty geometry for ProseMirror's scroll-into-view.
