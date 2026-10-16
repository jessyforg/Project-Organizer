# ADR-0007: TypeScript 6.0 version pin

- Status: Approved
- Date: 2026-10-17

## Context

TypeScript 7.0.2 is the latest release, but `typescript-eslint` 8.71 (latest at time of writing) declares support only for TypeScript `>=4.8.4 <6.1.0`.

## Decision

Pin TypeScript to the latest 6.0.x release with strict mode enabled.

## Reconsider when

`typescript-eslint` declares support for TypeScript 7. Upgrade in a dedicated change with full lint, typecheck, and test runs.
