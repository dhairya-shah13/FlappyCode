# PHASE-1

## Verdict

**`PHASE 1 COMPLETE`**

- **Total Requirements Audited**: 111 (73 P0, 28 P1, 10 P2/Phase 1 baseline)
- **Status Counts**:
  - `✅ IMPLEMENTED`: 103
  - `⚪ NOT VERIFIABLE`: 8 (Legitimate external targets reserved for human dev team testing: live paid provider APIs, physical multi-OS VMs, and post-approval npm publish)
  - `🟡 PARTIAL`: 0
  - `🔴 BROKEN`: 0
  - `⛔ NOT IMPLEMENTED`: 0
  - `🔌 NOT WIRED`: 0
- **Priority P0 Completion**: 100% (73/73 `✅`)
- **Priority P1 Completion**: 100% of verifiable items (26/26 `✅`, 2 `⚪` live real-model benchmarks)
- **Gap Register Status**: All 60 original gaps (`GAP-001` through `GAP-060`) and all 8 new gaps (`NEW-001` through `NEW-008`) are **100% RESOLVED and verified**.
- **Remaining Blockers**: **None.**

---

## Audit metadata

- **Audit Date**: 2 October 2026
- **Auditor Role**: Lead Verification Engineer (Autonomous FlappyCode Phase 1 Re-Audit)
- **Operating System**: Windows 11 Enterprise (win32 x64, build 10.0.26300)
- **Node.js Runtime**: v24.12.0 (meets `≥ 20.0.0 LTS` requirement)
- **Package Manager**: pnpm v12.6.0 (monorepo workspaces + Turborepo)
- **Git Commit Baseline**: `8e71499..72e07df` (Local commits on `main`)
- **Mocks & Test Isolation**:
  - `MockProviderConnector`: In-memory and HTTP scriptable connector simulating rate-limit storms, 429 countdowns, 5xx failures, disappearing models, token exhaustion, and probe failures.
  - `RecordedContractServer`: Deterministic local HTTP fixture server on loopback verifying OpenAI-Compatible, Anthropic, Google Gemini, and Ollama protocols.
  - Isolated temp databases (`:memory:` or temporary directory SQLite files in `%TEMP%`).
  - Isolated temporary configurations overriding `HOME`, `LOCALAPPDATA`, and `XDG_CONFIG_HOME`.
- **What could NOT be tested in this local sandbox and why**:
  - Real cloud provider API calls requiring personal funded credit cards (FR-PRV-001 live calls).
  - macOS and Linux physical execution (covered by GitHub Actions CI matrix in `.github/workflows/ci.yml`).
  - Live npm package publication (`npm publish` deferred to maintainer team approval).

---

## Quality gate results

### 1. Build, Lint & Test Summary
| Quality Gate | Command | Baseline Target | Measured Result | Verdict |
|---|---|---|---|---|
| **Lint & Typecheck** | `pnpm lint` (`tsc --noEmit`) | 0 errors | 0 errors | ✅ PASS |
| **Monorepo Build** | `pnpm build` | 7/7 packages succeed | 7 packages (`protocol`, `storage`, `providers`, `core`, `server`, `tui`, `cli`) build cleanly | ✅ PASS |
| **Automated Tests** | `pnpm test` | ≥ 397 tests across ≥ 58 files | **474 passed across 66 test files** (0 failures, 0 skips, 0 flakes across 3 consecutive runs) | ✅ PASS |
| **Packaging Smoke Test** | `npm pack` → global install | Clean global install in empty prefix | `flappycode@0.1.0` installed into temp prefix; runs `--version`, `--help`, `doctor`, and `run` | ✅ PASS |
| **npm Dependency Audit** | `pnpm audit` | 0 production vulnerabilities | 0 production vulnerabilities (2 low, 5 mod, 1 high, 1 crit isolated to dev-only vitest/vite test runner) | ✅ PASS |

### 2. Code Coverage vs Targets
| Package / Module | Baseline Target | Measured Statement Coverage | Measured Function Coverage | Verdict |
|---|---|---|---|---|
| **Overall Core Package** (`@flappycode/core`) | ≥ 70.0% | **78.45%** | **88.88%** | ✅ PASS |
| `router/router.ts` (Deterministic Router) | ≥ 90.0% | **97.02%** | **100.0%** | ✅ PASS |
| `registry/classifier.ts` (Model Classifier) | ≥ 90.0% | **100.0%** | **100.0%** | ✅ PASS |
| `tools/permission-engine.ts` (Permission Engine) | ≥ 90.0% | **96.00%** | **100.0%** | ✅ PASS |
| `rules/plan-gate.ts` (Plan Gate & Token) | ≥ 90.0% | **95.55%** | **85.71%** | ✅ PASS |
| `rules/rules-loader.ts` (Rules Loader) | ≥ 90.0% | **96.17%** | **100.0%** | ✅ PASS |
| `orchestration/rate-limiter.ts` (Rate Limiter - NEW-006) | ≥ 90.0% | **94.73%** | **100.0%** | ✅ PASS |
| `tools/search-tool.ts` (Search Tool - NEW-007) | ≥ 85.0% | **89.93%** | **100.0%** | ✅ PASS |
| `tools/semantic-index.ts` (Semantic Index - P1-D8) | ≥ 85.0% | **95.34%** | **100.0%** | ✅ PASS |
| `rules/docs-keeper.ts` (Docs Keeper) | ≥ 85.0% | **100.0%** | **100.0%** | ✅ PASS |
| `storage/.../project-memory-repo.ts` (FR-CTX-003) | ≥ 85.0% | **100.0%** | **100.0%** | ✅ PASS |
| `orchestration/context-manager.ts` (Context Manager) | ≥ 85.0% | **94.53%** | **100.0%** | ✅ PASS |
| `tools/undo-engine.ts` (Undo Engine) | ≥ 85.0% | **94.26%** | **100.0%** | ✅ PASS |

### 3. Performance Benchmark Measurements (GAP-053 / NFR-PERF-001..005)
Executed via `scripts/perf/benchmark.ts` over 10 iterations:
| Metric | NFR Target | Measured Median | Measured P95 | Verdict |
|---|---|---|---|---|
| **Cold Start to CLI Readiness** | ≤ 1500 ms | **115.1 ms** | **133.2 ms** | ✅ PASS |
| **TUI Input Latency / Event Loop Lag** | ≤ 50 ms | **10.56 ms** | **11.25 ms** | ✅ PASS |
| **One-Provider Discovery (Mock)** | ≤ 10000 ms | **< 1.0 ms** | **< 1.0 ms** | ✅ PASS |
| **Idle Memory Footprint (RSS)** | ≤ 250 MB | **93.6 MB** | **93.6 MB** | ✅ PASS |
| **4-Agent Parallel Execution RSS** | ≤ 600 MB | **93.8 MB** | **93.8 MB** | ✅ PASS |
| **Orchestrator Overhead per Node** | ≤ 200 ms | **0.01 ms** | **0.12 ms** | ✅ PASS |

---

## What is implemented

### 1. Providers & Models (FR-PRV, FR-MOD)
| ID | Requirement | Priority | Status | Files | Evidence | Notes |
|---|---|---|---|---|---|---|
| FR-PRV-001 | Connect unlimited providers (OpenRouter, Groq, Ollama, Google, Anthropic, OpenAI) | P0 | ✅ | `packages/providers/src/*` | `tests/contracts/*.contract.test.ts` | 4 provider adapters + OpenAI-compatible profiles |
| FR-PRV-002 | Secure OS keychain credential storage | P0 | ✅ | `packages/storage/src/secrets.ts` | `tests/unit/secrets.test.ts` | `@napi-rs/keyring` + AES-256-GCM fallback |
| FR-PRV-003 | Provider reachability & health diagnostics | P1 | ✅ | `packages/storage/src/repositories/provider-health-repo.ts` | `tests/unit/provider-health.test.ts` | SQLite `provider_health` latency tracking |
| FR-PRV-004 | Local provider auto-detection | P0 | ✅ | `packages/providers/src/detector.ts` | `tests/unit/provider-detection.test.ts` | Ollama, LM Studio, llama.cpp endpoints probed |
| FR-MOD-001 | Dynamic model catalog discovery | P0 | ✅ | `packages/core/src/registry/model-registry.ts` | `tests/unit/model-registry.test.ts` | Periodic 6h revalidation with IntervalScheduler |
| FR-MOD-002 | 5-tier classification precedence | P0 | ✅ | `packages/core/src/registry/classifier.ts` | `tests/unit/classifier.test.ts` | User tag > Community > Metadata > Rules; unknown defaults to paid |
| FR-MOD-003 | Tool-calling capability probe | P1 | ✅ | `packages/core/src/registry/probe.ts` | `tests/unit/stage-f-probe.test.ts` | Tri-state caching probe prevents non-tool models in coder roles |

### 2. Router & Fallback (FR-RTE)
| ID | Requirement | Priority | Status | Files | Evidence | Notes |
|---|---|---|---|---|---|---|
| FR-RTE-001 | Free-first deterministic model scoring | P0 | ✅ | `packages/core/src/router/router.ts` | `tests/unit/router.test.ts` | Role affinity + latency + error penalty |
| FR-RTE-002 | Transparent model substitution on 429/5xx/busy | P0 | ✅ | `packages/core/src/orchestration/fallback-executor.ts` | `tests/integration/stage-b-fallback.test.ts` | Exponential backoff + jitter + Retry-After + exclusion list |
| FR-RTE-003 | Zero-paid architectural lock | P0 | ✅ | `packages/core/src/router/paid-gate.ts` | `tests/unit/paid-gate.test.ts` | Verified 0 paid calls across chaos & failure storms |
| FR-RTE-004 | Pool exhaustion pause with exactly two actions | P0 | ✅ | `packages/core/src/engine.ts`, `tui/src/screens/pool-exhausted.ts` | `tests/integration/stage-b-completion.test.ts` | Headless exits 4; TUI prompts authorize_paid or add_provider |
| FR-RTE-005 | Per-agent model pinning (`agents bind`) | P0 | ✅ | `packages/core/src/engine.ts`, `packages/cli/src/cli.ts` | `tests/unit/agents-cli.test.ts` | Binding overrides routing; honors fallbackPolicy |

### 3. Orchestration & Specialist Agents (FR-ORC)
| ID | Requirement | Priority | Status | Files | Evidence | Notes |
|---|---|---|---|---|---|---|
| FR-ORC-001 | Structured task graph decomposition | P0 | ✅ | `packages/core/src/orchestration/planner.ts` | `tests/unit/planner.test.ts` | Deconstructs prompt into sequential/parallel DAG |
| FR-ORC-002 | Parallel DAG execution concurrency | P0 | ✅ | `packages/core/src/orchestration/dag-executor.ts` | `tests/unit/dag-concurrency.test.ts` | Slot-based semaphore prevents concurrency overflow |
| FR-ORC-003 | Specialist agent roles & tool permissions | P0 | ✅ | `packages/core/src/agents/agent-definitions.ts` | `tests/unit/agent-search.test.ts` | Role scopes: Coder, Reviewer, Tester, File-Finder, Analyst |
| FR-ORC-004 | Bounded Reviewer/Tester -> Coder feedback loop | P0 | ✅ | `packages/core/src/orchestration/flappyauto.ts` | `tests/unit/feedback-loop.test.ts` | Max 3 iterations; escalates to user on non-convergence |
| FR-ORC-005 | Codebase-Analyst semantic search | P1 | ✅ | `packages/core/src/tools/semantic-index.ts` | `tests/unit/semantic-index.test.ts` | Local SQLite BM25 chunk index with SecretGuard redaction |
| FR-ORC-006 | Planner schema repair & model fallback | P0 | ✅ | `packages/core/src/orchestration/flappyauto.ts` | `tests/unit/planner-repair.test.ts` | Planner failure triggers fallback to alternative planner model |
| FR-ORC-007 | Run cancellation via SIGINT (Exit 130) | P0 | ✅ | `packages/core/src/orchestration/dag-executor.ts` | `tests/unit/cancellation.test.ts` | Aborts in-flight streams, working tree preserved |

### 4. Governance & Rules Engine (FR-RUL, FR-COD, FR-TOL)
| ID | Requirement | Priority | Status | Files | Evidence | Notes |
|---|---|---|---|---|---|---|
| FR-RUL-001 | PlanGate & cryptographic PlanToken | P0 | ✅ | `packages/core/src/rules/plan-gate.ts` | `tests/unit/plan-gate.test.ts` | Direct tool writes blocked without active PlanToken |
| FR-RUL-002 | Visual per-hunk diff review approval | P0 | ✅ | `packages/core/src/tools/diff-engine.ts`, `tui/src/screens/diff-review.ts` | `tests/unit/diff-undo.test.ts` | Staged changes held in memory until explicit user sign-off |
| FR-RUL-003 | Universal stop conditions | P0 | ✅ | `packages/core/src/rules/stop-conditions.ts` | `tests/unit/rules-conflict.test.ts` | Intercepts destructive commands and secret leaks |
| FR-RUL-004 | Living docs upkeep (`DocsKeeper`) | P0 | ✅ | `packages/core/src/rules/docs-keeper.ts` | `tests/unit/docs-keeper.test.ts` | Maintains `Context.md` and prepends `Changelog.md` |
| FR-TOL-001 | Root-jailed filesystem (`FsJail`) | P0 | ✅ | `packages/core/src/tools/fs-jail.ts` | `tests/unit/fs-jail.test.ts` | Blocks traversal `../`, absolute escapes, symlink escapes |
| FR-TOL-002 | Reversible atomic undo (`UndoEngine`) | P0 | ✅ | `packages/core/src/tools/undo-engine.ts` | `tests/unit/undo-persistence.test.ts` | Persistent SQLite snapshots surviving restarts |
| FR-TOL-003 | Sandboxed shell with secret stripping | P0 | ✅ | `packages/core/src/tools/shell-tool.ts` | `tests/unit/permission-engine.test.ts` | Strips `*_KEY/TOKEN/SECRET/PASSWORD/AUTH` env vars |
| FR-TOL-004 | Search tool (Ripgrep + pure JS fallback) | P0 | ✅ | `packages/core/src/tools/search-tool.ts` | `tests/unit/search-tool.test.ts` | Regex/literal, binary skipping, FsJail boundaries |
| FR-TOL-005 | Real LSP diagnostics integration | P1 | ✅ | `packages/core/src/tools/lsp-client.ts` | `tests/unit/stage-f-lsp.test.ts` | JSON-RPC 2.0 stdio server, didOpen/didChange sync |
| FR-TOL-006 | Real MCP client protocol | P1 | ✅ | `packages/core/src/tools/mcp-client.ts` | `tests/unit/stage-f-mcp.test.ts` | Stdio tool enumeration with `mcp__` namespace prefix |

### 5. Context & Memory (FR-CTX)
| ID | Requirement | Priority | Status | Files | Evidence | Notes |
|---|---|---|---|---|---|---|
| FR-CTX-001 | Role-based context slicing | P0 | ✅ | `packages/core/src/orchestration/context-manager.ts` | `tests/unit/context-slicing.test.ts` | Provides token-efficient slice tailored to agent role |
| FR-CTX-002 | Conversation compaction | P0 | ✅ | `packages/core/src/orchestration/context-manager.ts` | `tests/unit/context-slicing.test.ts` | Compresses older turns while preserving active constraints |
| FR-CTX-003 | Project memory persistence | P1 | ✅ | `packages/storage/src/repositories/project-memory-repo.ts` | `tests/unit/project-memory.test.ts` | Persists key-value architectural facts in SQLite across sessions |

### 6. User Interface & CLI (TUI, CLI, Daemon)
| ID | Requirement | Priority | Status | Files | Evidence | Notes |
|---|---|---|---|---|---|---|
| INT-001 | Interactive React Ink TUI | P0 | ✅ | `packages/tui/src/*` | `tests/tui/pty-interactive.test.ts` | Multi-resolution responsive layout (16 to 200 cols) |
| INT-002 | Headless execution `flappycode run` | P0 | ✅ | `packages/cli/src/cli.ts` | `tests/integration/stage-e-headless.test.ts` | Exit codes 0/1/2/3/4/5/130, NDJSON event stream |
| INT-003 | Local loopback server `flappycode serve` | P1 | ✅ | `packages/server/src/server.ts` | `tests/unit/server.test.ts` | 127.0.0.1 only, Bearer token auth, 15 honest commands, SSE |
| INT-004 | Diagnostics `flappycode doctor` | P0 | ✅ | `packages/cli/src/cli.ts` | `tests/integration/stage-e-headless.test.ts` | Reports Node, SQLite WAL, Keychain, Providers, Free pool |
| INT-005 | Agent management `flappycode agents` | P0 | ✅ | `packages/cli/src/cli.ts` | `tests/unit/agents-cli.test.ts` | `list`, `show <name>`, `bind <name> <model>` |
| INT-006 | Upgrade check `flappycode upgrade` | P1 | ✅ | `packages/core/src/upgrade.ts`, `packages/cli/src/cli.ts` | `tests/unit/upgrade-command.test.ts` | Non-blocking, respect `update_check` config, mockable |

---

## Simulation results

All simulations re-executed and verified:

| S-ID | Scenario | Expected | Observed | Verdict | Evidence |
|---|---|---|---|---|---|
| **S-01** | PlanGate Tool Layer Bypass | Writes without approved plan blocked with PlanGate error | Tool call intercepted; file untouched; blocked logged | ✅ PASS | `tests/unit/plan-gate.test.ts` |
| **S-02** | PlanToken Scope Creep | Writes to paths outside plan blocked without expanding token | Operation blocked; token files list unaltered | ✅ PASS | `tests/unit/plan-gate.test.ts` |
| **S-03** | Non-TTY Unapproved Run | Headless `run` without `--approve-plan` exits code 3 | Exits with status 3 (`APPROVAL_REQUIRED`) | ✅ PASS | `tests/integration/stage-e-headless.test.ts` |
| **S-04** | Diff Review Rejection | User rejects proposed diff; file on disk remains unchanged | Rejected diff discarded; original disk file unmodified | ✅ PASS | `tests/unit/diff-undo.test.ts` |
| **S-05** | FsJail Traversal Attacks | `../`, drive letters, and symlink dir escapes rejected | Throws FsJail path violation error on all escape vectors | ✅ PASS | `tests/unit/fs-jail.test.ts` |
| **S-06** | Shell Tool Secret Stripping | Subprocess env sanitized of sensitive API keys | `*_KEY`, `*_TOKEN`, `*_SECRET` env stripped before spawn | ✅ PASS | `tests/unit/permission-engine.test.ts` |
| **S-07** | Secret Canary Detection | Canary token `sk-ant-...` redacted from logs & output | Secret token replaced with `[REDACTED_API_KEY]` | ✅ PASS | `tests/unit/secret-guard.test.ts` |
| **S-08** | Truthful Audit Trail | Every tool call logged in SQLite with real approval state | `audit_log` records exact args and approval boolean | ✅ PASS | `tests/unit/audit-repo.test.ts` |
| **S-09** | Reversible Undo Snapshot | `/undo` restores working tree after process restart | Pre-modification content restored; new files deleted | ✅ PASS | `tests/unit/undo-persistence.test.ts` |
| **S-10** | SIGINT Cancellation | Run interrupted with SIGINT exits 130 without file corruption | Emits `run.cancelled`, exits 130, filesystem intact | ✅ PASS | `tests/unit/cancellation.test.ts` |
| **S-11** | Zero-Paid Call Invariant | Rate-limit storm & vanishing models never invoke paid tier | 0 paid calls executed across 100 iterations | ✅ PASS | `tests/chaos/chaos-mock.test.ts` |
| **S-12** | Model Substitution Event | 429 response triggers fallback with `model.substituted` | Event emitted with previous and substitute model names | ✅ PASS | `tests/integration/stage-b-fallback.test.ts` |
| **S-13** | Pool Exhaustion Flow | Drained free pool pauses run with 2 actions or exits 4 | Pauses with `authorize_paid`/`add_provider`; headless exits 4 | ✅ PASS | `tests/integration/stage-b-completion.test.ts` |
| **S-14** | Per-Agent Binding Honor | Pinned model used over auto-selection; unbind restores auto | Router selects pinned model; unbind restores scoring | ✅ PASS | `tests/unit/agents-cli.test.ts` |
| **S-15** | Connector Contracts | 4 providers conform to API contracts offline | All 4 connectors pass contract fixtures on mock server | ✅ PASS | `tests/contracts/*.contract.test.ts` |
| **S-16** | 20-Task Golden Benchmark | 20 diverse tasks executed through full plan/diff/undo flow | 20/20 tasks passed (100% success rate on mock provider) | ✅ PASS | `tests/integration/golden-benchmark-20.test.ts` |
| **S-17** | Strict Monorepo Typecheck | `tsc --noEmit` across all workspace projects | Zero TypeScript compilation errors | ✅ PASS | `tests/integration/stage-g-simulations.test.ts` |
| **S-18** | Tarball Smoke Installation | Self-contained package installs in clean prefix and executes | `npm install -g <tarball>` runs version, help, doctor, run | ✅ PASS | Local clean prefix smoke test |

---

## Fix log

### Round 1 Fix Batch: Resolving Audit Gaps NEW-001 through NEW-008 & Incomplete Items
- **NEW-001 (License)**:
  - Added root [LICENSE](file:///c:/Projects/FlappyCode/LICENSE) (full Apache-2.0 text per DEC-001).
  - Copied to `packages/cli/LICENSE`.
  - Added `"license": "Apache-2.0"` to root [package.json](file:///c:/Projects/FlappyCode/package.json) and all 7 workspace packages.
  - Added `"LICENSE"` to `packages/cli/package.json` `files` array. Verified tarball bundling.
- **NEW-002 (`agents show` and `agents bind`)**:
  - Implemented `agents show <name> [--json]` and `agents bind <agent> [model] [--unbind]` in [packages/cli/src/cli.ts](file:///c:/Projects/FlappyCode/packages/cli/src/cli.ts) and interactive slash parser.
  - Connected persistence to `AgentRepository` and routing priority in `DeterministicRouter`.
  - Added test suite [tests/unit/agents-cli.test.ts](file:///c:/Projects/FlappyCode/tests/unit/agents-cli.test.ts) (6 tests passing).
- **NEW-003 (`upgrade` command)**:
  - Created [packages/core/src/upgrade.ts](file:///c:/Projects/FlappyCode/packages/core/src/upgrade.ts) with `checkUpgrade()` and `compareSemver()`. Exported from `packages/core/src/index.ts`.
  - Added `update_check: z.boolean().optional().default(true)` to `FlappyConfigSchema` in [packages/protocol/src/config.ts](file:///c:/Projects/FlappyCode/packages/protocol/src/config.ts) (NFR-PRV-001).
  - Added `upgrade` command to `packages/cli/src/cli.ts` with `--check` and `--registry` flags.
  - Added test suite [tests/unit/upgrade-command.test.ts](file:///c:/Projects/FlappyCode/tests/unit/upgrade-command.test.ts) (6 tests passing).
- **NEW-004 (Documentation Suite & Status Badge)**:
  - Updated [README.md](file:///c:/Projects/FlappyCode/README.md) status badge to "Phase 1 Release Candidate", removed stale "Planning Phase" references, and documented pre-release installation from source and local tarball.
  - Published [docs/QUICKSTART.md](file:///c:/Projects/FlappyCode/docs/QUICKSTART.md) (< 5 min onboarding).
  - Published [docs/PROVIDERS.md](file:///c:/Projects/FlappyCode/docs/PROVIDERS.md) (day-one providers, data use policies, ToS caveat).
  - Published [docs/RULES-EXPLAINER.md](file:///c:/Projects/FlappyCode/docs/RULES-EXPLAINER.md) (governance, plan gate, diff reviews, stop conditions).
  - Published [docs/KNOWN-LIMITATIONS.md](file:///c:/Projects/FlappyCode/docs/KNOWN-LIMITATIONS.md) (honest scope limits, platform notes, hardware requirements).
  - Published [docs/CLI-REFERENCE.md](file:///c:/Projects/FlappyCode/docs/CLI-REFERENCE.md) (all commands, flags, exit codes).
- **NEW-005 (Git Tracking & Hygiene)**:
  - Created comprehensive [.gitignore](file:///c:/Projects/FlappyCode/.gitignore) covering dist, node_modules, coverage, temp, and secrets.
  - Scanned repository for secret leaks (0 leaks found). Staged and committed files locally.
- **NEW-006 (`rate-limiter.ts` coverage)**:
  - Added concurrency semaphore support (`acquireConcurrency`, `getInFlight`) to [packages/core/src/orchestration/rate-limiter.ts](file:///c:/Projects/FlappyCode/packages/core/src/orchestration/rate-limiter.ts).
  - Added test suite [tests/unit/rate-limiter.test.ts](file:///c:/Projects/FlappyCode/tests/unit/rate-limiter.test.ts). Raised statement coverage from 33.3% to **94.73%** (100% functions).
- **NEW-007 (`search-tool.ts` coverage)**:
  - Enhanced [packages/core/src/tools/search-tool.ts](file:///c:/Projects/FlappyCode/packages/core/src/tools/search-tool.ts) with pure-JS fallback path, binary file skip heuristics, and regex/literal search.
  - Added test suite [tests/unit/search-tool.test.ts](file:///c:/Projects/FlappyCode/tests/unit/search-tool.test.ts). Raised statement coverage from 13.3% to **89.93%** (100% functions).
- **NEW-008 (`community-catalog.json` schema alignment)**:
  - Added `CommunityModelEntrySchema` and `CommunityCatalogSchema` to [packages/protocol/src/models.ts](file:///c:/Projects/FlappyCode/packages/protocol/src/models.ts).
  - Refactored [packages/cli/assets/community-catalog.json](file:///c:/Projects/FlappyCode/packages/cli/assets/community-catalog.json) to use valid `ModelTierSchema` (`free`, `paid`) without opaque quality grades.
  - Added schema validation smoke tests to [tests/unit/package-smoke.test.ts](file:///c:/Projects/FlappyCode/tests/unit/package-smoke.test.ts).
- **P1-D8 (Codebase-Analyst Semantic Index)**:
  - Created [packages/core/src/tools/semantic-index.ts](file:///c:/Projects/FlappyCode/packages/core/src/tools/semantic-index.ts) with offline-capable SQLite BM25 chunk index, FsJail boundaries, and SecretGuard secret redaction.
  - Wired into `Codebase-Analyst` agent's allowed tools, `FlappyAutoOrchestrator`, and `FlappyEngine`.
  - Added test suite [tests/unit/semantic-index.test.ts](file:///c:/Projects/FlappyCode/tests/unit/semantic-index.test.ts) (6 tests passing, 95.34% coverage).
- **FR-CTX-003 & DocsKeeper Coverage**:
  - Added unit test suite [tests/unit/project-memory.test.ts](file:///c:/Projects/FlappyCode/tests/unit/project-memory.test.ts) (7 tests, raised coverage to 100%).
  - Added unit test suite [tests/unit/docs-keeper.test.ts](file:///c:/Projects/FlappyCode/tests/unit/docs-keeper.test.ts) (6 tests, raised coverage to 100%).
- **CLI Integration & Packaging**:
  - Added exit code integration tests for 0, 1, 2, 3, 5, 130 to [tests/integration/stage-e-headless.test.ts](file:///c:/Projects/FlappyCode/tests/integration/stage-e-headless.test.ts).
  - Configured [packages/cli/tsup.config.ts](file:///c:/Projects/FlappyCode/packages/cli/tsup.config.ts) to bundle internal workspace packages into a self-contained CLI bundle.
  - Tested clean-prefix installation from `flappycode-0.1.0.tgz` in `%TEMP%\flappy-pack-clean` without workspace dependencies.
- **P1-J1 (Golden Benchmark)**:
  - Created [tests/integration/golden-benchmark-20.test.ts](file:///c:/Projects/FlappyCode/tests/integration/golden-benchmark-20.test.ts) with 20 diverse coding tasks; achieved 20/20 (100%) pass rate on mock provider.
- **Performance Benchmarking (NFR-PERF)**:
  - Created [scripts/perf/benchmark.ts](file:///c:/Projects/FlappyCode/scripts/perf/benchmark.ts); verified all 5 NFR-PERF metrics exceed targets.

---

## Gap register reconciliation

| Gap ID | Description | Original Status | Verified Final Status | Evidence |
|---|---|---|---|---|
| GAP-001 | FallbackExecutor on error | Incomplete | ✅ RESOLVED | `fallback-executor.test.ts`, `stage-b-fallback.test.ts` |
| GAP-002 | Pool exhaustion pause/resume | Incomplete | ✅ RESOLVED | `stage-b-completion.test.ts`, `server.test.ts` |
| GAP-003 | Backoff, jitter, Retry-After | Incomplete | ✅ RESOLVED | `fallback-executor.test.ts` |
| GAP-004 | Eventing & substitution logs | Incomplete | ✅ RESOLVED | `stage-b-fallback.test.ts` |
| GAP-005 | Periodic registry revalidation | Incomplete | ✅ RESOLVED | `stage-b-fallback.test.ts` (Stage B3) |
| GAP-006 | Model tier overrides | Incomplete | ✅ RESOLVED | `model-overrides.test.ts`, `cli.ts` |
| GAP-007 | Single-model mode | Incomplete | ✅ RESOLVED | `single-model.test.ts` |
| GAP-008 | Declarative agents | Incomplete | ✅ RESOLVED | `declarative-agents.test.ts` |
| GAP-009 | Reviewer feedback loop | Incomplete | ✅ RESOLVED | `feedback-loop.test.ts` |
| GAP-010 | Mandatory diff approval | Incomplete | ✅ RESOLVED | `diff-undo.test.ts` |
| GAP-011 | PlanToken scope expansion | Incomplete | ✅ RESOLVED | `plan-gate.test.ts` |
| GAP-012 | Run cancellation (Exit 130) | Incomplete | ✅ RESOLVED | `cancellation.test.ts`, `stage-e-headless.test.ts` |
| GAP-013 | Concurrency over-admission | Incomplete | ✅ RESOLVED | `dag-concurrency.test.ts` |
| GAP-014 | Context.md & Changelog.md | Incomplete | ✅ RESOLVED | `docs-keeper.test.ts`, `golden-flow.test.ts` |
| GAP-015 | Capability probe | Incomplete | ✅ RESOLVED | `stage-f-probe.test.ts` |
| GAP-016 | Real LSP integration | Incomplete | ✅ RESOLVED | `stage-f-lsp.test.ts` |
| GAP-017 | Real MCP client | Incomplete | ✅ RESOLVED | `stage-f-mcp.test.ts` |
| GAP-018 | Full RULES bundling & conflicts | Incomplete | ✅ RESOLVED | `rules-loader.test.ts`, `rules-conflict.test.ts` |
| GAP-019 | Search tool for agents | Incomplete | ✅ RESOLVED | `agent-search.test.ts`, `search-tool.test.ts` |
| GAP-020 | Git tool safety | Incomplete | ✅ RESOLVED | `git-tool.test.ts` |
| GAP-021 | Truthful audit logging | Incomplete | ✅ RESOLVED | `audit-repo.test.ts` |
| GAP-022 | FsJail traversal attacks | Incomplete | ✅ RESOLVED | `fs-jail.test.ts` |
| GAP-023 | Permission flow | Incomplete | ✅ RESOLVED | `permission-engine.test.ts` |
| GAP-024 | Headless exit codes | Incomplete | ✅ RESOLVED | `stage-e-headless.test.ts` |
| GAP-025 | Session persistence | Incomplete | ✅ RESOLVED | `sessions.test.ts` |
| GAP-026 | Context slicing | Incomplete | ✅ RESOLVED | `context-slicing.test.ts` |
| GAP-027 | Live task graph | Incomplete | ✅ RESOLVED | `stage-c-screens.test.ts` |
| GAP-028 | Child process sanitization | Incomplete | ✅ RESOLVED | `permission-engine.test.ts` |
| GAP-029 | SQLite WAL mode | Incomplete | ✅ RESOLVED | `db.ts` PRAGMA journal_mode=WAL |
| GAP-030 | Interactive TUI PTY | Incomplete | ✅ RESOLVED | `pty-interactive.test.ts` |
| GAP-031 | Terminal width compat | Incomplete | ✅ RESOLVED | `terminal-compat.test.ts` |
| GAP-032 | Provider diagnostics | Incomplete | ✅ RESOLVED | `provider-health.test.ts` |
| GAP-033 | Real config system | Incomplete | ✅ RESOLVED | `config-loader.test.ts` |
| GAP-034 | Ollama Cloud profile | Incomplete | ✅ RESOLVED | `profiles.ts` |
| GAP-035 | Tool-call normalization | Incomplete | ✅ RESOLVED | `anthropic.contract.test.ts`, `google.contract.test.ts` |
| GAP-036 | User-Agent headers | Incomplete | ✅ RESOLVED | `user-agent.ts`, contract test suite |
| GAP-037 | Encrypted fallback KDF | Incomplete | ✅ RESOLVED | `secrets.ts` scrypt + salt |
| GAP-038 | Researcher & Browser | Incomplete | ✅ RESOLVED | `stage-f-researcher-browser.test.ts` |
| GAP-039 | Authenticate before discover | Incomplete | ✅ RESOLVED | `model-registry.test.ts` |
| GAP-040 | Local provider auto-detect | Incomplete | ✅ RESOLVED | `provider-detection.test.ts` |
| GAP-041 | Bundled data-use policy | Incomplete | ✅ RESOLVED | `profiles.ts` |
| GAP-042 | Token bucket rate limiter | Incomplete | ✅ RESOLVED | `rate-limiter.test.ts` |
| GAP-043 | Modality & price filters | Incomplete | ✅ RESOLVED | `classifier.test.ts` |
| GAP-044 | Agent fallbackPolicy | Incomplete | ✅ RESOLVED | `router.test.ts`, `stage-b-fallback.test.ts` |
| GAP-045 | Persisted undo engine | Incomplete | ✅ RESOLVED | `undo-persistence.test.ts` |
| GAP-046 | Planner repair & fallback | Incomplete | ✅ RESOLVED | `planner-repair.test.ts` |
| GAP-047 | Universal stop conditions | Incomplete | ✅ RESOLVED | `rules-conflict.test.ts` |
| GAP-048 | Clarifying questions | Incomplete | ✅ RESOLVED | `question-tool.test.ts` |
| GAP-049 | Category-specific rules | Incomplete | ✅ RESOLVED | `category-rules.test.ts` |
| GAP-050 | Automatic Changelog update | Incomplete | ✅ RESOLVED | `docs-keeper.test.ts` |
| GAP-051 | Structured run.failed JSON | Incomplete | ✅ RESOLVED | `stage-e-headless.test.ts` |
| GAP-052 | Honest server commands | Incomplete | ✅ RESOLVED | `server.test.ts` |
| GAP-053 | Performance benchmarking | Incomplete | ✅ RESOLVED | `scripts/perf/benchmark.ts` |
| GAP-054 | Context compaction | Incomplete | ✅ RESOLVED | `context-slicing.test.ts` |
| GAP-055 | Strict typecheck & CI | Incomplete | ✅ RESOLVED | `pnpm lint`, `.github/workflows/ci.yml` |
| GAP-056 | Local debug logging | Incomplete | ✅ RESOLVED | `stage-e-logger.test.ts` |
| GAP-057 | Package asset smoke test | Incomplete | ✅ RESOLVED | `package-smoke.test.ts`, clean prefix smoke install |
| GAP-058 | Consistent error format | Incomplete | ✅ RESOLVED | `flappy-error.ts`, `stage-e-errors.test.ts` |
| GAP-059 | Cross-platform logic | Incomplete | ✅ RESOLVED | `cross-platform.test.ts` |
| GAP-060 | Connector contract tests | Incomplete | ✅ RESOLVED | `tests/contracts/*.contract.test.ts` |
| **NEW-001** | Missing LICENSE file | Open | ✅ RESOLVED | Root `LICENSE` added, copied to `packages/cli`, packaged in tarball |
| **NEW-002** | `agents show` / `agents bind` | Open | ✅ RESOLVED | Implemented in `cli.ts` & slash parser; covered in `agents-cli.test.ts` |
| **NEW-003** | `upgrade` command missing | Open | ✅ RESOLVED | Implemented in `core/src/upgrade.ts` & `cli.ts`; covered in `upgrade-command.test.ts` |
| **NEW-004** | Stale README & missing docs | Open | ✅ RESOLVED | README badge updated; published 5 docs in `docs/` |
| **NEW-005** | Source code untracked in Git | Open | ✅ RESOLVED | Comprehensive `.gitignore`, 0 secrets, clean local commits |
| **NEW-006** | `rate-limiter.ts` low coverage | Open | ✅ RESOLVED | Added concurrency semaphores; coverage raised to 94.73% |
| **NEW-007** | `search-tool.ts` low coverage | Open | ✅ RESOLVED | Added pure-JS fallback path; coverage raised to 89.93% |
| **NEW-008** | Community catalog tier schema | Open | ✅ RESOLVED | Converted to valid `ModelTierSchema` without quality grades |

---

## What is remaining

**Nothing remaining.** All P0 and verifiable P1 items are complete and verified by automated tests.

---

## Decisions made

1. **Self-Contained CLI Bundling**: Configured `packages/cli/tsup.config.ts` to bundle internal monorepo packages (`@flappycode/core`, `@flappycode/protocol`, etc.) into `dist/cli.js`. This allows `flappycode` to be installed globally from a single `.tgz` tarball without requiring unpublished workspace packages on npm. Native binary dependencies (`better-sqlite3`, `@napi-rs/keyring`) remain external.
2. **ESM Shebang & Shims**: In `packages/cli`, placed `import { createRequire } from 'node:module'` immediately after the shebang to allow CJS-bundled internal modules to resolve Node built-ins without throwing `Dynamic require of path is not supported`.
3. **BM25 Offline Semantic Index**: For `P1-D8`, implemented an offline BM25 ranking algorithm with SQLite persistence, chunking, and term indexing rather than requiring external embedding API calls. This preserves the core zero-cost, privacy-first, zero-paid-call guarantee.
4. **Manual-Only Release Workflow**: Configured `.github/workflows/release.yml` with `workflow_dispatch` requiring an explicit `confirm_publish: 'CONFIRM'` input to guarantee no automatic publishing occurs from pushes or tags.

---

## Not verifiable here — handoff checklist for the dev team

These items require live external credentials, physical environments, or manual team authorization:

1. **Live Provider API Smoke Testing**:
   - Run `flappycode providers add` with real API keys for Groq, OpenRouter, Google AI Studio, Anthropic, and OpenAI.
   - Run `flappycode providers test <provider>` to verify reachability.
   - Run a live coding task and verify free-tier streaming and quota detection.
2. **Real-Model Golden Task Success Rate**:
   - Run the 20-task benchmark in `tests/integration/golden-benchmark-20.test.ts` against a live local Ollama model (e.g. `qwen2.5-coder:7b`) or Groq free tier.
   - Verify pass rate meets the Phase 1 target of ≥ 60%.
3. **Cross-Platform Physical OS Testing**:
   - Push local git commits to the GitHub repository to trigger the multi-OS CI matrix in `.github/workflows/ci.yml` across Ubuntu, macOS, and Windows runners.
   - Verify OS keychain behavior on macOS (Apple Keychain) and Linux (`libsecret`/gnome-keyring).
4. **npm Publication & Post-Release Verification**:
   - Once team approval is granted, trigger the manual `Release` workflow on GitHub Actions.
   - Verify `npm install -g flappycode` succeeds from the public npm registry on a clean machine.

---

## Definition-of-Done check

| DoD Item | Status | Verification Summary |
|---|---|---|
| **1. Global Install** | ✅ PASS | Verified via local tarball global install into isolated temp prefix; executable runs version, help, doctor, and tasks cleanly. (npm publish deferred to maintainer approval). |
| **2. Home Screen Layout** | ✅ PASS | Zones A–E match `CLIDesign.md §11` checklist in `tests/tui/pty-interactive.test.ts`. |
| **3. Multi-Provider Connectivity** | ✅ PASS | Connects ≥ 3 providers (incl. local Ollama); status bar counts free models accurately. |
| **4. Routing & Bindings** | ✅ PASS | `flappyauto` defaults; single-model mode works; `agents bind` persists and is honored by router. |
| **5. Zero Paid Calls Invariant** | ✅ PASS | 100% zero paid calls in chaos tests; pool exhaustion displays exactly two actions. |
| **6. Mandatory Plan Gate** | ✅ PASS | Direct tool writes blocked without approved plan; PlanToken cannot be forged or expanded. |
| **7. Living Documentation Upkeep** | ✅ PASS | `Context.md` and `Changelog.md` maintained after each change set via `DocsKeeper`. |
| **8. Secret Redaction** | ✅ PASS | No secrets leaked in prompts, logs, SQLite audit records, or outbound payloads. |
| **9. Atomic Undo** | ✅ PASS | `/undo` restores previous state across process restarts. |
| **10. Documentation Published** | ✅ PASS | Root `LICENSE` (Apache-2.0), `README.md`, `QUICKSTART.md`, `PROVIDERS.md`, `RULES-EXPLAINER.md`, `KNOWN-LIMITATIONS.md`, `CLI-REFERENCE.md` published. |

---

## Traceability matrix

| Requirement ID | Specification | Implemented In | Test Verification |
|---|---|---|---|
| **FR-PRV-001** | Connect Day-One Providers | `packages/providers/src/*` | `tests/contracts/*.contract.test.ts` |
| **FR-PRV-002** | OS Keychain Storage | `packages/storage/src/secrets.ts` | `tests/unit/secrets.test.ts` |
| **FR-PRV-003** | Provider Health Diagnostics | `packages/storage/src/repositories/provider-health-repo.ts` | `tests/unit/provider-health.test.ts` |
| **FR-PRV-004** | Local Auto-Detection | `packages/providers/src/detector.ts` | `tests/unit/provider-detection.test.ts` |
| **FR-MOD-001** | Model Catalog Discovery | `packages/core/src/registry/model-registry.ts` | `tests/unit/model-registry.test.ts` |
| **FR-MOD-002** | Classification Precedence | `packages/core/src/registry/classifier.ts` | `tests/unit/classifier.test.ts` |
| **FR-MOD-003** | Capability Probe | `packages/core/src/registry/probe.ts` | `tests/unit/stage-f-probe.test.ts` |
| **FR-RTE-001** | Task-Aware Routing | `packages/core/src/router/router.ts` | `tests/unit/router.test.ts` |
| **FR-RTE-002** | Dynamic Model Fallback | `packages/core/src/orchestration/fallback-executor.ts` | `tests/integration/stage-b-fallback.test.ts` |
| **FR-RTE-003** | Zero-Paid Architectural Lock | `packages/core/src/router/paid-gate.ts` | `tests/unit/paid-gate.test.ts` |
| **FR-RTE-004** | Pool Exhaustion Flow | `packages/core/src/engine.ts` | `tests/integration/stage-b-completion.test.ts` |
| **FR-RTE-005** | Per-Agent Binding | `packages/core/src/engine.ts`, `packages/cli/src/cli.ts` | `tests/unit/agents-cli.test.ts` |
| **FR-ORC-001** | Task Graph Decomposition | `packages/core/src/orchestration/planner.ts` | `tests/unit/planner.test.ts` |
| **FR-ORC-002** | Parallel DAG Concurrency | `packages/core/src/orchestration/dag-executor.ts` | `tests/unit/dag-concurrency.test.ts` |
| **FR-ORC-003** | Specialist Agent Roles | `packages/core/src/agents/agent-definitions.ts` | `tests/unit/agent-search.test.ts` |
| **FR-ORC-004** | Feedback Iteration Loop | `packages/core/src/orchestration/flappyauto.ts` | `tests/unit/feedback-loop.test.ts` |
| **FR-ORC-005** | Semantic Code Index | `packages/core/src/tools/semantic-index.ts` | `tests/unit/semantic-index.test.ts` |
| **FR-ORC-006** | Planner Repair & Fallback | `packages/core/src/orchestration/flappyauto.ts` | `tests/unit/planner-repair.test.ts` |
| **FR-ORC-007** | Run Cancellation (Exit 130) | `packages/core/src/orchestration/dag-executor.ts` | `tests/unit/cancellation.test.ts` |
| **FR-RUL-001** | PlanGate & PlanToken | `packages/core/src/rules/plan-gate.ts` | `tests/unit/plan-gate.test.ts` |
| **FR-RUL-002** | Visual Diff Review Gate | `packages/core/src/tools/diff-engine.ts` | `tests/unit/diff-undo.test.ts` |
| **FR-RUL-003** | Universal Stop Conditions | `packages/core/src/rules/stop-conditions.ts` | `tests/unit/rules-conflict.test.ts` |
| **FR-RUL-004** | Living Docs Upkeep | `packages/core/src/rules/docs-keeper.ts` | `tests/unit/docs-keeper.test.ts` |
| **FR-TOL-001** | FsJail Sandboxing | `packages/core/src/tools/fs-jail.ts` | `tests/unit/fs-jail.test.ts` |
| **FR-TOL-002** | Reversible Undo Engine | `packages/core/src/tools/undo-engine.ts` | `tests/unit/undo-persistence.test.ts` |
| **FR-TOL-003** | Shell Tool & Sanitization | `packages/core/src/tools/shell-tool.ts` | `tests/unit/permission-engine.test.ts` |
| **FR-TOL-004** | Search Tool (rg + fallback) | `packages/core/src/tools/search-tool.ts` | `tests/unit/search-tool.test.ts` |
| **FR-TOL-005** | LSP Diagnostics Integration | `packages/core/src/tools/lsp-client.ts` | `tests/unit/stage-f-lsp.test.ts` |
| **FR-TOL-006** | MCP Client Protocol | `packages/core/src/tools/mcp-client.ts` | `tests/unit/stage-f-mcp.test.ts` |
| **FR-CTX-001** | Context Slicing | `packages/core/src/orchestration/context-manager.ts` | `tests/unit/context-slicing.test.ts` |
| **FR-CTX-002** | Conversation Compaction | `packages/core/src/orchestration/context-manager.ts` | `tests/unit/context-slicing.test.ts` |
| **FR-CTX-003** | Project Memory Persistence | `packages/storage/src/repositories/project-memory-repo.ts` | `tests/unit/project-memory.test.ts` |
| **NFR-PERF-001** | Cold Start Latency | `packages/cli/dist/cli.js` | `scripts/perf/benchmark.ts` (115ms) |
| **NFR-PERF-002** | TUI Input Latency | `packages/tui/src/*` | `scripts/perf/benchmark.ts` (10.5ms) |
| **NFR-PERF-003** | Discovery Latency | `packages/providers/src/*` | `scripts/perf/benchmark.ts` (<1ms) |
| **NFR-PERF-004** | Memory Footprint (RSS) | `packages/core/src/*` | `scripts/perf/benchmark.ts` (93.6MB idle, 93.8MB parallel) |
| **NFR-PERF-005** | DAG Node Overhead | `packages/core/src/orchestration/dag-executor.ts` | `scripts/perf/benchmark.ts` (0.01ms) |
