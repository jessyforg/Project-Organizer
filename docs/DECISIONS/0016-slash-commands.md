# ADR-0016: Slash commands in the visual editor

- Status: Approved (the product owner asked for Phase 3 "now, no need for approval, just do it and do what you recommend" on 2026-10-21; implemented the same day on a feature branch, not merged)
- Date: 2026-10-21

## Context

Phase 3 of the editor track was "basic slash commands": typing `/` in a note to insert a block, as in Notion. It was deferred after 0.4.0 and then requested. The product owner left the choices to the recommendations below.

## Decisions

### Behaviour

- **Opening the menu:** typing `/` at the start of a line or after a space opens a list of blocks.
  - More letters filter the list by name and keywords, ignoring case: `/h2`, `/todo`, `/hr`.
  - Commands whose name starts with the typed text come first.
- **Keys:**
  - ↑ and ↓ move the highlight, wrapping at the ends.
  - Enter or Tab runs the highlighted command. A click runs it too.
  - Escape closes the menu and keeps the typed text.
  - A space, or moving the cursor away, also closes it.
- **What a command does:** it removes the typed `/query` and turns the current block into the chosen one.
  - Choosing the list the block is already in keeps that list (a plain toggle would have removed it).
- **The commands:** Text, Heading 1–3, Bulleted list, Numbered list, Checklist, Quote, Code block, and Divider.
  - These are all blocks notes already store as Markdown (ADR-0013). Slash commands add no new formats, and nothing changes in storage or schema.
  - Editors without a command's extension leave the command out. The basic document set has no Checklist or Divider.
- **Where the menu stays closed:**
  - for a `/` inside a word, such as `and/or`;
  - inside a code block;
  - in read-only (archived) notes;
  - in Markdown mode, which is a plain text area.
- **No matches:** "No blocks match …" is shown. Enter then starts a new line as usual.
- **Hint:** an empty line under the cursor shows "Type / for commands", using Tiptap's Placeholder extension.
- **Turning it off:** `DocumentEditor` takes `slashCommands` (default `true`).

### Implementation

- **`@tiptap/suggestion` 3.31.4**, the first-party Tiptap utility behind mentions and slash menus.
  - It tracks the trigger and query through typing, IME composition, and cursor moves, which would be error-prone to rewrite.
  - It positions the popup with `@floating-ui/dom`, which was already installed through `@tiptap/react`.
  - `@tiptap/extensions` (Placeholder) was already installed through StarterKit; it is now declared because the app imports it.
  - Both are pinned exactly and are build-time (dev) dependencies, like the other Tiptap packages. `npm audit --omit=dev` still reports 0 vulnerabilities.
- **Files:**
  - `slash-commands.ts` holds the command list, the filter, and the extension.
  - `SlashMenu.tsx` draws the menu into a portal that the plugin positions beside the cursor. It flips above the cursor when there is no room below.
- **State outside React:** the menu's state lives in a small store read with `useSyncExternalStore`, not in React state mirrored to a ref.
  - The editor's key handler reads the store the moment a key is pressed, which can be before React re-renders.
- **Commands are listed at once:** the plugin first reports an empty "loading" list, then the items.
  - Our list needs no waiting, so it is computed straight away.
  - Otherwise "No blocks match" would flash, and an Enter pressed right after typing would start a new line instead of running the command. A component test fails without this.
- **Escape:** the menu's Escape stops propagation, so it closes only the menu and does not also leave focus mode (ADR-0015). A component test and the end-to-end test cover this.
- **Styles:** the menu uses the existing tokens, so it follows the theme and the colour palettes. Its position is set through the CSSOM, which the Content Security Policy allows; there is no `<style>` element.

### Accessibility

- **Focus:** it stays in the text while the menu is open, as in a combobox.
  - The editor body gets `aria-controls` (the list) and `aria-activedescendant` (the highlighted option).
  - The list is a `listbox` of `option`s with `aria-selected`, named "Insert a block".
  - The "no matches" message is a `status`.
- **The scrolling list is focusable (`tabIndex=0`):**
  - axe flagged the scrolling list because nothing inside it could take focus (WCAG 2.1.1).
  - It adds no Tab stop in practice: the menu exists only while open, and Tab then runs a command.
  - Options with `tabIndex=-1` did not satisfy the rule.
- **Pointer:** pressing anywhere in the menu keeps focus in the editor. Rows are at least 44 px tall on touch screens.

## Consequences

- Notes gain a keyboard-first way to add blocks without the toolbar. The toolbar and Markdown shortcuts still work.
- Two declared packages, one of them new to the install (`@tiptap/suggestion`, about 220 kB unpacked). No runtime or main-process changes, and no schema or data changes.
- Later candidates (not done): more blocks once notes can store them (tables, images); `/date` or links to tasks; grouping the list into sections.
