# Phase 1 Gap Implementation — Progress Tracker

## Current Status: Lint ✅ | Tests ✅ (110/110) | Build ✅

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

## Stage C: Multi-Agent Orchestration — Status: 🔴 Partially Done

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-007 | Single-Model Mode | ❌ Missing | `--model` option exists in CLI but not wired to bypass multi-agent. |
| GAP-008 | Declarative Agent Definitions | 🔶 Partial | `BUILTIN_AGENTS` exists but no `.flappycode/agents/*.yaml` file scanning. |
| GAP-009 | Reviewer/Tester Feedback Loop | ❌ Missing | Single-shot step execution, no multi-turn loop. |
| GAP-013 | Parallel Execution Concurrency | 🔶 Partial | `DagExecutor` exists but off-by-one `Math.max(1,...)` needs correction. |
| GAP-012 | Run Cancellation & Exit 130 | ❌ Missing | No SIGINT/Esc→cancelRun wiring, no exit code 130. |
| GAP-014/050 | Context.md & Changelog.md Updates | ✅ Done | `DocsKeeper` records changes; wired in post-run finalization. |
| GAP-025/026/054 | Sessions, Compaction, Recovery | 🔶 Partial | `SessionRepo` exists, `ContextManager` has compaction. `--continue` not wired. |
| GAP-046 | Planner Repair & Fallback | ❌ Missing | No repair prompt or planner model fallback on schema failure. |
| GAP-019 | Search Tool for Agents | 🔶 Partial | `SearchTool` exists but not in agent `allowed_tools`. |
| GAP-027 | Live Task Graph View | ❌ Missing | No `task-graph.ts` screen. Status bar state machine incomplete. |

## Stage D: Rules & Product Interaction — Status: 🔴 Partially Done

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-018 | Full RULES Bundling & Conflict Detection | 🔶 Partial | `RulesLoader` exists with hierarchical loading. Conflict detector exists. Bundling into cli package not verified. |
| GAP-048 | Clarifying Questions | ❌ Missing | No `ask_question` tool or `question-prompt.ts` screen. |
| GAP-032/040 | Provider Diagnostics & Auto-Detection | 🔶 Partial | `doctor` command exists. No `providers test`. No auto-detect Ollama/LM Studio. |
| GAP-033 | Real Config System | ❌ Missing | No `config-loader.ts`. No `config get|set|path` CLI commands. |
| GAP-020 | Git Tool Integration | 🔶 Partial | `GitTool` exists but no push confirmation, protected branch check, or PR description. |
| GAP-045 | Persisted Undo Engine | 🔶 Partial | `UndoEngine` uses in-memory snapshots. No persistent SQLite storage. |

## Stage E: CLI & Server Correctness — Status: 🔶 Partially Done

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-024 | Headless Exit Code Contract | 🔶 Partial | Codes 0,1,3,4,5 mapped. Missing code 2 (Usage Error) and 130 (Cancelled). |
| GAP-051 | Structured run.failed in JSON mode | ❌ Missing | No `run.failed` event emission in headless mode. |
| GAP-052 | Honest Server Command Handling | ❌ Missing | Server needs real command wiring. |
| GAP-056 | Local Debug Logging | ❌ Missing | No `--debug` flag, no `logger.ts`. |
| GAP-058 | Consistent Error Formatting | ❌ Missing | No `errors.ts` with what/why/next structure. |

## Stage F: Integrations & Advanced Capabilities — Status: 🔴 Mostly Missing

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-015 | Tool-Calling Capability Probe | ❌ Missing | No `probe.ts`. |
| GAP-016 | Real LSP Integration | ❌ Missing | `lsp-client.ts` exists but is a stub. |
| GAP-017 | Real MCP Client | ❌ Missing | `mcp-client.ts` exists but is a stub. |
| GAP-038 | Researcher/Browser & Vision | ❌ Missing | No `researcher.ts` or `browser-tool.ts`. |

## Stage G: Quality Gates & Packaging — Status: 🔶 Partially Done

| GAP | Item | Status | Notes |
|-----|------|--------|-------|
| GAP-055 | Fix Typecheck & Coverage | ✅ Fixed | `pnpm lint` passes (0 errors). Tests: 54/54 pass. Coverage threshold not measured yet. |
| GAP-060 | Connector Contract Tests | ❌ Missing | No `tests/contracts/` directory. |
| GAP-057 | Package Asset Smoke Test | ❌ Missing | No `files` field in cli package.json. |
| GAP-030/031/059 | Terminal & Cross-Platform | ❌ Missing | No terminal width wrapping tests. |

---

## Immediate Next Steps
1. ✅ Fixed blocking issues (ContextManager import, run.started event)
2. **Stage B**: ✅ Fully completed (`FallbackExecutor`, backoff/eventing, periodic scheduler, fallbackPolicy, pool exhaustion TUI/server, model tag/untag CLI/TUI/server, Ollama Cloud, Anthropic & Google tool-call normalization, User-Agent headers).
3. **Stage C**: Wire `--model` single-model mode, implement feedback loop, add cancellation
4. Continue through remaining stages systematically
