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

### 6.1 Stage B — Provider Reliability & Model Routing (verified complete engine-side)
- `FallbackExecutor` (`packages/core/src/orchestration/fallback-executor.ts`) wraps all connector calls with exponential backoff + jitter + `Retry-After` honoring, then iterates the router's ranked candidates (`excludeModelIds`) — transparent substitution on busy/429/5xx/timeout/quota/disappearance. Every real swap emits `model.substituted` and appends to `node.substitutions`; `recordModelError`/cooldowns are populated from the execution path.
- Pool exhaustion pauses the run (`paused_pool_exhausted`), emits `approval.requested{kind:'pool_exhausted'}` with exactly two actions (`authorize_paid` requiring explicit confirm before any `PaidGrant`, `add_free_provider`), and `FlappyEngine.resolvePoolExhausted()` resumes it honestly.
- `IntervalScheduler` (`registry/scheduler.ts`) revalidates the registry every `revalidate_every_hours` (default 6) and stops cleanly on `engine.close()`.
- Router honors per-agent `fallbackPolicy`: unavailable pinned model returns `needsUserDecision` (default `ask_user` → `question.asked`), never a silent re-route.
- `ProviderRateLimiter` (token bucket, FR-PRV-008) throttles outbound calls per provider; authenticated-before-discover on `providers add` (FR-PRV-002); data-use policy sourced from bundled profiles (FR-PRV-006).
- Known remaining product-surface wiring: `PoolExhaustedScreen`/`resolvePoolExhausted` not yet surfaced in CLI/server, no `models tag` command, Ollama Cloud profile, Anthropic/Google tool-call response normalization, `User-Agent` on google/ollama connectors.

### 7. Unified CLI Executable (`@flappycode/cli`)
- Binary command `flappycode`:
  - `flappycode`: Interactive in-box TUI loop using `setRawMode(true)` and `readline.emitKeypressEvents`, rendering live keystrokes directly inside the rounded prompt box with backspace, arrow navigation, home/end, and enter support. Renders first-run OnboardingWizardScreen when 0 providers are connected, supports interactive `/providers add` flow, and strictly enforces interactive PlanGate approval (`Enter` approve, `Esc` reject, `e` edit) before any task DAG execution.
  - `flappycode run "<prompt>"`: Headless non-interactive execution with `--approve-plan` gating and `--json` event streaming.
  - `flappycode serve`: Local loopback HTTP/SSE server.
  - `flappycode doctor`: Diagnostic check for Node version, SQLite storage, OS keychain, connected providers, and free models.
  - `flappycode providers`: Add, list, remove, enable, disable, and refresh provider connections.
  - `flappycode models`: Inspect catalog of free, rate-limited, and paid models.
  - `flappycode sessions`: Manage local coding session history.

## Verification & Test Results
- **Unit & Integration Test Suite**: 13 test suites, 54 passing tests across classifier precedence, router scoring, PaidGate zero-paid safety, PlanGate token enforcement, FsJail path traversal protection, DiffEngine & UndoEngine rollback, SecretGuard redaction, PermissionEngine shell gating, FlappyServer loopback security, layout cursor coordinates, FlappyEventBus unsubscription & .off() cleanup, and the Golden Flow end-to-end task cycle.
- **TypeScript**: Strict typechecking (`tsc --noEmit`) passes with 0 errors across all 7 workspace packages and test suites.
  - ⚠️ **Outdated claim (flagged by the 2026-10-01 audit):** `pnpm lint` currently **FAILS with 8 errors** in `tests/unit/event-bus.test.ts` (test uses event type `run.started`, which is not in the protocol event union). See `## Audit Findings` below and `docs/PHASE1_GAPS.md` GAP-055.

## Audit Findings

**State as of the Phase 1 verification audit (2026-10-01, see `docs/PHASE1_IMPLEMENTATION_AUDIT.md` and `docs/PHASE1_GAPS.md`):**

- **Verdict: PHASE 1 NOT COMPLETE** — 106 requirement rows audited: 27 implemented, 44 partial, 9 broken, 22 not implemented, 4 not verifiable; 60 gaps logged (43 blocking vs the PRD §13 P0 gate).
- **Critical defects in the real execution path** (all runtime-reproduced): diffs/edits applied without diff approval; PlanToken scope self-expands for out-of-plan files; FsJail escapes via absolute path, sibling prefix and directory symlink; agent shell commands always pass `isUserApproved:true` (permission `ask` tier bypassed, no permission-prompt UI); non-TTY interactive mode auto-approves plans; no model fallback/substitution/backoff on 429/5xx/timeout; no Reviewer→Coder feedback or test-fix loop; `--model` flag ignored (no single-model mode); `Context.md` never updated by DocsKeeper; `tool_call_log` never written (and `approved_by_user` hard-coded true); sessions never created (no resume); pool-exhaustion two-action notice/resume unwired; `serve` returns `success:true` for 10 unimplemented commands.
- **Verified working (do not regress):** zero-paid safety invariant (paid-only pool → `pool.exhausted`, exit 4, 0 paid calls); plan-gate blocking before approval; headless exit codes 3/4/5 and pure NDJSON `--json` output; provider discovery → classification → registry → status-bar counts; deterministic classifier precedence; loopback-only server with bearer auth and no CORS; secret redaction in shell output; shell timeout/output-cap; `NO_COLOR` rendering; build passes; 54/54 tests pass.
- **Quality gates red:** typecheck failing (8 errors), coverage 47.1 % (target ≥ 70 %; router 85.5 %/classifier 80.3 % below the ≥ 90 % gate), no CI (`.github/` absent), all source files still untracked in git.
- **Outstanding claims elsewhere in this document** that the audit disproved: FsJail "rejecting any … symlink escapes" (only existing-target checks work), "strictly enforces … PlanGate approval before any task DAG execution" (non-TTY auto-approval + auto-applied diffs), and the typecheck claim above. These sections are left for the owner to revise alongside the fix work (flagged here per documentation-accuracy rules rather than silently rewritten).
