# FlappyCode — System Context & Architecture Record

## Overview
FlappyCode is a developer-centric CLI tool, local loopback daemon, and multi-agent coding engine designed to aggregate and orchestrate free model quotas across providers (OpenRouter, Groq, Ollama, LM Studio, Together, Google AI Studio, Anthropic, and OpenAI). It guarantees a zero-paid baseline: paid models are strictly locked and never called unless explicitly authorized via a user-pinned model binding or through the interactive pool exhaustion flow (`PaidGrant`).

## Architectural Components

### 1. Unified Protocol (`@flappycode/protocol`)
- Zod schemas and TypeScript types defining models, tasks, DAG task nodes, tool call records, events, commands, configurations, and permissions.
- Zero-drift type system shared across storage, core orchestration, loopback daemon, CLI, and TUI.

### 2. SQLite Storage & Hybrid Secret Store (`@flappycode/storage`)
- SQLite database with write-ahead logging (WAL mode enabled), foreign key enforcement, and automatic schema migrations.
- Universal SQLite engine supporting both `better-sqlite3` and Node.js built-in `node:sqlite` (`DatabaseSync` in Node 22/24) with diagnostic fallback.
- Hybrid secret store: primary OS credential vault via `@napi-rs/keyring` (Windows Credential Manager / macOS Keychain / Secret Service) with AES-256-GCM encrypted filesystem fallback when OS keychain is headless or unavailable.
- Typed DAOs: `ProviderRepository`, `ModelRepository`, `SessionRepository`, `TaskRepository`, `AuditRepository`, `UsageRepository`.

### 3. Universal Provider Connectors (`@flappycode/providers`)
- Connector interface (`ProviderConnector`) for streaming chat completions, model discovery, authentication, quota detection, and health probes.
- Connectors:
  - `OpenAICompatibleConnector` (OpenRouter, Groq, Together, LM Studio, etc.)
  - `OllamaConnector` (native local Ollama HTTP API)
  - `AnthropicConnector` (Anthropic Messages API)
  - `GoogleConnector` (Google Gemini AI Studio API)
  - `MockProviderConnector` (scriptable chaos testing harness for rate-limiting, 429 countdowns, 5xx retries, quota exhaustion, and canned flows).
- Pre-configured profiles with free classifier rules and privacy data use policies.

### 4. Core Orchestration Engine (`@flappycode/core`)
- **Event Bus (`FlappyEventBus`)**: Decoupled typed event publishing for run lifecycle, DAG progress, model routing, diff review, and audit logs.
- **Model Classifier (`ModelClassifier`)**: Deterministic 5-tier classification precedence:
  1. User Override (`ModelOverride`)
  2. Community Catalog Override (`community-models.json`)
  3. Provider Pricing Metadata (explicit 0 in/out)
  4. Provider-Specific Rules (e.g. Groq free models, Ollama isLocal, Google flash free quotas)
  5. Fallback: Default to paid-until-proven (`source: metadata / rule`)
- **Deterministic Router (`DeterministicRouter`)**: Scores and selects optimal free models based on declared task affinity (Coder, Reviewer, Tester, Planner), latency, error history, context window, and data privacy policy. Enforces same-model reviewer penalty (-50).
- **Zero-Paid Safety Gate (`PaidGate`)**: Hard architectural barrier. Returns `exhausted: true` when free models are unavailable. Zero paid calls occur unless a cryptographically signed `PaidGrant` is explicitly issued by the user.
- **PlanGate (`PlanGate`) & Cryptographic PlanToken**: Filesystem writes and shell mutations are strictly blocked unless an approved `PlanToken` exists matching the active `runId` and authorized file paths.
- **Root-Jailed Filesystem Tools (`FsJail`)**: Path canonicalization rejecting any directory traversal (`..`, symlink escapes, or paths outside project root).
- **Diff & Undo Engine (`DiffEngine`, `UndoEngine`)**: Structured unified diffs with hunk inspection. Reversible undo snapshots allowing single-command `/undo` rollback of file modifications and deletion of newly created files.
- **Security & Redaction (`SecretGuard`, `PermissionEngine`)**: Auto-redacts API keys, bearer tokens, and credentials in logs and console output. Enforces allow, deny, and mandatory confirmation policies on shell commands.
- **Multi-Agent Orchestrator (`FlappyAutoOrchestrator`, `DagExecutor`)**: Orchestrates specialized built-in agents (`Planner`, `File-Finder`, `Coder`, `Tester`, `Reviewer`, `Command-Executor`, `Codebase-Analyst`) across sequential and parallel dependency DAGs.

### 5. Local Daemon Loopback Server (`@flappycode/server`)
- Loopback-only HTTP server strictly bound to `127.0.0.1` (rejects `0.0.0.0` or public interfaces).
- Per-launch random Bearer token authentication.
- CORS disabled by default.
- Real-time Server-Sent Events (SSE) stream (`/v1/events`) and command submission endpoint (`/v1/commands`).
- Public `/health` check and OpenAPI 3.0 specification (`/openapi.json`).

### 6. Terminal User Interface (`@flappycode/tui`)
- Rich retro terminal aesthetics: ASCII/Unicode responsive banners (compact bird, pixel block wordmark, full flying bird with speed lines).
- Interactive screens: `HomeScreen` (with `renderLayout` computing exact in-box terminal cursor coordinates and closed rounded box padding), `OnboardingWizardScreen`, `ModelPickerScreen`, `PlanApprovalScreen`, `DiffReviewScreen`, `PoolExhaustedScreen`.
- Universal `Palette` with automatic ASCII fallback when `NO_COLOR` is detected or non-TTY terminal is used.

### 6.1 Stage B — Provider Reliability & Model Routing (fully implemented & verified)
- `FallbackExecutor` (`packages/core/src/orchestration/fallback-executor.ts`) wraps all connector calls with exponential backoff + jitter + `Retry-After` honoring, then iterates the router's ranked candidates (`excludeModelIds`) — transparent substitution on busy/429/5xx/timeout/quota/disappearance. Every real swap emits `model.substituted` and appends to `node.substitutions`; `recordModelError`/cooldowns are populated from the execution path.
- Pool exhaustion pauses the run (`paused_pool_exhausted`), emits `approval.requested{kind:'pool_exhausted'}` with exactly two actions (`authorize_paid` requiring explicit confirm before any `PaidGrant`, `add_free_provider`), and `FlappyEngine.resolvePoolExhausted()` resumes it honestly. Surfaced in interactive TUI/CLI via `PoolExhaustedScreen` and in `/v1/commands` (409 on error/invalid, 200 on success).
- `IntervalScheduler` (`registry/scheduler.ts`) revalidates the registry every `revalidate_every_hours` (default 6) and stops cleanly on `engine.close()`.
- User model tier overrides (`GAP-006`): `flappycode models tag <model> <free|paid|disabled>` and `flappycode models untag <model>` CLI commands; TUI `ModelPickerScreen` displays `[override]` and handles disabled models; server command endpoint `/v1/commands` supports `setModelOverride` and `deleteModelOverride`.
- Router honors per-agent `fallbackPolicy`: unavailable pinned model returns `needsUserDecision` (default `ask_user` → `question.asked`), never a silent re-route.
- `ProviderRateLimiter` (token bucket, FR-PRV-008) throttles outbound calls per provider; authenticated-before-discover on `providers add` (FR-PRV-002); data-use policy sourced from bundled profiles (FR-PRV-006).
- Connectors & Profiles (`GAP-034/035/036`): Ollama Cloud profile (`https://ollama.com`, Bearer auth, 30 RPM, `rate_limited_free`); Anthropic & Google bidirectional tool-call normalization with request mapping, SSE `tool_use`/`functionCall` delta parser, and tool-result round trip; honest `User-Agent: flappycode/<version>` header across all outbound provider requests.

### 6.2 Stage C — Multi-Agent Orchestration (fully implemented & verified)
- **Single-Model Mode (`GAP-007`)**: When `--model <id>` (where id ≠ 'flappyauto') is passed, `FlappyAutoOrchestrator` skips multi-agent planning and constructs a single direct Coder node bound to the specified model. All PlanGate write constraints, permission checks, and safety rules remain strictly active. Wired into CLI `run --model <id>` and interactive TUI.
- **Declarative Agent Definitions (`GAP-008`)**: Loaded from `.flappycode/agents/*.yaml|json`, schema-validated via `AgentDefinitionSchema`, and merged with built-in agent definitions. Custom prompts, allowed tools, preferred models, and fallback policies are injected into the planner prompt and respected during node dispatch. Surfaced in CLI via `flappycode agents list` and `/agents` slash command.
- **Reviewer/Tester Feedback Loop (`GAP-009`)**: Multi-turn feedback cycle between Reviewer/Tester and Coder bounded by `max_iterations` (default 3). Emits `feedback.iteration` events with iteration index and feedback text. When verdicts fail (`VERDICT: FAIL: <reasons>`), feedback is appended to task requirements and sent back to Coder while preserving already-completed nodes.
- **Bounded DAG Concurrency (`GAP-013`)**: Fixed off-by-one over-admission in `DagExecutor`. Computes exact available slots (`maxConcurrency - running.size`) and schedules ready independent nodes concurrently while strictly enforcing sequential dependencies.
- **Run Cancellation & Exit 130 (`GAP-012`)**: Run cancellation via SIGINT / Esc triggers `engine.cancel(runId)` / `executor.cancel()`. Aborts running tasks via `AbortController`, marks pending and in-flight nodes as `cancelled`, and emits `run.cancelled` event with exit code 130.
- **Sessions, Compaction & Project Memory (`GAP-025/026/054`)**: `SessionRepository` stores session metadata and message history; `ProjectMemoryRepository` persists cross-run architectural facts in `.flappycode/memory.json` / SQLite. `ContextManager` applies role-based slicing (giving Coder write contexts, Reviewer diff contexts) and compacts old turns while preserving project memory. Added CLI commands `sessions list`, `sessions resume <id>`, `sessions delete <id>`, and `/sessions` slash command.
- **Planner Repair & Model Fallback (`GAP-046`)**: Structured `PlannerOutputError` captures invalid plan JSON, emits `planner.failed` event, and triggers FallbackExecutor candidate iteration excluding the failing model.
- **Agent Search Tool Scope (`GAP-019`)**: Added `search` tool to `allowed_tools` for Coder, Codebase-Analyst, and File-Finder. Strictly forbidden for Reviewer, Command-Executor, and Tester.
- **Phase 1 TUI Screens (`P1-G8/G9/G10`, `GAP-027`, `GAP-048`)**: Implemented `TaskGraphScreen` (reactive ASCII/Unicode DAG with state machine and 60/80/120 column responsiveness) and `QuestionPromptScreen` (clarifying question prompt with options and custom answers); fully wired `PlanApprovalScreen`, `DiffReviewScreen`, `PermissionPromptScreen`, and `PoolExhaustedScreen`.

### 6.3 Stage D — Rules & Product Interaction (fully implemented & verified)
- **Universal Rules Bundling & Conflict Detection (`GAP-018`)**: Packaged baseline `RULES.md` into `@flappycode/cli` and `@flappycode/core` assets; hierarchical resolution (`Universal -> Category -> Project -> Nested Scoped`); structural conflict detection that flags attempts to bypass PlanGate, permissions, or secret safety without false-positive penalties on valid precedence overrides. Emits `rule.conflict_detected`.
- **Clarifying Questions Flow (`GAP-048`)**: Implemented `ask_question` tool, lifecycle events `question.asked` and `question.answered`, interactive `QuestionPromptScreen` (width-adaptive 60/80/120 columns with word-wrapping and multi-choice numbered options or free text), user question routing via `FlappyEngine.setAskUser()`, and deterministic headless fallback.
- **Provider Diagnostics & Health State (`GAP-032`)**: Added `flappycode providers test [id]` command; created `provider_health` SQLite repository tracking latency, status, timestamps, and rolling error metrics; enhanced `flappycode doctor` with reachability checks, SQLite `PRAGMA integrity_check`, and remediation hints.
- **Local Provider Auto-Detection (`GAP-040`)**: `LocalProviderDetector` probes default/custom endpoints for Ollama (`11434`), LM Studio (`1234`), and llama.cpp (`8080`) with timeouts and model discovery without false positives; live integration in `OnboardingWizardScreen` displaying detected providers and model counts.
- **Real Configuration System (`GAP-033`)**: Full configuration loader enforcing strict precedence `CLI overrides > project flappy.config.json > user config > schema defaults`; added CLI commands `config get <key>`, `config set <key> <val>`, `config path`, `config edit`; `maskSecrets` recursive secret redaction; `auto:*` (`auto:free-fast`, `auto:best-fit-free`) router policy resolution.
- **Git Tool Safety & Integration (`GAP-020`)**: Full Git safety tool with structured status and diff; command injection protected branch creation; pre-commit secret scanning via `SecretGuard` blocking credential leaks; protected branches (`main`/`master`) push prevention without explicit user confirmation; markdown PR description draft generation (`generatePrDraft`).
- **Persisted Undo Engine (`GAP-045`)**: SQLite-backed `undo_batch` and `undo_file` tables via `UndoRepository`; atomic multi-file rollback surviving engine and process restarts; interactive hunk review in `DiffReviewScreen`.
- **Category-Specific Rules & Override (`GAP-049`)**: Multi-signal automatic project classification across 10 categories (Frontend, Backend, Mobile, CLI, Library, Infra, Data/ML, Monorepo, Docs, Marketing/SEO); category markdown rule assets; manual override precedence via `flappy.config.json` category field; full rules injection into PromptComposer without character truncation.

### 7. Unified CLI Executable (`@flappycode/cli`)
- Binary command `flappycode`:
  - `flappycode`: Interactive in-box TUI loop using `setRawMode(true)` and `readline.emitKeypressEvents`, rendering live keystrokes directly inside the rounded prompt box with backspace, arrow navigation, home/end, and enter support. Renders first-run OnboardingWizardScreen when 0 providers are connected, supports interactive `/providers add` flow, and strictly enforces interactive PlanGate approval (`Enter` approve, `Esc` reject, `e` edit) before any task DAG execution. Supports slash commands: `/models`, `/models tag`, `/models untag`, `/agents`, `/providers`, `/providers add`, `/sessions`, `/undo`, `/rules`, `/help`, `/exit`.
  - `flappycode run "<prompt>"`: Headless non-interactive execution with `--model <id>`, `--approve-plan` gating and `--json` event streaming.
  - `flappycode serve`: Local loopback HTTP/SSE server.
  - `flappycode doctor`: Diagnostic check for Node version, SQLite storage, OS keychain, connected providers, reachability, DB PRAGMA integrity, and free models.
  - `flappycode providers`: Add, list, remove, enable, disable, test, and refresh provider connections.
  - `flappycode models`: Inspect catalog of free, rate-limited, and paid models with overrides.
  - `flappycode agents`: List available built-in and declarative custom agents.
  - `flappycode sessions`: Manage local coding session history (`list`, `resume <id>`, `delete <id>`).
  - `flappycode config`: Inspect, get, set, locate, and edit configuration (`get`, `set`, `path`, `edit`).

## Verification & Test Results
- **Unit & Integration Test Suite**: 40 test suites, 268 passing tests across Stage A, Stage B, Stage C, and Stage D implementations.
- **TypeScript**: Strict typechecking (`tsc --noEmit`) passes with 0 errors across all workspace packages and test suites.
- **Build**: All packages (`@flappycode/protocol`, `@flappycode/providers`, `@flappycode/storage`, `@flappycode/core`, `@flappycode/server`, `@flappycode/tui`, `@flappycode/cli`) build cleanly to ESM, CJS, and TypeScript declaration files (`.d.ts`).

## Audit Findings

**State as of the Phase 1 verification audit (2026-10-01, see `docs/PHASE1_IMPLEMENTATION_AUDIT.md` and `docs/PHASE1_GAPS.md`):**

- **Verdict: PHASE 1 NOT COMPLETE** — 106 requirement rows audited: 27 implemented, 44 partial, 9 broken, 22 not implemented, 4 not verifiable; 60 gaps logged (43 blocking vs the PRD §13 P0 gate).
- **Critical defects in the real execution path** (all runtime-reproduced): diffs/edits applied without diff approval; PlanToken scope self-expands for out-of-plan files; FsJail escapes via absolute path, sibling prefix and directory symlink; agent shell commands always pass `isUserApproved:true` (permission `ask` tier bypassed, no permission-prompt UI); non-TTY interactive mode auto-approves plans; no model fallback/substitution/backoff on 429/5xx/timeout; no Reviewer→Coder feedback or test-fix loop; `--model` flag ignored (no single-model mode); `Context.md` never updated by DocsKeeper; `tool_call_log` never written (and `approved_by_user` hard-coded true); sessions never created (no resume); pool-exhaustion two-action notice/resume unwired; `serve` returns `success:true` for 10 unimplemented commands.
- **Verified working (do not regress):** zero-paid safety invariant (paid-only pool → `pool.exhausted`, exit 4, 0 paid calls); plan-gate blocking before approval; headless exit codes 3/4/5 and pure NDJSON `--json` output; provider discovery → classification → registry → status-bar counts; deterministic classifier precedence; loopback-only server with bearer auth and no CORS; secret redaction in shell output; shell timeout/output-cap; `NO_COLOR` rendering; build passes; 54/54 tests pass.
- **Quality gates red:** typecheck failing (8 errors), coverage 47.1 % (target ≥ 70 %; router 85.5 %/classifier 80.3 % below the ≥ 90 % gate), no CI (`.github/` absent), all source files still untracked in git.
- **Outstanding claims elsewhere in this document** that the audit disproved: FsJail "rejecting any … symlink escapes" (only existing-target checks work), "strictly enforces … PlanGate approval before any task DAG execution" (non-TTY auto-approval + auto-applied diffs), and the typecheck claim above. These sections are left for the owner to revise alongside the fix work (flagged here per documentation-accuracy rules rather than silently rewritten).
