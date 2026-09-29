# FlappyCode — Context & State

Last updated: 2026-09-29T12:28:00+05:30 (Task P1-A3)

## Current Repository State
- **Status:** CI Matrix & Dependabot configured (Task P1-A3 complete, moving to P1-G1).
- **CI Configuration:**
  - Matrix across `{ubuntu-latest, macos-latest, windows-latest} × Node {20, 22}` running frozen-lockfile install, lint, typecheck, tests, and build.
  - Smoke install job placeholder (`pack-smoke`) on 3 operating systems.
  - Dependabot configured for weekly npm and github-actions updates.
  - Note: Full GitHub Actions run results will be executed and confirmed upon remote push.
- **Core invariant check:**
  - Engine is a library; CLI is a client.
  - Zero telemetry, local-first.
  - Secrets never leak into logs or prompts (`redactSecrets` verified, Bearer and key formats scrubbed).
  - No silent paid spend.
  - Windows is a first-class supported OS.
- **Providers Foundation Delivered (`@flappycode/providers`):**
  - `ProviderConnector` interface: `authenticate`, `listModels`, `complete`, `getQuota`, `healthCheck`.
  - Normalized types: `CompletionRequest`, `CompletionChunk` discriminated union, `Message`, `ToolCall`, `ToolDefinition`, `RawModel`, `QuotaInfo`, `HealthInfo`.
  - Typed errors with stable codes and actionable messages: `AuthError`, `RateLimitError`, `ServerError`, `NetworkError`, `TimeoutError`, `MalformedResponseError`, `ModelNotFoundError`, `AbortedError`.
  - `MockProvider`: driven by scenario DSL (`ok`, `okToolCall`, `rateLimit`, `http5xx`, `malformedJson`, `malformedToolCall`, `timeout`, `slowStream`, `vanishModel`, `authFail`).
  - `MockOpenAIServer`: local `node:http` server on ephemeral port serving OpenAI-compatible wire protocol (JSON + SSE stream, tool calls, 429 Retry-After, 500), with request headers and body recording.
  - Tests: 28 unit tests covering error classes, redaction, mock scenarios, and HTTP wire contracts.
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
