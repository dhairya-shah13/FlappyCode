# FlappyCode — Context & State

Last updated: 2026-09-29T12:08:00+05:30 (Task P1-A1)

## Current Repository State
- **Status:** Week 1 Bootstrap (Task P1-A1 in progress).
- **Core invariant check:**
  - Engine is a library; CLI is a client.
  - Zero telemetry, local-first.
  - Secrets never leak into logs or prompts.
  - No silent paid spend.
  - Windows is a first-class supported OS.
- **Node & Package Tooling:**
  - Node: `v24.12.0` (meets `engines: ">=20"` requirement).
  - Package Manager: `pnpm@12.6.0` (pinned).
  - TypeScript: strict, ESM-only.
- **License:** Apache-2.0 (provisional per PRD OQ-5, logged in `docs/DECISIONS.md`).
- **NPM Publication:** Disabled. Package owner will claim `flappycode` post-Phase 1. Anti-publish guard to be configured in Task A4.

## How to Run
*(Scaffolding underway in Task A2)*
- Install: `pnpm install`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Test: `pnpm test`
