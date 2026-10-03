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

### 6.4 Stage E — CLI & Server Correctness (fully implemented & verified)
- **Headless Exit Code Contract (`GAP-024`)**: Implemented deterministic exit codes across all execution paths: `0` (successful completion), `1` (task/node failure), `2` (usage error: missing prompt, invalid options, unknown commands), `3` (plan approval required), `4` (free model pool exhausted), `5` (no providers available), and `130` (cancellation via SIGINT / `run.cancelled`). Handled Commander exit overrides and unknown subcommand routing without silently launching the TUI.
- **Structured `run.failed` in JSON Mode (`GAP-051`)**: Added `error_details` matching `StructuredErrorSchema` (`code`, `category`, `what`, `why`, `next`) to `RunFailedEventSchema` in `@flappycode/protocol`. Guaranteed pure NDJSON output on stdout in `--json` mode with no human error banners.
- **Honest Server Command Handling (`GAP-052`)**: Complete command dispatch matrix covering all 15 commands in `CommandSchema` (`submitPrompt`, `approvePlan`, `rejectPlan`, `executePlan`, `approveDiff`, `rejectDiff`, `grantPermission`, `answerQuestion`, `cancelRun`, `addProvider`, `refreshProviders`, `pinModel`, `resolvePoolExhausted`, `setModelOverride`, `deleteModelOverride`). Dispatches honestly to the core engine, resolves deferred diff and permission promises, surfaces real failures, and rejects malformed or unsupported payloads with 400.
- **Local Debug Logging Subsystem (`GAP-056`)**: Implemented `Logger` class in `@flappycode/core` with structured newline-delimited JSON records, platform-aware log directory resolution (`FLAPPYCODE_LOG_DIR`, `%LOCALAPPDATA%`, `XDG_STATE_HOME`, `Library/Logs`), size-based rotation with configurable `maxSizeBytes` and `maxFiles`, and `SecretGuard` final-boundary redaction. Wired `--debug` CLI option to stream engine events into `flappycode.log` without polluting stdout.
- **Consistent Error Formatting (`GAP-058`)**: Created `FlappyError` and stable `ErrorCodes` catalogue in `@flappycode/core`. Implemented formatters for CLI (`formatErrorForCli` with What/Why/Next structure), JSON (`formatErrorForJson`), and HTTP (`formatErrorForHttp` mapping error categories to status codes 400, 401, 409, 500, 502 with structured payload).

### 6.5 Stage F — Integrations & Advanced Capabilities (fully implemented & verified)
- **Capability Probe (`GAP-015`)**: `CapabilityProbe` with tri-state outcomes (`supported`, `unsupported`, `transient`) in `packages/core/src/registry/probe.ts`. Wired into `FallbackExecutor` and `FlappyAuto` for lazy preflight validation before a model is used by a tool-requiring agent. Persists to SQLite `tool_probe_passed`, caches in memory, excludes failing models from candidate pools, and emits `model.probed`. Text-only roles bypass probing.
- **Real LSP Integration (`GAP-016`)**: Complete JSON-RPC 2.0 stdio LSP client in `packages/core/src/tools/lsp-client.ts`. Multi-language server process lifecycle, document synchronization (`didOpen`, `didChange`, `didClose`), normalized diagnostics by URI, RPC timeouts, and crash recovery. Wired into `flappyauto.ts` to feed compiler diagnostics directly to Coder/Reviewer feedback loops following code modifications. Tested via deterministic fixture server in `tests/fixtures/lsp-server.cjs`.
- **Real MCP Client (`GAP-017`)**: Full stdio JSON-RPC MCP client in `packages/core/src/tools/mcp-client.ts`. Implements handshake initialization, capability negotiation, and tool discovery with prefixing (`mcp__<server>__<tool>`) to prevent collisions. Every tool execution is evaluated by `PermissionEngine.checkCommand()` and audited before dispatch. Isolated error handling and timeout protection. Tested via deterministic fixture server in `tests/fixtures/mcp-server.cjs`.
- **Researcher, Browser & Vision (`GAP-038`)**: `ResearcherService` and `ResearcherTool` in `packages/core/src/tools/researcher-tool.ts` with bounded URL fetch (12k chars), HTML parsing, and untrusted delimiter framing (`<<<UNTRUSTED EXTERNAL RESEARCH CONTENT FROM: {url}>>> ... <<<END UNTRUSTED CONTENT>>>`) preventing instruction injection. `BrowserController` and `BrowserTool` in `packages/core/src/tools/browser-tool.ts` with isolated headless browser lifecycle (launch, navigate, extract DOM, capture screenshot, cleanup). Vision pipeline filters candidates by `supports_vision: true`, returns honest capability errors on non-vision models, and formats multimodal payloads for Anthropic, OpenAI, and Google connectors. `ToolRegistry` provides dynamic tool registration with JSON schema validation and permission enforcement.

### 6.6 Stage G — Quality Gates & Packaging (fully implemented & verified)
- **Typecheck, Coverage & CI Quality Gate (`GAP-055`)**: Strict TypeScript with 0 errors across monorepo (`tsc --noEmit`). Monorepo builds cleanly across all 7 packages. Coverage thresholds enforced: statements 73.3% (≥ 70%), lines 73.3% (≥ 70%), functions 85.6% (≥ 80%), branches 73.76% (≥ 70%). Safety-critical modules exceed 90%: Router 94.11%, Classifier 100%, PermissionEngine 96.00%, PlanGate 95.55%, RulesLoader 96.17%. Multi-OS GitHub Actions CI workflow in `.github/workflows/ci.yml` matrix-tested across Ubuntu, macOS, and Windows with Node 20 and 22.
- **Connector Contract Tests (`GAP-060`)**: Deterministic local HTTP fixture server in `tests/contracts/fixture-server.ts` backing recorded-response contract tests for `openai-compatible`, `anthropic`, `google`, and `ollama` connectors. Validates honest User-Agent (`flappycode/0.1.0`), model discovery, streaming SSE chunks, tool calling, and error mappings (400, 401, 429 with Retry-After, 500, network timeouts). Raised provider package coverage to 85.63%.
- **Package Asset Bundling & Install Smoke (`GAP-057`)**: `packages/cli/package.json` declares `"files": ["dist", "assets"]` and `"bin": {"flappycode": "dist/cli.js"}`. Bundles `RULES.md`, 10 category rules, and `community-catalog.json`. Tested via `npm pack --dry-run` and automated CLI execution tests verifying `--version` and `--help`.
- **Interactive TUI PTY Automation (`GAP-030`)**: Automated TTY harness in `tests/tui/pty-interactive.test.ts` verifying raw mode input loop, typing, backspace/arrow editing, Enter prompt submission, plan approval keys (`y`/`n`/Esc), slash commands, and clean terminal restoration on exit.
- **Terminal Compatibility & Width Handling (`GAP-031`)**: Fixed narrow-width line overflow at width 45: responsive tagline wrapping, compact status bar abbreviations (`v0.1.0 │ 4p │ 14f │ Ready`). Verified across column widths 16, 20, 30, 40, 45, 60, 80, 120, 200. Handled `FORCE_COLOR=1`, `FLAPPYCODE_NO_ANIM=1`, and `FLAPPYCODE_ASCII=1`.
- **Cross-Platform Verification (`GAP-059`)**: Automated tests in `tests/unit/cross-platform.test.ts` verifying path normalization across `/` and `\`, `FsJail` boundary enforcement, directory resolution (`%APPDATA%`, `LOCALAPPDATA`, `~/Library/Application Support`, `~/Library/Logs`, `$XDG_CONFIG_HOME`, `$XDG_STATE_HOME`), shell command resolution, and multi-OS CI matrix.

### 7. Unified CLI Executable (`@flappycode/cli`)
- Binary command `flappycode`:
  - `flappycode`: Interactive in-box TUI loop using `setRawMode(true)` and `readline.emitKeypressEvents`, rendering live keystrokes directly inside the rounded prompt box with backspace, arrow navigation, home/end, and enter support. Renders first-run OnboardingWizardScreen when 0 providers are connected, supports interactive `/providers add` flow, and strictly enforces interactive PlanGate approval (`Enter` approve, `Esc` reject, `e` edit) before any task DAG execution. Supports slash commands: `/models`, `/models tag`, `/models untag`, `/agents`, `/providers`, `/providers add`, `/sessions`, `/undo`, `/rules`, `/help`, `/exit`.
  - `flappycode run "<prompt>"`: Headless non-interactive execution with `--model <id>`, `--approve-plan` gating and `--json` event streaming, `--cwd`, `--debug`, and deterministic exit codes.
  - `flappycode serve`: Local loopback HTTP/SSE server.
  - `flappycode doctor`: Diagnostic check for Node version, SQLite storage, OS keychain, connected providers, reachability, DB PRAGMA integrity, and free models.
  - `flappycode providers`: Add, list, remove, enable, disable, test, and refresh provider connections.
  - `flappycode models`: Inspect catalog of free, rate-limited, and paid models with overrides.
  - `flappycode agents`: List available built-in and declarative custom agents.
  - `flappycode sessions`: Manage local coding session history (`list`, `resume <id>`, `delete <id>`).
  - `flappycode config`: Inspect, get, set, locate, and edit configuration (`get`, `set`, `path`, `edit`).

## Verification & Test Results
- **Unit & Integration Test Suite**: 70 test suites, 500 passing tests (0 failures, 0 skips) across Stage A through G, new audit gaps, the 20-task golden benchmark, and final remediation suites (`gap-rem-01` through `gap-rem-04`).
- **Coverage**: Monorepo statement and line coverage is 76.05% (overall core statement coverage 78.42%), exceeding the mandatory ≥ 70% threshold. Safety-critical modules exceed all thresholds: Router 97.02%, Classifier 100%, PermissionEngine 96.00%, PlanGate 95.55%, RulesLoader 96.17%, RateLimiter 94.73%, SearchTool 89.93%, SemanticIndex 95.34%, DocsKeeper 100%.
- **TypeScript**: Strict typechecking (`tsc --noEmit`) passes with 0 errors across all workspace packages and test suites.
- **Build**: All 7 packages (`@flappycode/protocol`, `@flappycode/providers`, `@flappycode/storage`, `@flappycode/core`, `@flappycode/server`, `@flappycode/tui`, `@flappycode/cli`) build cleanly to ESM, CJS, and TypeScript declaration files (`.d.ts`).
- **CI**: Automated GitHub Actions CI workflow in `.github/workflows/ci.yml` across Ubuntu, macOS, and Windows on Node 20 and Node 22, plus manual gated release workflow in `.github/workflows/release.yml`.
- **Packaging Smoke Test**: Global install from packed local tarball (`npm pack`) verified in isolated clean prefix with `--version`, `--help`, `doctor`, and `run`.
- **Formal Release Acceptance**: Phase 1 is formally certified as **ACCEPTED** under [docs/PHASE1_FINAL_ACCEPTANCE_AUDIT.md](file:///c:/Projects/FlappyCode/docs/PHASE1_FINAL_ACCEPTANCE_AUDIT.md).

## Phase 1 Gap Closure & Final Remediation Register

All 60 original gaps, all 8 new gaps (NEW-001 through NEW-008), and all 4 remediation items (GAP-REM-01 through GAP-REM-04) are fully implemented and verified:
- **NEW-001 (License)**: Root and package Apache-2.0 LICENSE added and bundled in tarball.
- **NEW-002 (Agents CLI)**: `agents show <name>` and `agents bind <name> <model>` implemented with SQLite persistence.
- **NEW-003 (Upgrade Command)**: `flappycode upgrade [--check] [--registry]` implemented with NFR-PRV-001 privacy toggle.
- **NEW-004 (Documentation Suite)**: Published active user and developer documentation: `docs/QUICKSTART.md`, `docs/PROVIDERS.md`, `docs/RULES-EXPLAINER.md`, `docs/KNOWN-LIMITATIONS.md`, and `docs/CLI-REFERENCE.md`. Cleaned up obsolete intermediate scratchpads.
- **NEW-005 (Git Tracking)**: Comprehensive `.gitignore` configured; verified zero secret leaks; monorepo source committed.
- **NEW-006 (Rate Limiter)**: Concurrency semaphores added; statement coverage raised to 94.73%.
- **NEW-007 (Search Tool)**: Pure-JS fallback path implemented; statement coverage raised to 89.93%.
- **NEW-008 (Community Catalog)**: Aligned with `ModelTierSchema` without opaque quality grades.
- **P1-D8 (Semantic Index)**: Offline BM25 chunk index in `packages/core/src/tools/semantic-index.ts` with FsJail and SecretGuard integration (95.34% coverage).
- **P1-J1 (Golden Benchmark)**: 20/20 golden tasks passed in `tests/integration/golden-benchmark-20.test.ts`.
- **NFR-PERF (Performance)**: Verified in `scripts/perf/benchmark.ts`: cold start 115ms (≤1.5s), TUI latency 10.5ms (≤50ms), discovery <1ms (≤10s), idle RSS 93.6MB (≤250MB), 4-agent RSS 93.8MB (≤600MB), overhead 0.01ms (≤200ms).
- **GAP-REM-01 (Single-Model Mode PlanGate Scoped Write Access)**: Single-model execution deadlocks resolved with `scopeMode: 'single-model'` in `PlanToken`. Candidate prompt paths pre-seeded; strict FsJail boundaries enforced; protected paths blocked (`.git`, `.env*`, `node_modules`, `RULES.md`, `.flappycode`, lockfiles); diff staging remains mandatory.
- **GAP-REM-02 (Interactive Model Picker Selection Loop)**: Arrow-key navigation (`↑`/`↓`/`k`/`j`), selection (`Enter`), cancellation (`Esc`/`q`), PaidGate confirmation prompts, disabled-tier refusal, and config persistence (`model_policy.default_model`).
- **GAP-REM-03 (Provider Connector Lookup by Type)**: Connector resolution in `engine.ts` (`addProvider`, `doctorProvider`, fallback profiles) and `fallback-executor.ts` resolves by `cfg.type`. `ModelRegistry.getConnector` fails descriptively on unknown types with supported list.
- **GAP-REM-04 (`sessions resume` Interactive App Continuation)**: `launchTUI({ resumeSessionId })` hydrates conversation context with token compaction, restores session model, renders transcript, and continues session interactively. Non-interactive `--print`/`--no-tui` flags supported.


