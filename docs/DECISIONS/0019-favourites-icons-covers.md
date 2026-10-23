# ADR-0019: Favourites, icons, and covers (0.8.0, schema v7)

- Status: Approved (the product owner said "continue to 0.8.0" on 2026-10-23, after approving the plan in `docs/plans/2026-10-21-next-features-plan.md`; built on a feature branch, not merged)
- Date: 2026-10-23

## Context

Release 0.8.0 of the plan, "Personal organisation", holds #11 favourites and #12 icons and covers. Both need new stored data, so they share one schema upgrade, v7. The plan lists the acceptance criteria, and this ADR records how they are met. It was built in three stages on one branch: (1) the schema and favourites, (2) icons, and (3) covers.

## Decisions

### Schema v7, one forward-only migration

- **`favourites`:**
  - Columns: `id`, `project_id` and `note_id` (exactly one is set, enforced by a `CHECK`), `sort_key`, and `created_at`.
  - Each item can be starred once (a partial unique index per column).
  - The foreign keys use `ON DELETE CASCADE`, so a permanently deleted item loses its star with it.
  - Milestones (0.9.0) will add a third column in their own migration.
- **`icon` and `cover` columns** on `projects` and `notes`. Both are nullable text, and null means the default look.
- **Backups and export:** `favourites` is added to the backup manifest's counted tables and to the JSON export. The new columns travel with their rows.
- **Fixture:** a committed `profile-v6.db` (with a link and an attachment), plus an upgrade test. From now on, the generator builds only fixture files that do not exist yet, so older committed files are never rewritten.

### Favourites

- **Trash and archive:**
  - A trashed item, or a note whose project is trashed, keeps its row but is left out of the list. Restoring it brings the star back (criterion 3), with no bookkeeping.
  - Archived items stay listed, with an "Archived" badge.
- **Service:** `FavouriteService` provides `list`, `set({ kind, id, starred })`, and `reorder({ ids })`.
  - `reorder`, like folders, takes the complete new order of the listed favourites, and refuses a partial or unknown list.
  - Starring an item that is trashed or missing is refused. Unstarring something not starred does nothing.
- **Where to star** (criterion 1): "Add to favourites" or "Remove from favourites" appears in:
  - the note ⋯ menu and right-click menu on note rows;
  - the project ⋯ menu;
  - a new right-click menu on project rows in the sidebar and on the Projects page;
  - the palette, through the ⋯ items it already shows.
- **The sidebar section** (criterion 2):
  - "Favourites" appears below New task once anything is starred.
  - Each row shows the item's icon and title, plus an "Archived" badge when it applies.
  - **Reordering by mouse:** drag and drop.
  - **Reordering by keyboard:** each row's right-click menu (also Shift+F10) has Move up and Move down. The roving-menu pattern already exists, so no new key bindings are needed.
- **Lists:** projects and notes report `favourite: true` or `false`, so menus show the right label.

### Icons

- **The built-in set:** 60 icons in `src/shared/icons.ts`, 30 emoji and 30 lucide icons. They are stored as `emoji:🚀` or `lucide:rocket`.
  - The service accepts only listed values (zod enum), and nothing is fetched from the network (criterion 1).
  - Emoji are drawn with the system font, and lucide icons with the installed `lucide-react`.
- **Where an icon is shown:**
  - in the sidebar (favourites and projects);
  - in the projects list and note lists;
  - in palette results;
  - in the project page header and above a note's title.
  - Without an icon, projects keep their colour swatch and notes show nothing.
- **The picker:** a dialog with a grid of buttons (Tab moves to the grid, then arrow keys move inside it), each with an accessible name such as "Rocket", plus "Remove icon" (criterion 3).

### Covers

- **Presets:** 16 presets in `src/shared/covers.ts`, stored as `preset:<name>`.
  - 10 plain colours, one for each existing colour token.
  - 6 two-colour gradients built from the same tokens.
  - The renderer draws them by mixing the token with the theme's surface colour, so they look softer in light mode and are dimmed in dark mode.
- **Image covers:** stored as `image:<attachment id>`.
  - **Storage:** they reuse the 0.6.0 attachment store, with its 20 MB and 1 GB limits, contents-based image detection, and the free-space check. `AttachmentService.addCover` accepts images only.
  - **Projects:** a project's cover image has no note, so `note_id` is null.
  - **Clean-up:** it now also counts attachments named by a cover as in use, so a cover is never removed while set. A replaced or removed cover image becomes unused and is removed after 30 days, like other files.
- **Readability (criterion 2):**
  - **The planned contrast test is replaced by a layout rule:** nothing is drawn on a cover except the icon, which sits on its own tile with the surface colour and a border. Text contrast therefore never depends on a cover.
  - The axe scans run with a cover shown, in both themes.
  - Covers are decorative (`aria-hidden`), and a cover image has no description to give.
- **Removing:** "Remove cover" in the cover picker (criterion 3).

### Editing rules

- **Archived notes** are read-only (ADR-0015), so their icon and cover cannot change. Their controls are hidden, and the service refuses with "Unarchive the note first". Archived projects can still be edited, as before.
- **Trashed items** cannot be changed.
- **Channels, all checked with zod:**
  - `favourites:list`, `favourites:set`, `favourites:reorder`;
  - `looks:setIcon` and `looks:setCover`, each taking `{ kind, id, value | null }`;
  - `looks:addCoverImage`, taking `{ kind, id, name, data }` and returning the new cover value.

## Consequences

- **Upgrade:** profiles move from schema v6 to v7 after a verified snapshot. Older app versions cannot open a v7 profile, as with earlier upgrades.
- **Content Security Policy:** unchanged. Cover images use the same `blob:` URLs as note images.
- **Dependencies:** none new. Emoji need no font file.
- **Tests:** test helpers that build `Project` and `NoteSummary` objects gain the new fields.
