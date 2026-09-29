# FlappyCode — Context & State

Last updated: 2026-09-29T12:24:00+05:30 (Task P1-A5)

## Current Repository State
- **Status:** Protocol package complete (Task P1-A5 **M0 Milestone** complete, moving to P1-B1).
- **Core invariant check:**
  - Engine is a library; CLI is a client.
  - Zero telemetry, local-first.
  - Secrets never leak into logs or prompts.
  - No silent paid spend (`TierSchema` and `FREE_TIERS` set typed and guarded).
  - Windows is a first-class supported OS.
- **Protocol Package Delivered (`@flappycode/protocol`):**
  - Domain schemas: `Tier`, `FREE_TIERS`, `Model`, `ProviderConfig`, `AgentDefinition`, `TaskNode`, `TaskGraph`, `Config`.
  - Commands: `CommandSchema` discriminated union (11 command types).
  - Events: `FlappyEventSchema` discriminated union (16 event types).
  - TaskGraph validator: acyclic DAG verification via Kahn's algorithm, unique node IDs, valid dependency references.
  - EventBus: in-process typed bus with pub/sub, `onType`, `once` (with timeout), and `[Symbol.asyncIterator]`.
  - Tests: 47 unit tests covering valid/invalid fixtures, cycle detection, and event distribution.
- **Node & Package Tooling:**
  - Node: `v24.12.0` (meets `engines: ">=20"` requirement).
  - Package Manager: `pnpm@12.6.0` (pinned via `packageManager`).
  - Turborepo: `v2.11.5` managing build/typecheck/lint/test pipelines.
  - TypeScript: strict, ESM-only, composite references with `tsconfig.base.json`.
  - SQLite: Node.js built-in `node:sqlite` (DatabaseSync) per `[DEC-004]`.
- **Packages Scaffolded:**
  - `@flappycode/protocol`
  - `@flappycode/storage`
  - `@flappycode/providers`
  - `@flappycode/core`
  - `@flappycode/tui`
  - `flappycode` (`packages/cli`)
- **License:** Apache-2.0 (provisional per PRD OQ-5, logged in `docs/DECISIONS.md`).
- **NPM Publication:** Disabled. Package owner will claim `flappycode` post-Phase 1. Anti-publish guard in `scripts/block-publish.mjs`.

## How to Run
- Install: `pnpm install`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint`
- Test: `pnpm test`
