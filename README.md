# Project-Organizer (working name: ProjectForge)

A free, local-first Windows desktop application for organising projects, tasks, and deadlines. All data stays on your computer; no account, subscription, or internet connection is required.

## Status

**Version 0.8.0 (MVP plus notes with visual editing, slash commands, links, mentions, images and files, folders, and archiving; a command palette and quick switcher; favourites, icons, and covers; Kanban board; calendar; colour themes), not yet publicly released.** See the [changelog](CHANGELOG.md) for what it does, the [release checklist](docs/RELEASE_CHECKLIST.md) for what was verified and what remains before a public release, and the [roadmap](docs/ROADMAP.md).

## Features

- Local profiles, each in its own file, with a 30-day profile trash.
- Projects with folders, tags, colours, dates, custom workflows, archive, and calculated progress.
- Tasks with subtasks, priorities, start and due dates, tags, and dependencies.
- Today dashboard, task lists with filters, sorting, and search, and a task details panel.
- Kanban board for each project (drag and drop, or the Move button from the keyboard).
- Calendar of due dates by month, week, or day.
- Markdown notes in projects and folders, edited visually or as Markdown, with a safe preview, tags, and search. A notes library and a separate note view with focus mode. Notes can be archived, duplicated, copied, exported as `.md` files, and imported from them; right-click a note or folder for its actions.
- Colour themes: light, dark, or match Windows, with six primary colours and three background tones, all checked for readable contrast. Tags can be renamed, recoloured, and deleted in Settings.
- Trash for tasks and projects with 30-day recovery.
- Password-encrypted backups with a test restore, automatic daily copies, and JSON export.
- Light and dark themes and keyboard shortcuts (press Ctrl+/ in the app to see them).

## Installing

Run `ProjectForge Setup <version>.exe` from `release/` (or from wherever it was shared). It installs for the current user only and does not need administrator rights. The installer is not code-signed, so Windows SmartScreen may show "Windows protected your PC": choose **More info**, then **Run anyway**.

Uninstalling (Settings → Apps in Windows) removes the program but keeps your data folder, so reinstalling brings your profiles back.

## Updating to a new version

There is no automatic updater (the app never goes online). To update:

1. **Make a backup first** (recommended): in the app, Settings → Backup and restore → **Create backup…**. Keep the file somewhere outside the app's folder.
2. **Close ProjectForge.**
3. **Run the new `ProjectForge Setup <version>.exe`.** Keep the same installation folder. It replaces the program files; your data folder is not touched.
4. **Start ProjectForge.** When a profile opens, the app upgrades its data to the new format by itself. Before upgrading, it saves a verified copy in the profile's `snapshots` folder.
5. **Check the version** in Settings → About.

You cannot go back to an older version after an upgrade: older versions refuse data in a newer format, to protect it. To undo an update, install the older version and restore the backup from step 1 as a new profile.

To build the installer from the source code, run `npm ci` once, then `npm run package`. The installer appears in `release/`.

## Where your data lives

| Build                                    | Folder                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Installed app                            | `%APPDATA%\ProjectForge` (`C:\Users\<you>\AppData\Roaming\ProjectForge`) |
| Development (`npm run dev`, `npm start`) | `%APPDATA%\ProjectForge-dev`                                             |

- Each profile is a separate database: `profiles\<id>\profile.db`.
- Each profile's `snapshots` folder holds verified automatic copies: one per day for the last 7 days, plus copies made before app updates and before restores.
- Logs are in `logs\` and contain no task, note, or profile content.

**Live data is not encrypted on disk.** Anyone who can sign in to your Windows account can read it. Backups you create in Settings → Backup and restore are encrypted with a password you choose; JSON exports are not encrypted.

## If something goes wrong

- **A deleted task, note, or project:** open Trash in the sidebar and choose Restore (within 30 days).
- **A deleted profile:** Settings → Profiles → Profiles in the trash → Restore (within 30 days).
- **A profile will not open:** the start screen lists its automatic copies; choose "Restore this copy". The damaged file is kept next to it, not deleted.
- **Lost or damaged data:** Settings → Backup and restore → Restore from a backup. Use "Test restore" first if unsure; "Restore as new profile" never touches existing data.
- **Forgotten backup password:** the backup cannot be opened. Nobody, including the app, can recover it.
- **The app reports an upgrade failure:** your data was not changed; a copy made before the upgrade is in the profile's `snapshots` folder.

## Known limitations

- The installer is not code-signed (SmartScreen warning).
- Profiles cannot be password-protected yet, and live data is not encrypted (planned for a later release).
- Milestones, reminders, recurring tasks, attachments, and time tracking are planned for later releases ([requirements](docs/REQUIREMENTS.md#4-later-free-local-release)).
- Tasks can be reordered on the Kanban board; the list view's "Manual order" sort shows that order but has no reorder control of its own.
- Windows only; English only.

## Development

Prerequisites: Node.js 24, npm 11, Git. No C++ build tools are needed: the SQLite driver ships a prebuilt Windows binary.

```sh
npm ci
```

`npm ci` also downloads the Electron binary (the `postinstall` script runs `install-electron`). Dependency install scripts are restricted by the `allowScripts` list in `package.json`.

| Command            | Purpose                                                 |
| ------------------ | ------------------------------------------------------- |
| `npm run dev`      | Run the app with hot reload                             |
| `npm run build`    | Build main, preload, and renderer into `out/`           |
| `npm start`        | Run the built app                                       |
| `npm test`         | Unit, persistence, and component tests                  |
| `npm run test:e2e` | Build, then run end-to-end and accessibility tests      |
| `npm run check`    | Typecheck, lint, format check, and unit/component tests |
| `npm run package`  | Build the Windows installer into `release/`             |

If you run commands from inside an editor's extension or task runner and Electron starts as plain Node (errors such as `bad option: --remote-debugging-port`), unset `ELECTRON_RUN_AS_NODE`.

The app icon is generated by `python scripts/make-icon.py build/icon.png 512`.

## Documentation

- [Changelog](CHANGELOG.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [Requirements register](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Security and privacy](docs/SECURITY.md)
- [Testing strategy](docs/TESTING.md)
- [Roadmap](docs/ROADMAP.md)
- [Status log](docs/STATUS.md)
- [Architecture decision records](docs/DECISIONS/)
