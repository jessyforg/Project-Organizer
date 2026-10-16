# ADR-0001: Desktop framework — Electron

- Status: Approved
- Date: 2026-10-17

## Context

The product is a free, offline Windows desktop app built by a solo developer whose experience is JavaScript, React, Node.js, and SQL. It needs local SQLite storage, filesystem dialogs, notifications (later), encryption-capable storage, and a strong security boundary.

## Options considered

1. **Electron + React + TypeScript.** One language across the whole stack; mature tooling; large installer (~90–110 MB); security depends on correct configuration; native SQLite module must match Electron's ABI. MIT licence.
2. **Tauri 2 + React + Rust.** Small installer using the system WebView2; strong default capability model; all trusted logic (database, crypto, files) written in Rust, which the developer does not know; Rust toolchain not installed. MIT/Apache-2.0.
3. **.NET (WPF or WinUI 3) + C#.** Best native integration; EF Core migrations; new language and XAML UI; .NET SDK not installed. MIT.

## Decision

Electron (44.x line at the time of writing, pinned to a patch release at least two weeks old).

## Rationale

It is the only option where the developer can understand and maintain every layer immediately. The security model is well documented and its required settings are enforced by tests. Its downsides are manageable.

## Trade-offs and risks

- Larger installer and memory footprint than Tauri.
- Electron supports only the three latest major lines, so upgrades are required roughly every few months to stay supported.
- Misconfiguration risk mitigated by the checklist in [SECURITY.md](../SECURITY.md).

## Consequences

Persistence and crypto run in Node.js inside the main process. Moving to another framework later would preserve the SQLite files and the domain logic in TypeScript but require rewriting the shell.
