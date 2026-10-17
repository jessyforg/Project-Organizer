# Project-Organizer (working name: ProjectForge)

A free, local-first Windows desktop application for organising projects, tasks, and deadlines. All data stays on your computer; no account, subscription, or internet connection is required.

## Status

**Core features usable (Phase 4).** Local profiles; projects with folders, tags, custom workflows, archive, and progress; tasks with subtasks, priorities, dates, tags, and dependencies; Today dashboard, task lists with filters and sorting, global search, trash with 30-day recovery, light and dark themes, and keyboard shortcuts. Encrypted backups with restore testing, automatic daily copies, profile trash, and JSON export. See the [roadmap](docs/ROADMAP.md) and [status log](docs/STATUS.md).

## Platform

Windows 10/11 x64. Built with Electron 44, React 19, TypeScript 6, and SQLite (via `better-sqlite3-multiple-ciphers`).

## Prerequisites

- Node.js 24 and npm 11
- Git

No C++ build tools are required: the SQLite driver ships a prebuilt Windows binary.

## Setup

```sh
npm ci
```

`npm ci` also downloads the Electron binary (the `postinstall` script runs `install-electron`). Dependency install scripts are restricted by the `allowScripts` list in `package.json`.

## Commands

| Command            | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `npm run dev`      | Run the app with hot reload                      |
| `npm run build`    | Build main, preload, and renderer into `out/`    |
| `npm start`        | Run the built app                                |
| `npm test`         | Unit, persistence, and component tests           |
| `npm run test:e2e` | Build, then run end-to-end tests with Playwright |
| `npm run check`    | Typecheck, lint, format check, and unit tests    |
| `npm run package`  | Build the Windows installer into `release/`      |

If you run commands from inside an editor's extension or task runner and Electron starts as plain Node (errors such as `bad option: --remote-debugging-port`), unset `ELECTRON_RUN_AS_NODE`.

## Where your data lives

| Build                                    | Folder                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| Installed app                            | `%APPDATA%\ProjectForge` (`C:\Users\<you>\AppData\Roaming\ProjectForge`) |
| Development (`npm run dev`, `npm start`) | `%APPDATA%\ProjectForge-dev`                                             |

Each profile is a separate database in `profiles\<id>\profile.db`. Before any database upgrade, the app saves a verified copy in a `snapshots` folder. Logs are in `logs\` and contain no task, note, or profile content. Uninstalling the app does not delete this folder.

**Live data is not encrypted on disk.** Anyone who can sign in to your Windows account can read it. Backups you create in Settings → Backup and restore are encrypted with a password you choose; JSON exports are not encrypted.

The app also keeps verified automatic copies in each profile's `snapshots` folder: one per day for the last 7 days, plus copies made before app updates and before restores. If a profile cannot be opened, the start screen offers these copies.

## Known limitations

- The installer is not code-signed, so Windows SmartScreen shows a warning on first run.
- Kanban, calendar, notes, and reminders are planned for later releases.

## Documentation

- [Requirements register](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Security and privacy](docs/SECURITY.md)
- [Testing strategy](docs/TESTING.md)
- [Roadmap](docs/ROADMAP.md)
- [Status log](docs/STATUS.md)
- [Architecture decision records](docs/DECISIONS/)
