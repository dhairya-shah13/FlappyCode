# Phase 1 Gap Implementation — Progress Tracker

## Current Status: Lint ✅ (0 errors) | Tests ✅ (474/474 across 66 files) | Build ✅ (7 packages) | Coverage ✅ (78.45% core)

---

## Stage A: Safety & Execution Integrity — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-010 & GAP-023 | Approval Gates & Permission Flow | ✅ Done | DiffReview, PlanApproval, PermissionPrompt screens wired. Non-TTY exits with code 3. Permission routing via `checkCommand()`. |
| GAP-011 | PlanToken Self-Expansion | ✅ Done | Out-of-plan writes blocked without token expansion in `flappyauto.ts`. Wildcard `['*']` checking in `plan-gate.ts:35`. |
| GAP-022 | FsJail Path Traversal & Symlink | ✅ Done | `path.relative()` boundary check, symlink escape detection via `realpathSync`, Windows drive letter handling. |
| GAP-021 | Truthful Audit Logging | ✅ Done | `auditRepo.logToolCall()` wired into every tool call branch with accurate `approved_by_user`. |
| GAP-047 | Universal Stop Conditions | ✅ Done | Destructive shell, irreversible migration, breaking API, rule conflict detectors all implemented. |
| GAP-028 | Child Process Env Sanitization | ✅ Done | `shell-tool.ts` strips `API_KEY/TOKEN/SECRET/PASSWORD/AUTH/CREDENTIAL` env vars. |
| GAP-037 | Secure Encrypted Fallback KDF | ✅ Done | `secrets.ts` uses `scrypt` with random per-install salt, never derives from hostname/username/platform. |

## Stage B: Provider Reliability & Model Routing — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-001/003/004 | FallbackExecutor, Backoff, Eventing | ✅ Done | `fallback-executor.ts` exists and is wired into `flappyauto.ts`: exponential backoff + jitter + Retry-After (`computeBackoffMs`), candidate iteration with `excludeModelIds`, `model.substituted` emitted per real substitution, `recordModelError`/cooldowns populated. |
| GAP-002 | Pool Exhaustion Interactive Pause/Resume | ✅ Done | `PoolExhaustedScreen` wired into interactive CLI/TUI flow and `cli.ts`; server implements honest `resolvePoolExhausted`; headless exits code 4 on exhaustion without grant. |
| GAP-005 | Periodic Registry Revalidation | ✅ Done | `registry/scheduler.ts` (`IntervalScheduler`) wired into engine startup, honors `revalidate_every_hours` (default 6), stops on `engine.close()`. |
| GAP-006 | User Model Tier Overrides | ✅ Done | CLI commands `flappycode models tag` and `untag` wired; TUI `ModelPickerScreen` renders `[override]` tag; server `/v1/commands` supports overrides; classifier honors precedence. |
| GAP-044 | Agent fallbackPolicy | ✅ Done | `router.ts` returns `needsUserDecision` for `ask_user`/`abort` when a pinned model is unavailable; `FallbackExecutor` emits `question.asked` and waits for user decision. |
| GAP-034-036,039,041-043 | Provider Profiles & Connectors | ✅ Done | Ollama Cloud profile added; Anthropic & Google bidirectional tool-call normalization; User-Agent header; authenticate before discovery; token bucket rate limiter; modality filters. |

## Stage C: Multi-Agent Orchestration — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-007 | Single-Model Mode | ✅ Done | Bypasses planner when `--model <id>` (≠ flappyauto) is passed, constructs direct Coder node, preserves PlanGate & permission safety gates. |
| GAP-008 | Declarative Agent Definitions | ✅ Done | Loads `.flappycode/agents/*.yaml\|json`, parses schema, merges with/overrides built-in agents, provides fallback policies and tool scopes. CLI `agents list`, `agents show`, and `agents bind` wired. |
| GAP-009 | Reviewer/Tester Feedback Loop | ✅ Done | Multi-turn Reviewer/Tester to Coder loop bounded by max iterations (default 3), preserves completed node results, emits `feedback.iteration` events, terminates on `VERDICT: PASS` or escalates. |
| GAP-013 | Parallel Execution Concurrency | ✅ Done | Concurrency guard in `DagExecutor` prevents off-by-one over-admission; admits only available free slots up to `maxConcurrency`. |
| GAP-012 | Run Cancellation & Exit 130 | ✅ Done | SIGINT / Esc triggers `engine.cancel(runId)` / `executor.cancel()`, aborts in-flight completions, marks non-terminal nodes as `cancelled`, emits `run.cancelled` event with exit code 130. |
| GAP-014/050 | Context.md & Changelog.md Updates | ✅ Done | `DocsKeeper` records changes; wired in post-run finalization; verified in Stage C integration suite. |
| GAP-025/026/054 | Sessions, Compaction, Recovery | ✅ Done | `SessionRepository` persists sessions and messages; `ProjectMemoryRepository` stores project memories across runs; `ContextManager` role-based slicing and compaction; CLI `sessions list`, `sessions resume`, `sessions delete`. |
| GAP-046 | Planner Repair & Fallback | ✅ Done | Schema parsing failure throws structured `PlannerOutputError`, emits `planner.failed`, and triggers model fallback with exclusion of failing model. |
| GAP-019 | Search Tool for Agents | ✅ Done | `search` tool added to allowed_tools for Coder, Codebase-Analyst, File-Finder; dual ripgrep and pure-JS fallback paths implemented (89.9% coverage). |
| GAP-027 | Live Task Graph View | ✅ Done | `TaskGraphScreen` renders reactive ASCII/Unicode DAG with agents, nodes, statuses, model selections, substitutions, feedback iterations, and status bar state machine across 60/80/120 columns. |
| P1-G8 / P1-G10 | TUI Phase 1 Screens | ✅ Done | `PlanApprovalScreen`, `DiffReviewScreen`, `PermissionPromptScreen`, `PoolExhaustedScreen`, `QuestionPromptScreen` fully implemented, width-adaptive, and wired into CLI/TUI flows. |
| P1-D8 | Codebase-Analyst Semantic Index | ✅ Done | Local, offline-capable BM25 chunk index in `packages/core/src/tools/semantic-index.ts` with SQLite storage, FsJail boundaries, and SecretGuard integration (95.3% coverage). |

## Stage D: Rules & Product Interaction — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-018 | Full RULES Bundling & Conflict Detection | ✅ Done | Packaged universal `RULES.md` asset in `@flappycode/cli` and `@flappycode/core` assets; hierarchical resolution; structural conflict detector flags contradictory laws. |
| GAP-048 | Clarifying Questions | ✅ Done | `ask_question` tool, `question.asked`/`question.answered` lifecycle events, interactive `QuestionPromptScreen` (60/80/120 columns), engine routing, and headless fallback. |
| GAP-032 | Provider Diagnostics & Health State | ✅ Done | `flappycode providers test [id]` command, SQLite `provider_health` repository tracking latency, status, rolling errors; `doctor` surfaces real reachability, DB PRAGMA integrity, and hints. |
| GAP-040 | Local Provider Auto-Detection | ✅ Done | `LocalProviderDetector` probes default/custom endpoints for Ollama (11434), LM Studio (1234), and llama.cpp (8080); live integration in `OnboardingWizardScreen`. |
| GAP-033 | Real Config System & Policies | ✅ Done | Full config system with strict precedence `CLI > Project > User > Defaults`; commands `config get`, `config set`, `config path`, `config edit`; `maskSecrets` recursive token redaction. |
| GAP-020 | Git Tool Integration & Safety | ✅ Done | Structured status and diff, command injection protected branch creation, pre-commit secret scanning via `SecretGuard`, protected branches push block without confirmation. |
| GAP-045 | Persisted Undo Engine | ✅ Done | SQLite-backed `undo_batch` and `undo_file` tables via `UndoRepository`; atomic multi-file revert surviving engine and process restarts. |
| GAP-049 | Category-Specific Rules & Override | ✅ Done | 10 repository categories detected via multi-signal heuristics with manual override support in `flappy.config.json` category field; full markdown rules injected into agent prompts. |

## Stage E: CLI & Server Correctness — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-024 | Headless Exit Code Contract | ✅ Done | Full exit code contract: 0 (success), 1 (failure), 2 (usage error), 3 (approval required), 4 (pool exhausted), 5 (no providers), 130 (cancelled via SIGINT). |
| GAP-051 | Structured run.failed in JSON mode | ✅ Done | `run.failed` event emitted across orchestrator and CLI failures in JSON/NDJSON and standard modes conforming to `StructuredErrorSchema`. |
| GAP-052 | Honest Server Command Handling | ✅ Done | All 15 commands in `CommandSchema` handled honestly with side effects or standard HTTP error formatting. Added `ExecutePlanCommandSchema`. |
| GAP-056 | Local Debug Logging | ✅ Done | Structured JSON Logger in `packages/core/src/logging/logger.ts` with `SecretGuard` token redaction, size-based rotation before write, platform log directory resolution, and CLI `--debug` flag. |
| GAP-058 | Consistent Error Formatting | ✅ Done | Error taxonomy and formatters in `packages/core/src/errors/flappy-error.ts`: `formatErrorForCli` (what/why/next), `formatErrorForJson` (`StructuredError`), `formatErrorForHttp`. |

## Stage F: Integrations & Advanced Capabilities — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-015 | Tool-Calling Capability Probe | ✅ Done | Implemented `CapabilityProbe` with tri-state outcomes (`supported`, `unsupported`, `transient`), error classification, caching, ModelRegistry DB persistence & `model.probed` event. |
| GAP-016 | Real LSP Integration | ✅ Done | Implemented real JSON-RPC 2.0 stdio LSP client in `packages/core/src/tools/lsp-client.ts`: multi-language server spawning, document sync, normalized diagnostics, timeouts, graceful degradation. |
| GAP-017 | Real MCP Client | ✅ Done | Implemented stdio JSON-RPC MCP client in `packages/core/src/tools/mcp-client.ts`: initialization handshake, `tools/list` enumeration, namespace prefixing `mcp__<server>__<tool>`. |
| GAP-038 | Researcher/Browser & Vision | ✅ Done | Implemented `ResearcherService` and `BrowserController` in `packages/core/src/tools/`; `ToolRegistry` dynamic tool management. |

## Stage G: Quality Gates & Packaging — Status: ✅ Complete

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-055 | Fix Typecheck & Coverage | ✅ Done | `pnpm lint` passes with 0 errors. All packages build cleanly. Core coverage 78.45%. Safety gates: Router 97.0%, Classifier 100%, PermissionEngine 96.0%, PlanGate 95.5%, RulesLoader 96.2%, RateLimiter 94.7%, SearchTool 89.9%, SemanticIndex 95.3%, DocsKeeper 100%. Matrix CI workflow in `.github/workflows/ci.yml`. |
| GAP-060 | Connector Contract Tests | ✅ Done | Automated contract test suite with mock fixture server in `tests/contracts/`: OpenAI-Compatible, Anthropic, Google Gemini, Ollama covering User-Agent, list models, text delta streaming, tool call delta assembling, error codes. |
| GAP-057 | Package Asset Smoke Test | ✅ Done | `packages/cli` bundles `RULES.md`, 10 category rules, `LICENSE`, and `community-catalog.json`; installs globally in isolated clean temp prefix and executes `--version`, `--help`, `doctor`, and `run`. |
| GAP-030 | Interactive TUI PTY Automation Test | ✅ Done | Simulated TTY test in `tests/tui/pty-interactive.test.ts`: character typing, arrow/backspace editing, Enter turn submission, token streaming without flicker, confirmation prompts, clean raw mode entry/restoration. |
| GAP-031 | Terminal Multi-Resolution & Compatibility | ✅ Done | Multi-resolution tests in `tests/tui/terminal-compat.test.ts` across widths 16, 20, 30, 40, 45, 60, 80, 120, 200; banner collapsing; `NO_COLOR=1`, `TERM=dumb`, `FORCE_COLOR=1`, `FLAPPYCODE_ASCII=1`. |
| GAP-059 | Cross-Platform Verification Tests | ✅ Done | Cross-platform tests in `tests/unit/cross-platform.test.ts`: path normalization across `/` and `\`, repo-relative leading slashes in `FsJail`, Windows `%APPDATA%`, macOS `~/Library/Application Support`, Linux `$XDG_CONFIG_HOME`. |
| GAP-053 | Performance Measurements | ✅ Done | Benchmark suite `scripts/perf/benchmark.ts` passes all targets: Cold start 115ms (≤1.5s), TUI latency 10.5ms (≤50ms), Discovery <1ms (≤10s), Idle RSS 93.6MB (≤250MB), 4-Agent RSS 93.8MB (≤600MB), Overhead 0.01ms (≤200ms). |
| P1-J1 | 20-Task Golden Benchmark Harness | ✅ Done | Automated 20-task benchmark in `tests/integration/golden-benchmark-20.test.ts`: 20/20 passed (100% pass rate on mock provider). |

---

## New Audit Gaps (NEW-001 through NEW-008) — Status: ✅ All Resolved

| Gap ID | Item | Priority | Status | Verification & Evidence |
|---|---|---|---|---|
| **NEW-001** | Missing LICENSE file | HIGH (blocking) | ✅ RESOLVED | Root `LICENSE` added (Apache-2.0 text per DEC-001), copied to `packages/cli/LICENSE`, added to `files` array, `"license": "Apache-2.0"` in all package.json files. Verified in tarball smoke test. |
| **NEW-002** | `agents show` and `agents bind` missing | MEDIUM | ✅ RESOLVED | Added `agents show <name> [--json]` and `agents bind <agent> [model] [--unbind]` to `cli.ts` and slash parser. Persisted in `AgentRepository` and honored by `DeterministicRouter`. Covered in `tests/unit/agents-cli.test.ts` (6/6 passing). |
| **NEW-003** | `upgrade` command missing | LOW | ✅ RESOLVED | Implemented `upgrade` command in `packages/core/src/upgrade.ts` and `cli.ts` with `--check` and `--registry` flags, honoring `update_check` config setting (NFR-PRV-001). Covered in `tests/unit/upgrade-command.test.ts` (6/6 passing). |
| **NEW-004** | Stale README status badge & missing docs | MEDIUM (blocking) | ✅ RESOLVED | README status badge updated to "Phase 1 Release Candidate", removed all stale "Planning Phase" references, documented source and tarball installation, created `docs/QUICKSTART.md`, `docs/PROVIDERS.md`, `docs/RULES-EXPLAINER.md`, `docs/KNOWN-LIMITATIONS.md`, and `docs/CLI-REFERENCE.md`. |
| **NEW-005** | Source code untracked in Git | HIGH (blocking) | ✅ RESOLVED | Comprehensive `.gitignore` created covering dist, node_modules, temp, logs, and secrets; scanned tree for secrets (0 leaks); staged and committed locally in logical commits. |
| **NEW-006** | `rate-limiter.ts` coverage low (33.3%) | LOW | ✅ RESOLVED | Added concurrency semaphore support (`acquireConcurrency`, `getInFlight`) and comprehensive unit tests in `tests/unit/rate-limiter.test.ts`. Coverage raised to **94.73%** statements, 100% functions. |
| **NEW-007** | `search-tool.ts` coverage low (13.3%) | MEDIUM | ✅ RESOLVED | Implemented pure-JS search fallback when ripgrep is absent, binary file exclusion, case sensitivity, regex search, FsJail boundaries, and unit tests in `tests/unit/search-tool.test.ts`. Coverage raised to **89.93%** statements, 100% functions. |
| **NEW-008** | `community-catalog.json` tier vocabulary | LOW | ✅ RESOLVED | Added `CommunityModelEntrySchema` and `CommunityCatalogSchema` to `@flappycode/protocol`, converted catalog to valid `ModelTierSchema` (`free`, `paid`) removing opaque quality grades, and added schema smoke tests in `tests/unit/package-smoke.test.ts`. |

---

## Status Summary
- **Stage A**: ✅ Complete
- **Stage B**: ✅ Complete
- **Stage C**: ✅ Complete
- **Stage D**: ✅ Complete
- **Stage E**: ✅ Complete
- **Stage F**: ✅ Complete
- **Stage G**: ✅ Complete
- **New Gaps**: ✅ 8/8 Resolved
- **Total Tests**: 474/474 passing across 66 test files (0 failures, 0 skips)
- **Lint**: 0 errors (`tsc --noEmit`)
- **Build**: 0 errors across 7 workspace packages
- **Verdict**: ✅ PHASE 1 COMPLETE
