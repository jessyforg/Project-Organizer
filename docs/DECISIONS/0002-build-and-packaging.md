# ADR-0002: Build and packaging — electron-vite + electron-builder

- Status: Approved
- Date: 2026-10-17

## Context

We need a development server with hot reload for the renderer, separate builds for main/preload/renderer, correct handling of a native module, and a Windows installer.

## Options considered

1. **electron-vite + electron-builder (NSIS).** electron-vite builds all three targets with Vite 8; electron-builder has explicit `asarUnpack` for native `.node` files and supports Electron fuses configuration.
2. **Electron Forge + Vite plugin.** Official tooling; its Vite plugin has historically had rougher native-module handling.

## Decision

electron-vite for development and builds; electron-builder producing an NSIS installer.

## Trade-offs and risks

- Two tools instead of one integrated toolchain.
- Installer is unsigned; Windows SmartScreen will warn on first run. Paid signing is excluded by the no-cost constraint. Free open-source signing programmes may be evaluated if the repository becomes public.
- No auto-updater (no network features). Upgrades are manual installs of a newer version.

## Name and identity freeze

The product name, `appId`, and data folder name (`%APPDATA%\ProjectForge`) are defined in one configuration location. They may change freely **until the first release**. After release, changing them would make existing user data appear to vanish, so any rename must include a data-folder migration.

## Phase 2 implementation notes (2026-10-17)

- Versions: electron-vite 5.0.0 with **Vite 7.3.6**. electron-vite 6 (Vite 8 support) was released 2026-10-14, too recent for the two-week age rule; revisit after it matures.
- electron-builder 26.15.3 (`latest` tag). Installer: `release/ProjectForge Setup <version>.exe`, NSIS, per-user, ~113 MB.
- Electron 44 no longer downloads its binary during `npm install`; the `postinstall` script runs `install-electron`.
- Fuses verified on the packaged executable: RunAsNode, NODE_OPTIONS, and CLI inspect arguments disabled; ASAR integrity validation, OnlyLoadAppFromAsar, and cookie encryption enabled; file-protocol extra privileges disabled.
- `npm audit`: 0 vulnerabilities in production dependencies. 8 moderate findings in build tooling all trace to one `sprintf-js` advisory (GHSA-hp3w-g68c-fv3c) via electron-builder's download proxy support; build-time only, not reachable by user input. npm's suggested fix is a downgrade, so it is not applied. Re-check at each checkpoint.
