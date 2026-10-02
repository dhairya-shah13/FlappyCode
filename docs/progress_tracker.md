# Phase 1 Gap Implementation — Progress Tracker

## Current Status: Lint ✅ | Tests ✅ (397/397 across 58 files) | Build ✅

---

## Stage A: Safety & Execution Integrity — Status: 🔶 Mostly Done

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-010 & GAP-023 | Approval Gates & Permission Flow | ✅ Done | DiffReview, PlanApproval, PermissionPrompt screens wired. Non-TTY exits with code 3. Permission routing via `checkCommand()`. |
| GAP-011 | PlanToken Self-Expansion | ✅ Done | Out-of-plan writes blocked without token expansion in `flappyauto.ts:453-474`. Wildcard `['*']` checking in `plan-gate.ts:35`. |
| GAP-022 | FsJail Path Traversal & Symlink | ✅ Done | `path.relative()` boundary check, symlink escape detection via `realpathSync`, Windows drive letter handling. |
| GAP-021 | Truthful Audit Logging | ✅ Done | `auditRepo.logToolCall()` wired into every tool call branch with accurate `approved_by_user`. |
| GAP-047 | Universal Stop Conditions | ✅ Done | Destructive shell, irreversible migration, breaking API, rule conflict detectors all implemented. |
| GAP-028 | Child Process Env Sanitization | ✅ Done | `shell-tool.ts:42-51` strips `API_KEY/TOKEN/SECRET/PASSWORD/AUTH/CREDENTIAL` env vars. |
| GAP-037 | Secure Encrypted Fallback KDF | ✅ Done | `secrets.ts` uses `scrypt` with random per-install salt, never derives from hostname/username/platform. |

## Stage B: Provider Reliability & Model Routing — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-001/003/004 | FallbackExecutor, Backoff, Eventing | ✅ Done | `fallback-executor.ts` exists and is wired into `flappyauto.ts`: exponential backoff + jitter + Retry-After (`computeBackoffMs`), candidate iteration with `excludeModelIds`, `model.substituted` emitted per real substitution, `recordModelError`/cooldowns populated. Covered by `tests/unit/fallback-executor.test.ts` (13) + `tests/integration/stage-b-fallback.test.ts` (22). |
| GAP-002 | Pool Exhaustion Interactive Pause/Resume | ✅ Done | `PoolExhaustedScreen` wired into interactive CLI/TUI flow and `cli.ts`; server implements honest `resolvePoolExhausted` (409 on error/no paused run, 200 on success, never fake success); headless exits code 4 on exhaustion without grant; resume path tested in `tests/integration/stage-b-completion.test.ts` & `tests/unit/server.test.ts`. |
| GAP-005 | Periodic Registry Revalidation | ✅ Done | `registry/scheduler.ts` (`IntervalScheduler`) wired into engine startup, honors `revalidate_every_hours` (default 6), stops on `engine.close()`. Integration test: Stage B3. |
| GAP-006 | User Model Tier Overrides | ✅ Done | CLI commands `flappycode models tag <model> <free|paid|disabled>` and `flappycode models untag <model>` wired; TUI `ModelPickerScreen` renders `[override]` tag and handles disabled models; server command endpoint `/v1/commands` supports `setModelOverride` and `deleteModelOverride`; classifier honors override precedence and router excludes disabled models. Covered in `tests/unit/model-overrides.test.ts`. |
| GAP-044 | Agent fallbackPolicy | ✅ Done | `router.ts` returns `needsUserDecision` for `ask_user`/`abort` when a pinned model is unavailable (no silent re-route); `FallbackExecutor` emits `question.asked` and waits for the user decision (`next_best_fit`/`cancel`). Covered by Stage B5 tests. |
| GAP-034-036,039,041-043 | Provider Profiles & Connectors | ✅ Done | Done: GAP-034 (Ollama Cloud profile added with 30 RPM, rate_limited_free rule, bearer auth, cloud endpoint); GAP-035 (Anthropic and Google bidirectional tool-call normalization with request mapping, SSE functionCall/tool_use delta parser, and tool-result round trip); GAP-036 (User-Agent header `flappycode/<version>` on all outbound Google and Ollama requests); GAP-039 (authenticate before discovery); GAP-041 (bundled data-use policy); GAP-042 (token bucket rate limiter); GAP-043 (modality/latency/price filters). Covered in `tests/unit/connectors.test.ts` & `tests/integration/stage-b-completion.test.ts`. |

## Stage C: Multi-Agent Orchestration — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-007 | Single-Model Mode | ✅ Done | Bypasses planner when `--model <id>` (≠ flappyauto) is passed, constructs direct Coder node, preserves PlanGate & permission safety gates, wired in CLI headless `run --model` and engine. Verified in `tests/unit/single-model.test.ts`. |
| GAP-008 | Declarative Agent Definitions | ✅ Done | Loads `.flappycode/agents/*.yaml\|json`, parses schema, merges with/overrides built-in agents, provides fallback policies and tool scopes. CLI `agents list` & `/agents` wired. Verified in `tests/unit/declarative-agents.test.ts`. |
| GAP-009 | Reviewer/Tester Feedback Loop | ✅ Done | Multi-turn Reviewer/Tester to Coder loop bounded by max iterations (default 3), preserves completed node results, emits `feedback.iteration` events, terminates on `VERDICT: PASS` or escalates. Verified in `tests/unit/feedback-loop.test.ts`. |
| GAP-013 | Parallel Execution Concurrency | ✅ Done | Concurrency guard in `DagExecutor` prevents off-by-one over-admission; admits only available free slots up to `maxConcurrency`; parallel sibling execution verified with timing overlap in `tests/unit/dag-concurrency.test.ts`. |
| GAP-012 | Run Cancellation & Exit 130 | ✅ Done | SIGINT / Esc triggers `engine.cancel(runId)` / `executor.cancel()`, aborts in-flight completions, marks non-terminal nodes as `cancelled`, emits `run.cancelled` event with exit code 130. Verified in `tests/unit/cancellation.test.ts`. |
| GAP-014/050 | Context.md & Changelog.md Updates | ✅ Done | `DocsKeeper` records changes; wired in post-run finalization; verified in Stage C integration suite. |
| GAP-025/026/054 | Sessions, Compaction, Recovery | ✅ Done | `SessionRepository` persists sessions and messages; `ProjectMemoryRepository` stores project memories across runs; `ContextManager` role-based slicing and compaction; CLI `sessions list`, `sessions resume <id>`, `sessions delete <id>`, and `/sessions` wired. Verified in `tests/unit/sessions.test.ts` & `tests/unit/context-slicing.test.ts`. |
| GAP-046 | Planner Repair & Fallback | ✅ Done | Schema parsing failure throws structured `PlannerOutputError`, emits `planner.failed`, and triggers model fallback with exclusion of failing model. Verified in `tests/unit/planner-repair.test.ts`. |
| GAP-019 | Search Tool for Agents | ✅ Done | `search` tool added to allowed_tools for Coder, Codebase-Analyst, File-Finder; excluded from Reviewer, Command-Executor, Tester per security specifications. Verified in `tests/unit/agent-search.test.ts`. |
| GAP-027 | Live Task Graph View | ✅ Done | `TaskGraphScreen` renders reactive ASCII/Unicode DAG with agents, nodes, statuses, model selections, substitutions, feedback iterations, and status bar state machine across 60/80/120 columns. Tested in `tests/tui/stage-c-screens.test.ts`. |
| P1-G8 / P1-G10 | TUI Phase 1 Screens | ✅ Done | `PlanApprovalScreen`, `DiffReviewScreen`, `PermissionPromptScreen`, `PoolExhaustedScreen`, `QuestionPromptScreen` (GAP-048) fully implemented, width-adaptive, and wired into CLI/TUI flows. Tested in `tests/tui/stage-c-screens.test.ts`. |

## Stage D: Rules & Product Interaction — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-018 | Full RULES Bundling & Conflict Detection | ✅ Done | Packaged universal `RULES.md` asset in `@flappycode/cli` and `@flappycode/core` assets; hierarchical resolution (Universal -> Category -> Project -> Nested Scoped); structural conflict detector flags contradictory laws (PlanGate/secrets bypass) without false-positive override penalties. Verified in `tests/unit/rules-loader.test.ts` & `tests/unit/rules-conflict.test.ts`. |
| GAP-048 | Clarifying Questions | ✅ Done | `ask_question` tool, `question.asked`/`question.answered` lifecycle events, interactive `QuestionPromptScreen` (60/80/120 columns with word wrapping and multiple choice options), engine routing, and headless fallback. Verified in `tests/unit/question-tool.test.ts` & `tests/tui/stage-d-screens.test.ts`. |
| GAP-032 | Provider Diagnostics & Health State | ✅ Done | `flappycode providers test [id]` command, SQLite `provider_health` repository tracking latency, status, rolling errors, and timestamps; `doctor` surfaces real reachability, DB PRAGMA integrity, and remediation hints. Verified in `tests/unit/provider-health.test.ts`. |
| GAP-040 | Local Provider Auto-Detection | ✅ Done | `LocalProviderDetector` probes default/custom endpoints for Ollama (11434), LM Studio (1234), and llama.cpp (8080) with timeout and model discovery; live integration in `OnboardingWizardScreen`. Verified in `tests/unit/provider-detection.test.ts`. |
| GAP-033 | Real Config System & Policies | ✅ Done | Full config system with strict precedence `CLI > Project > User > Defaults`; commands `config get`, `config set`, `config path`, `config edit`; `maskSecrets` recursive token redaction; `auto:*` router policy interpretation. Verified in `tests/unit/config-loader.test.ts`. |
| GAP-020 | Git Tool Integration & Safety | ✅ Done | Structured status and diff, command injection protected branch creation, pre-commit secret scanning via `SecretGuard`, protected branches (`main`/`master`) push block without explicit confirmation, markdown PR draft generation. Verified in `tests/unit/git-tool.test.ts`. |
| GAP-045 | Persisted Undo Engine | ✅ Done | SQLite-backed `undo_batch` and `undo_file` tables via `UndoRepository`; atomic multi-file revert surviving engine and process restarts; interactive hunk review in `DiffReviewScreen`. Verified in `tests/unit/undo-persistence.test.ts`. |
| GAP-049 | Category-Specific Rules & Override | ✅ Done | 10 repository categories (Frontend, Backend, Mobile, CLI, Library, Infra, Data/ML, Monorepo, Docs, Marketing/SEO) detected via multi-signal heuristics with manual override support in `flappy.config.json` category field; full markdown rules injected into agent prompts without truncation. Verified in `tests/unit/category-rules.test.ts`. |

## Stage E: CLI & Server Correctness — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-024 | Headless Exit Code Contract | ✅ Done | Full exit code contract: 0 (success), 1 (task/node failure), 2 (usage error via Commander exitOverride), 3 (approval required), 4 (pool exhausted), 5 (no providers), 130 (cancelled via SIGINT/cancelRun). Verified in `tests/integration/stage-e-headless.test.ts`. |
| GAP-051 | Structured run.failed in JSON mode | ✅ Done | `run.failed` event emitted across orchestrator and CLI failures in JSON/NDJSON and standard modes conforming to `StructuredErrorSchema`. Staging verification and JSON streams verified in `tests/integration/stage-e-headless.test.ts`. |
| GAP-052 | Honest Server Command Handling | ✅ Done | All 15 commands in `CommandSchema` handled honestly with side effects or standard HTTP error formatting (`formatErrorForHttp`). Added `ExecutePlanCommandSchema`. Verified in `tests/unit/stage-e-server.test.ts`. |
| GAP-056 | Local Debug Logging | ✅ Done | Structured JSON Logger in `packages/core/src/logging/logger.ts` with `SecretGuard` token redaction, size-based rotation before write, platform log directory resolution, and CLI `--debug` flag. Verified in `tests/unit/stage-e-logger.test.ts`. |
| GAP-058 | Consistent Error Formatting | ✅ Done | Error taxonomy and formatters in `packages/core/src/errors/flappy-error.ts`: `formatErrorForCli` (what/why/next), `formatErrorForJson` (`StructuredError`), `formatErrorForHttp` (status codes and error bodies). Schema defined in `packages/protocol/src/errors.ts`. Verified in `tests/unit/stage-e-errors.test.ts`. |

## Stage F: Integrations & Advanced Capabilities — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-015 | Tool-Calling Capability Probe | ✅ Done | Implemented `CapabilityProbe` with tri-state outcomes (`supported`, `unsupported`, `transient`), error classification, caching, ModelRegistry DB persistence & `model.probed` event; preflight filter wired in FallbackExecutor and FlappyAuto. Covered by `tests/unit/stage-f-probe.test.ts` (3) & Simulation F-01. |
| GAP-016 | Real LSP Integration | ✅ Done | Implemented real JSON-RPC 2.0 stdio LSP client in `packages/core/src/tools/lsp-client.ts`: multi-language server spawning, document sync (`didOpen`, `didChange`, `didClose`), normalized diagnostics, timeouts, graceful degradation. Wired into `flappyauto.ts` for file edits. Deterministic fixture in `tests/fixtures/lsp-server.cjs`. Covered by `tests/unit/stage-f-lsp.test.ts` (7) & Simulations F-02, F-03. |
| GAP-017 | Real MCP Client | ✅ Done | Implemented stdio JSON-RPC MCP client in `packages/core/src/tools/mcp-client.ts`: initialization handshake, `tools/list` enumeration, namespace prefixing `mcp__<server>__<tool>`, collision handling, permission checks. Deterministic fixture in `tests/fixtures/mcp-server.cjs`. Covered by `tests/unit/stage-f-mcp.test.ts` (7) & Simulations F-04, F-05. |
| GAP-038 | Researcher/Browser & Vision | ✅ Done | Implemented `ResearcherService` (bounded fetch 12k chars, HTML stripping, `<<<UNTRUSTED>>>` prompt injection protection) and `BrowserController` (headless browser lifecycle, text extraction, screenshot, process cleanup) in `packages/core/src/tools/`; `ToolRegistry` dynamic tool management. Covered by `tests/unit/stage-f-researcher-browser.test.ts` (6) & Simulations F-06, F-07. |

## Stage G: Quality Gates & Packaging — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-055 | Fix Typecheck & Coverage | ✅ Done | `pnpm lint` (`tsc --noEmit`) passes with 0 errors. All packages build cleanly (`pnpm build`). Statements: 73.11% overall core package (target ≥70%). Safety-critical gates: Router 94.11%, Classifier 100%, PermissionEngine 96.00%, PlanGate 95.55%, RulesLoader 96.17% (all target ≥90%). Automated matrix CI workflow in `.github/workflows/ci.yml`. Covered by Simulation G-01, G-02, G-03. |
| GAP-060 | Connector Contract Tests | ✅ Done | Automated contract test suite with mock fixture server in `tests/contracts/`: OpenAI-Compatible, Anthropic, Google Gemini, Ollama covering User-Agent, list models, text delta streaming, tool call delta assembling, and error codes (400/401/403/429/500). Covered by `tests/contracts/*.contract.test.ts` (20/20) & Simulation G-04. |
| GAP-057 | Package Asset Smoke Test | ✅ Done | `packages/cli/package.json` declares explicit `files: ["dist", "assets"]`; bundles `RULES.md`, 10 category rules, and `community-catalog.json`; `tests/unit/package-smoke.test.ts` tests `npm pack` tarball contents and CLI `--version`/`--help`. Covered by Simulation G-05, G-06. |
| GAP-030 | Interactive TUI PTY Automation Test | ✅ Done | Simulated TTY test in `tests/tui/pty-interactive.test.ts`: character typing, arrow/backspace editing, Enter turn submission, token streaming without flicker, confirmation prompts (`y`/`n`/Enter), and clean raw mode entry/restoration. Covered by Simulation G-07. |
| GAP-031 | Terminal Multi-Resolution & Compatibility | ✅ Done | Multi-resolution tests in `tests/tui/terminal-compat.test.ts` across widths 16, 20, 30, 40, 45, 60, 80, 120, 200; banner collapsing; narrow tagline fitting; `NO_COLOR=1`, `TERM=dumb`, `FORCE_COLOR=1`, `FLAPPYCODE_ASCII=1`. Covered by Simulation G-08. |
| GAP-059 | Cross-Platform Verification Tests | ✅ Done | Cross-platform tests in `tests/unit/cross-platform.test.ts`: path normalization across `/` and `\`, repo-relative leading slashes in `FsJail`, Windows `%APPDATA%`, macOS `~/Library/Application Support`, Linux `$XDG_CONFIG_HOME`, database & log directory resolution, and CI matrix. Covered by Simulation G-09. |

---

## Status Summary
- **Stage A**: 🔶 Mostly Done
- **Stage B**: ✅ Complete
- **Stage C**: ✅ Complete
- **Stage D**: ✅ Complete
- **Stage E**: ✅ Complete
- **Stage F**: ✅ Complete
- **Stage G**: ✅ Complete
- **Total Tests**: 397/397 passing across 58 test files
- **Lint**: 0 errors
- **Build**: 0 errors
