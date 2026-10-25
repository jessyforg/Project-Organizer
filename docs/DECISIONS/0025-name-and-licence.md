# ADR-0025: Product name Katha and the MIT licence

- Status: Approved (product owner, 2026-10-26; part of 0.9.0 stage 6 on `feature/milestones-0.9`, not merged)
- Date: 2026-10-26

## Context

ADR-0002 requires the product name and `appId` to be frozen before the first public release, because they decide the data folder. The working name, ProjectForge, is already used by an established open-source project-management tool from Micromata (GPLv3, with Windows packages in the past). Releasing under it in the same category risks confusion and a trademark dispute.

The repository is public but had no licence (`UNLICENSED`), so nobody had formal permission to use the app or its code.

## Decisions

### Name: Katha

- **Chosen by the product owner.** In Filipino, *katha* means a creation or composition. A web search on 2026-10-26 found no productivity software with that name, only unrelated apps (a Sinhala speech-therapy project and a children's story app). This was not a formal trademark search.
- **What changes:**
  - `productName` `Katha`, package name `katha`, and `appId` `com.katha.desktop`;
  - so the data folder is `%APPDATA%\Katha` (development: `Katha-dev`), and the installer is `Katha Setup <version>.exe`;
  - every name the user sees: the window title, sidebar, first-run screen, About, file dialog filters, default file names, and error messages.
- **What stays, on purpose:** identifiers stored in user data and files.
  - The `projectforge://` link address in note Markdown. Changing it would mean rewriting every note body in a migration and accepting both forms indefinitely. Users see it only in the Markdown editor.
  - The format IDs `projectforge-backup`, `projectforge-export`, and `projectforge-template`, and the `.pfbackup` extension. Existing backups, exports, and templates keep working without a second accepted form.
  - The development and test variables `PROJECTFORGE_DATA_DIR` and `PROJECTFORGE_TEST_DIALOG_DIR`, which packaged builds ignore.
- **Existing ProjectForge installs:** only development and owner builds exist. The new `appId` makes Katha a separate app with its own empty data folder. The README describes moving the data: rename `%APPDATA%\ProjectForge` to `%APPDATA%\Katha`. This works because the app stores no absolute paths; profile paths are built from the data folder and the profile ID. No migration code is added.
- **Not changed:** the GitHub repository name (`Project-Organizer`), which is a GitHub setting for the owner, and the icon.

### Licence: MIT

- **Chosen by the product owner.** `LICENSE` at the repository root, with `"license": "MIT"` in `package.json`.
- Third-party licences are unchanged. The installer already ships Electron's and Chromium's licence files.

## Consequences

- The public release and the website use the name Katha.
- Old installers named ProjectForge remain only in local `release/` folders and are not published.
- If the stored identifiers are ever renamed, it needs a migration and must keep reading the old forms.
