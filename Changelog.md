# FlappyCode — Changelog

All notable changes to this project are documented here with timestamps and task references.

---

### [Unreleased]

#### 2026-09-29T13:17:00+05:30 — Task P1-G3 (Milestone M1 Exit)
- Implemented full interactive TUI home screen with Zones A–E in `@flappycode/tui/src/app.tsx`.
- Implemented Zone A (collapsed header with project path indicator when working), Zone B (responsive pixel banner), Zone C (bulleted white and cyan taglines), Zone D (rounded cyan input box with `>_` prompt and onboarding guide), and Zone E (3-part status bar with mascot `<o)`, live provider/free model metrics, and reactive state indicators).
- Added multi-tier responsive layouts adapting to >=100, 70–99, 45–69, and <45 terminal columns.
- Added comprehensive `ink-testing-library` unit tests verifying responsive rendering and event reduction across all UI states.
- Reached and verified Milestone M1 exit criteria across the monorepo.

#### 2026-09-29T13:11:00+05:30 — Task P1-B3
- Authored 10 verified day-one provider profiles (`openrouter`, `groq`, `together`, `kilocode`, `ollama_cloud`, `google_ai_studio`, `anthropic`, `openai`, `lm_studio`, `ollama_local`) validated by Zod schema.
- Documented provider endpoints, authentication schemes, free-tier limits, and ToS data usage policies (`trains_on_data: yes|no|opt_out|unknown`) in `docs/PROVIDERS.md`.
- Flagged unverified ToS terms in `NEEDS_HUMAN_VERIFICATION`.
- Added unit tests validating profile schemas, privacy classifications, and markdown table generation.

#### 2026-09-29T13:08:00+05:30 — Task P1-F2
- Implemented `PromptComposer` enforcing deterministic section ordering: Core Preamble -> Rules -> Agent Persona -> Project Context -> Additional Instructions.
- Enforced mandatory operating rules check with typed `RulesMissingError`.
- Implemented `wrapUntrusted` with injection-resistant fences, source sanitization, and nested breakout tag escaping.
- Added comprehensive unit tests for prompt composition and untrusted boundary fencing.

#### 2026-09-29T13:05:00+05:30 — Task P1-G2
- Created pixel text assets (`assets/logo.pixels`, `assets/bird.pixels`, `assets/speedlines.pixels`).
- Implemented pixel compiler with horizontal sprite mirroring, half-block glyph rendering, and multi-tier color degradation (TrueColor, ANSI 256, ANSI 16, NO_COLOR, and ASCII).
- Implemented responsive `renderBanner` supporting full (>=100 cols with birds and speedlines), wordmark (70–99 cols), compact (45–69 cols), and minimal tiers (<45 cols).
- Added React/Ink `<Banner />` component and preview script `scripts/dev-banner.ts` (`pnpm dev:banner`).
- Added 13 unit tests for banner rendering and responsive tiers in `@flappycode/tui`.

#### 2026-09-29T13:01:00+05:30 — Task P1-D1
- Authored 8 built-in specialist agent definitions (`planner`, `coder`, `reviewer`, `tester`, `file-finder`, `executor`, `analyst`, `general`) with frontmatter metadata and markdown prompts.
- Implemented `AgentLoader` with 3-tier precedence (`built-in -> user-global -> project-local`).
- Implemented `runAgent` loop handling model streaming, tool permission gating, verbatim execution results, malformed JSON recovery, and cancellation signals.
- Added comprehensive unit tests for agent loading, overriding, and multi-step tool execution.

#### 2026-09-29T12:55:00+05:30 — Task P1-A6
- Implemented SQLite storage engine using built-in `node:sqlite` (`DatabaseSync`) with WAL mode and foreign key enforcement per `[DEC-004]`.
- Implemented cross-platform storage paths resolver supporting Windows `%LOCALAPPDATA%`, macOS, Linux, and custom environment overrides (`FLAPPYCODE_HOME`, `FLAPPYCODE_DB_PATH`).
- Implemented migration runner and `001_init.sql` schema v1 (provider, model, model_override, agent_definition, session, message, task_run, task_node, tool_call_log, usage_local, project_memory).
- Created repositories for providers, models, sessions, messages, local usage metrics, and project memory.
- Added comprehensive unit tests and verified the mandatory privacy invariant on `usage_local`.

#### 2026-09-29T12:50:00+05:30 — Task P1-A4
- Configured `tsup` bundling with `noExternal: [/^@flappycode\//]` producing self-contained executable `dist/cli.js`.
- Implemented `scripts/copy-cli-assets.mjs` for cross-platform bundling of rules and legal assets.
- Implemented complete CLI entry point with subcommands (`run`, `replay`, `rules`), flags (`--version`, `--help`, `--approve-plan`), and headless plan approval validation.
- Created `scripts/smoke-install.mjs` running end-to-end tarball creation, file inspection, isolated global prefix installation, and command validation.
- Added unit tests for CLI argument parsing and execution in `packages/cli`.

#### 2026-09-29T12:44:00+05:30 — Task P1-F1
- Authored `rules/RULES.md` universal operating ruleset and `rules/FORMAT.md` rule file specification.
- Authored 10 category rule files in `rules/categories/` covering frontend, backend, mobile, cli, library-sdk, infrastructure, data-ml, monorepo, documentation, and marketing-seo.
- Implemented `detectCategoriesSync` repository auto-detection based on project files, layouts, and dependencies.
- Implemented `RulesLoader` with strict precedence, explicit frontmatter override tracking, core protected rules (`SEC-`, `PLAN-`, `NEVER-`, `STOP-`) defense, and deterministic prompt block rendering.
- Added comprehensive unit tests covering parsing, category detection, override validation, conflict errors, and prompt rendering.

#### 2026-09-29T12:37:00+05:30 — Task P1-B2
- Implemented `OpenAICompatibleConnector` with text streaming, fragmented tool-call assembly, and usage tracking.
- Implemented honest `User-Agent: flappycode/<version>` header.
- Implemented strict secret redaction preventing raw API keys from surfacing in error messages.
- Added `scripts/dev-complete.ts` and `pnpm dev:complete` for streaming completions directly to stdout.
- Added 12 contract and integration tests with `MockOpenAIServer`.

#### 2026-09-29T12:32:00+05:30 — Task P1-G1
- Built React Ink TUI skeleton with reactive `UIStore` subscribing to engine `EventBus`.
- Implemented `replay` utility for fixture-driven UI execution.
- Created standard test fixtures: `home-ready.jsonl`, `home-empty.jsonl`, and `home-working.jsonl`.
- Added snapshot and store reducer tests with `ink-testing-library`.

#### 2026-09-29T12:28:00+05:30 — Task P1-A3
- Configured GitHub Actions matrix workflow across Windows, macOS, and Linux for Node 20 and 22.
- Added `pack-smoke` job to test packaged tarball installation on 3 operating systems.
- Added `.github/dependabot.yml` for automated weekly updates.

#### 2026-09-29T12:27:00+05:30 — Task P1-B1
- Implemented `ProviderConnector` interface, normalized LLM types (`CompletionRequest`, `CompletionChunk`, `Message`, `ToolCall`).
- Created typed provider error classes (`AuthError`, `RateLimitError`, `ServerError`, `NetworkError`, `TimeoutError`, `MalformedResponseError`, `ModelNotFoundError`, `AbortedError`) and `redactSecrets` filter.
- Created `MockProvider` driven by scenario DSL (`ok`, `okToolCall`, `rateLimit`, `http5xx`, `malformedJson`, `malformedToolCall`, `timeout`, `slowStream`, `vanishModel`, `authFail`).
- Implemented `MockOpenAIServer` on ephemeral port implementing OpenAI JSON and SSE streaming, tool calls, 429 Retry-After, and full call recording.
- Added 28 unit tests with 100% pass rate.

#### 2026-09-29T12:24:00+05:30 — Task P1-A5 (M0 Milestone)
- Implemented `@flappycode/protocol` with Zod schemas for Commands, Events, and Domain models.
- Added TaskGraph DAG validator with Kahn's algorithm cycle detection, duplicate ID detection, and dependency resolution checks.
- Implemented typed `EventBus` supporting subscriptions, typed handlers, one-time promises (`once`), and async iterator (`[Symbol.asyncIterator]`).
- Added 47 unit tests across domain, commands, events, graph, and bus modules.

#### 2026-09-29T12:20:00+05:30 — Task P1-A2
- Scaffolded pnpm monorepo with Turborepo, TypeScript strict composite base, ESLint, Prettier, and Vitest.
- Set up packages `@flappycode/protocol`, `@flappycode/storage`, `@flappycode/providers`, `@flappycode/core`, `@flappycode/tui`, and `flappycode` (`packages/cli`).
- Configured Node built-in `node:sqlite` per `[DEC-004]`.
- Verified `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass cleanly.

#### 2026-09-29T12:08:00+05:30 — Task P1-A1
- Initialised repository baseline with `.gitignore`, `.gitattributes` (LF line endings), and `.editorconfig`.
- Added provisional Apache-2.0 `LICENSE` file.
- Created `docs/DECISIONS.md` and `docs/BACKLOG.md`.
- Initialised `Context.md` and `Changelog.md`.
- Updated `README.md` to note "not yet published" status and dev quickstart.
