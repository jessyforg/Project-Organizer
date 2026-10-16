# Project-Organizer (working name: ProjectForge)

A free, local-first Windows desktop application for organising projects, tasks, and deadlines. All data stays on your computer; no account, subscription, or internet connection is required.

## Status

**Foundation (Phase 2).** The app launches, creates and switches local profiles, and has its security boundary, database migrations, and tests in place. Projects and tasks are not implemented yet. See the [roadmap](docs/ROADMAP.md) and [status log](docs/STATUS.md).

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
| `npm test`         | Unit and persistence tests                       |
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

**Data is not encrypted on disk.** Anyone who can sign in to your Windows account can read it. Password-encrypted exported backups are planned for Phase 5.

## Known limitations

- The installer is not code-signed, so Windows SmartScreen shows a warning on first run.
- Only profile management is available so far.

## Documentation

- [Requirements register](docs/REQUIREMENTS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Security and privacy](docs/SECURITY.md)
- [Testing strategy](docs/TESTING.md)
- [Roadmap](docs/ROADMAP.md)
- [Status log](docs/STATUS.md)
- [Architecture decision records](docs/DECISIONS/)
