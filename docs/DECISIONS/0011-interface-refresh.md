# ADR-0011: Interface refresh and design system

- Status: Approved (done on 2026-10-20 at the product owner's request for a UI/UX modernisation; it refines ADR-0008)
- Date: 2026-10-20

## Context

The MVP interface was accessible and consistent in its tokens, but screen reviews found real problems:
- **Sidebar:** gave search, New task, every destination, and Settings the same weight. Long project names broke the sidebar's project list: it scrolled sideways and left a blank highlighted row.
- **Page headers** differed from screen to screen.
- **Filters** were tall form grids that pushed lists down.
- **Project page:** five equal buttons, with a red "Move to trash" next to everyday actions.
- **Settings and the Workflow dialog:** Settings was one long column; the Workflow dialog's rows did not line up.
- **Empty states:** plain sentences.

The request was to modernise the interface without changing features, data, or dependencies.

## Decisions

### Keep the identity, refine it

ADR-0008 still applies: plain CSS with tokens, the Atkinson Hyperlegible Next typeface, steel neutrals, temper-blue accent, and the priority heat scale. The refresh changes how these are used, not what they are.

### Tokens (`styles/tokens.css`)

- **Surfaces, from back to front:** `--bg` → `--surface` (panels, sidebar) → `--surface-raised` (menus, dialogs). Supporting tokens: `--surface-hover`, `--surface-sunken`, and `--track` (progress tracks).
- **Text:** `--ink`, `--ink-muted`, `--ink-faint`, and `--accent-text` for accent-coloured text.
- **Type and size:**
  - body text 14 px; page titles 24 px;
  - controls are 32 px high (`--control-height`).
- **Shape and depth:** radii (`--radius-sm`, `-control`, `-panel`, `-dialog`) and three shadow levels (`--shadow-sm`, `--shadow-md`, `--shadow-overlay`).
- **Motion:**
  - `--duration-fast` (120 ms) for hover and press;
  - `--duration` (180 ms) for dialogs, menus, and toasts appearing;
  - turned off entirely under "reduce motion".
- **Contrast:** checked numerically for every text colour on every surface, in both themes. The lowest is 5.1:1 in light and 4.9:1 in dark. Priority bars meet the 3:1 level for graphics. The success green was darkened to pass on its tinted badge.

### Layout patterns

- **Sidebar:** grouped by purpose.
  - Planning views: Today, My tasks, Calendar.
  - Places where work is organised: Projects, Notes.
  - The projects list.
  - A footer with Trash, Settings, and the profile.
  - The search field shows its shortcut (Ctrl K). Long names end in "…" with the full name as a tooltip.
  - The fixed shortcuts (Ctrl+1–4) are unchanged.
- **Page header** (`PageHeader`): optional breadcrumb, title, one-line description, and actions on the right. Used on every screen.
- **Panels:** lists of tasks, projects, trash entries, and notes sit on white panels over a soft background, with rows separated by thin lines. Not every item is its own card.
- **Toolbars:** search fields carry a search icon. Dropdowns keep a real `<label>`, shown inside the control's border ("Due · Any time"). This saves a row of labels without hiding what each control does.
- **Segmented controls** replace pill toggles for mutually exclusive choices: List/Board, Write/Preview, Month/Week/Day, and the theme. They stay real buttons (`aria-pressed`) or real radios. The radios stay clickable: each is an invisible input covering its label.
- **One-column grids** (pages, sections, lists) always size their column to the available width, so long titles or excerpts can never push a column past its container.
- **The window never scrolls as a whole:** the sidebar, page, and details panel scroll on their own, and contain their absolutely positioned helpers.
- **Smaller windows:**
  - below 1,100 px wide, the sidebar narrows;
  - below about 720 px of page width, page padding tightens;
  - the dashboard, notes, and project summary stack;
  - wide content (board, calendar) scrolls inside its own area.

### Components (`components/ui.tsx`)

- `PageHeader`, as above.
- `EmptyState`: icon, what the emptiness means, and the next useful action.
- `MenuButton`: implements the WAI-ARIA menu-button pattern.
  - Enter, Space, or Arrow Down opens it on the first item; arrows, Home, and End move between items.
  - Escape closes it and returns focus to the button; Tab or a click elsewhere closes it.
  - Destructive items are red and separated from the others. Unit-tested.
- `Dialog` gains a wide variant; every dialog has a footer bar for its buttons.

### Screen changes

- **Project page:** Edit and Workflow stay visible. Mark completed / Reopen, Archive / Unarchive, and Move to trash move into "More project actions". An archived project's notice has its own "Unarchive" button. Facts and progress sit in one summary panel, with a breadcrumb back to Projects.
- **Projects:** folder actions are in a menu. Rows show the description, badges, progress, and target date.
- **Settings:** grouped cards (Appearance, Profiles, Backup and restore, Keyboard shortcuts, About). Removing the current profile is a clearly labelled row with an outlined danger button.
- **Workflow dialog:** aligned rows with category and default badges, and icon buttons with tooltips and accessible names.
- **First run:** a centred card with the brand mark, the create-profile form, "or restore from a backup", and a plain statement that data stays on this computer.

### Not changed

- No features were added or removed.
- No data formats, IPC channels, or business rules were touched.
- No dependencies were added. Icons still come from lucide-react; the hammer mark is a lucide icon, not a new asset.

## Consequences

- **Tests:** one end-to-end step changed, because Archive is now inside the menu. One unit-test assertion changed, because the dashboard summary uses "·" instead of commas. The accessibility scan passes on every screen in both themes.
- **Known limitation:** form-field borders are about 1.6:1 against white. That is a little stronger than before, but below the 3:1 WCAG 2.1 guideline for component boundaries. Labels, placeholders, and focus rings identify the fields, and the axe scan does not flag it. Darker borders are the remedy if this proves a problem.
