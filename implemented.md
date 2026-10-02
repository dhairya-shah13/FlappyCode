# PHASE-1

## Verdict

**PHASE 1 NOT COMPLETE** — The codebase has made enormous progress since the prior audit (1 Oct 2026), fixing **58 of 60** identified gaps. However, key P0 blockers remain: missing LICENSE file, stale README, all source git-untracked, and missing CLI subcommands.

**Counts (111 requirements audited):**

| Priority | ✅ IMPL | 🟡 PARTIAL | 🔴 BROKEN | ⛔ NOT IMPL | ⚪ NOT VERIFIABLE | Total |
|----------|---------|-----------|-----------|-------------|-------------------|-------|
| P0       | 38      | 5         | 0         | 2           | 6                 | 51    |
| P1       | 15      | 3         | 0         | 2           | 5                 | 25    |
| P2       | 1       | 0         | 0         | 3           | 1                 | 5     |
| NFR      | 14      | 4         | 0         | 1           | 11                | 30    |
| **Total**| **68**  | **12**    | **0**     | **8**       | **23**            | **111** |

**Top blockers (P0 only):**

| # | ID | Blocker |
|---|------|---------|
| 1 | P1-I1 / PRD §13 | README/quickstart not completed to "published" standard; LICENSE file missing (Apache-2.0 mentioned but no file) |
| 2 | TaskBreakdown §2.7 item 10 | "README + quickstart published" is unticked — documentation not release-ready |
| 3 | CLI commands | `upgrade` command missing; `agents show`/`agents bind` subcommands missing |
| 4 | End-to-end simulation | Cannot be fully verified without real providers — mock harness tests pass but no executed E2E evidence of the full TUI interactive flow |
| 5 | Source tracking | All source code is still git-untracked (same as prior audit) — not committed to the repository |

---

## Audit metadata

| Item | Value |
|------|-------|
| Audit date | 2026-10-02 |
| OS | Windows (win32) |
| Node version | v24.12.0 (≥ 20 ✓) |
| pnpm version | 12.6.0 |
| Git branch | `main` |
| Git status | Source files untracked in git |
| Mocks used | Built-in `MockProviderConnector`, fixture-based LSP/MCP servers, in-memory SQLite |
| What could NOT be tested | Real provider API calls, real terminal layout, macOS/Linux platform paths, memory profiling, real-model golden-task success rate, npm global install from tarball |

---

## Quality gate results

### Lint (tsc --noEmit)
```
$ pnpm lint → tsc --noEmit → exit 0 (0 errors)
```
**Verdict: ✅ PASS** — Prior audit found 8 errors; now 0.

### Build
```
$ pnpm build → 7 packages built successfully → exit 0
```
**Verdict: ✅ PASS**

### Tests
```
$ pnpm test → Test Files: 58 passed (58) / Tests: 397 passed (397)
Duration: 25.73s (no failures, no skips, no .todo)
```
**Verdict: ✅ PASS** — Matches claimed 397 tests / 58 files exactly. Zero skipped/todo tests.

### Coverage (vitest --coverage)

| Module | Stmts % | Target | Status |
|--------|---------|--------|--------|
| **All files** | **73.30%** | ≥70% | ✅ |
| Router (core/src/router) | 94.11% | ≥90% | ✅ |
| Classifier | 100% | ≥90% | ✅ |
| PermissionEngine | 96.00% | ≥90% | ✅ |
| PlanGate | 95.55% | ≥90% | ✅ |
| RulesLoader | 96.17% | ≥90% | ✅ |
| flappyauto.ts | 70.10% | — | ℹ️ |
| cli.ts | 0% | — | ⚠️ CLI not covered by unit tests |
| DocsKeeper | 66.10% | — | ℹ️ Below 70% |

**Verdict: ✅ PASS** — Overall ≥70% met; all safety-critical modules ≥90% met.

### CI Workflow
File `.github/workflows/ci.yml` exists (968 bytes), matrix: `ubuntu-latest`, `macos-latest`, `windows-latest` × Node `20`, `22`.

**Verdict: ✅ PRESENT** — BUT `.github/` is untracked in git (won't run until committed).

---

## What is implemented

### Providers & registry (FR-PRV, FR-MOD)

| ID | Requirement | Pri | Status | Evidence |
|----|-------------|-----|--------|----------|
| FR-PRV-001 | Unlimited providers via prompt/config | P0 | ✅ | `providers add mock --key test` works; DB row created |
| FR-PRV-002 | Validate on add with specific errors | P0 | ✅ | `connectors.test.ts` covers 400/401/403/429/500 |
| FR-PRV-003 | Immediate discovery on success | P0 | ✅ | `engine.ts:addProvider()` calls `registry.discoverModels()` |
| FR-PRV-004 | Disable/hide/remove; remove deletes secret | P0 | ✅ | `provider-repo.ts:remove()` + `secrets.deleteSecret()` wired |
| FR-PRV-005 | Local auto-detect (Ollama/LM Studio/llama.cpp) | P1 | ✅ | `detector.ts`, `provider-detection.test.ts` (4 tests) |
| FR-PRV-006 | `data_use_policy` label | P0 | ✅ | `community-models.json`, model-picker renders `⚠ trains` |
| FR-PRV-007 | Provider health tracking | P1 | ✅ | `provider-health-repo.ts`, `provider-health.test.ts` (5 tests) |
| FR-PRV-008 | Per-provider rate limits & concurrency | P0 | ✅ | `rate-limiter.ts` token bucket + semaphore |
| FR-MOD-001 | Fetch/normalise model list | P0 | ✅ | All 4 connector types + mock |
| FR-MOD-002 | Classifier precedence (unknown=paid) | P0 | ✅ | `classifier.test.ts` (12 tests) |
| FR-MOD-003 | Registry deduplicated, queryable | P0 | ✅ | SQL queries with tier/modality/tools filters |
| FR-MOD-004 | Free ranked ahead of paid | P0 | ✅ | `router.test.ts`, `paid-gate.test.ts` |
| FR-MOD-005 | User force-tag free/paid/disabled | P0 | ✅ | `model-overrides.test.ts` (4 tests) |
| FR-MOD-006 | Revalidation every 6h | P0 | ✅ | `IntervalScheduler` wired in `engine.ts:220` |
| FR-MOD-007 | Capability probe (tool-call round-trip) | P1 | ✅ | `stage-f-probe.test.ts` (3 tests), tri-state cached |
| FR-MOD-008 | Status bar free model count | P0 | ✅ | `status-bar.ts` TUI screen tests |

### Routing, fallback & pool exhaustion (FR-RTE)

| ID | Requirement | Pri | Status | Evidence |
|----|-------------|-----|--------|----------|
| FR-RTE-001 | Best-fit selection from requirement profile | P0 | ✅ | `router.test.ts` |
| FR-RTE-002 | No quality grade stored | P0 | ✅ | grep: no "quality_grade" in schema |
| FR-RTE-003 | Transparent fallback on busy/rate-limited/errors | P0 | ✅ | `FallbackExecutor` (490 lines); `stage-b-fallback.test.ts` (22 tests) |
| FR-RTE-004 | Per-agent binding overrides | P0 | ✅ | `router.ts:needsUserDecision`, `fallback-executor.ts` |
| FR-RTE-005 | Never call paid without explicit user choice | P0 | ✅ | `paid-gate.test.ts` (5), `chaos-mock.test.ts` |
| FR-RTE-006 | Pool exhaustion: pause, notice with 2 actions | P0 | ✅ | `PoolExhaustedScreen` wired in `cli.ts:287-355`, `engine.resolvePoolExhausted` |
| FR-RTE-007 | Substitutions visible and recorded | P0 | ✅ | `model.substituted` event, `task_node.substitutions` column |
| FR-RTE-008 | Exponential backoff + jitter + Retry-After | P0 | ✅ | `fallback-executor.ts:100-125` |
| FR-RTE-009 | No benchmark/usage data transmitted | P0 | ✅ | grep: only `telemetry` mention is a comment |

### Orchestration & agents (FR-ORC)

| ID | Requirement | Pri | Status | Evidence |
|----|-------------|-----|--------|----------|
| FR-ORC-001 | `flappyauto` first in picker, default | P0 | ✅ | `model-picker.ts`, `flappyauto.ts` |
| FR-ORC-002 | Task graph decomposition | P0 | ✅ | `golden-flow.test.ts`, `stage-c-orchestration.test.ts` |
| FR-ORC-003 | Parallel/sequential execution | P0 | ✅ | `dag-concurrency.test.ts` (timing overlap proved) |
| FR-ORC-004 | Single-model mode | P0 | ✅ | `single-model.test.ts` (4 tests) |
| FR-ORC-005 | 5 specialist agents | P0 | ✅ | `agent-definitions.ts` — all 5 P0 agents |
| FR-ORC-005 | Codebase-Analyst | P1 | 🟡 | Definition only; no semantic index |
| FR-ORC-005 | Researcher/Browser | P2 | ✅ | `stage-f-researcher-browser.test.ts` (6 tests) |
| FR-ORC-006 | Declarative agents from files | P0 | ✅ | `declarative-agents.test.ts` (6 tests) |
| FR-ORC-007 | Reviewer prefers different model | P1 | ✅ | `flappyauto.ts`, router scoring |
| FR-ORC-008 | Feedback loop (max 3 iterations) | P0 | ✅ | `feedback-loop.test.ts` (2 tests) |
| FR-ORC-009 | Live task graph in TUI | P0 | ✅ | `task-graph.ts`, `stage-c-screens.test.ts` |
| FR-ORC-010 | Cancellation without corruption | P0 | ✅ | `cancellation.test.ts` (3 tests); exit 130 |
| FR-ORC-011 | Planner validation + repair | P0 | ✅ | `planner-repair.test.ts` (3 tests) |

### Rules & governance (FR-RUL)

| ID | Requirement | Pri | Status | Evidence |
|----|-------------|-----|--------|----------|
| FR-RUL-001 | RULES.md loaded; conflict flagged | P0 | ✅ | `rules-loader.test.ts` (4), `rules-conflict.test.ts` (5) |
| FR-RUL-002 | Rules injected into every agent prompt | P0 | ✅ | `prompt-composer.ts`, `flappyauto.ts:893` |
| FR-RUL-003 | Plan-before-execution enforced | P0 | ✅ | `plan-gate.test.ts` (5), `fs-jail.ts:83-95` |
| FR-RUL-004 | Context.md + Changelog.md updated | P0 | ✅ | `docs-keeper.ts` wired in `flappyauto.ts` |
| FR-RUL-005 | Stop conditions pause for approval | P0 | ✅ | `stop-conditions.ts`, `flappyauto.ts:609,757,1423` |
| FR-RUL-006 | Never-do list enforced | P0 | ✅ | `secret-guard.ts`, `fs-jail.ts`, `permission-engine.ts` |
| FR-RUL-007 | Clarifying questions | P0 | ✅ | `question-tool.test.ts` (4 tests) |
| FR-RUL-008 | Category-specific rules (10 categories) | P1 | ✅ | `category-rules.test.ts`, 10 files in `cli/assets/rules/categories/` |
| FR-RUL-009 | Headless `--approve-plan` | P1 | ✅ | `stage-e-headless.test.ts` |

### Coding & tools (FR-COD, FR-TOL)

| ID | Requirement | Pri | Status | Evidence |
|----|-------------|-----|--------|----------|
| FR-COD-001 | Multi-file diff preview; applied after approval | P0 | ✅ | `diff-review.ts`, `diff-undo.test.ts` (3) |
| FR-COD-002 | Atomic undo per batch | P0 | ✅ | `undo-persistence.test.ts` (2) |
| FR-COD-003 | Test-fix loop (bounded) | P0 | ✅ | `feedback-loop.test.ts` |
| FR-COD-004 | Git operations with safety | P0 | ✅ | `git-tool.test.ts` (6) — push/force/secret guards |
| FR-COD-005 | LSP diagnostics | P1 | ✅ | `stage-f-lsp.test.ts` (7) — real JSON-RPC stdio |
| FR-COD-006 | Search tool | P0 | 🟡 | `search-tool.ts` exists; 13.33% coverage |
| FR-TOL-001 | FsJail: no traversal/symlink escape | P0 | ✅ | `fs-jail.test.ts` (5) — boundary, symlink, Windows |
| FR-TOL-002 | Shell tool with timeout, output cap | P0 | ✅ | Unit + integration tests |
| FR-TOL-003 | Permission tiers (deny/ask/allow) | P0 | ✅ | `permission-engine.test.ts` (5) |
| FR-TOL-004 | Audit log (tool_call_log) | P0 | ✅ | `audit-repo.ts`, `flappyauto.ts:1265` |
| FR-TOL-005 | Browser automation (headless) | P2 | ✅ | `stage-f-researcher-browser.test.ts` |
| FR-TOL-006 | MCP tools with permission tiers | P1 | ✅ | `stage-f-mcp.test.ts` (7) |
| FR-TOL-007 | Secret redaction | P0 | ✅ | `secret-guard.test.ts` (2) |

### Context & sessions (FR-CTX)

| ID | Requirement | Pri | Status | Evidence |
|----|-------------|-----|--------|----------|
| FR-CTX-001 | Sessions stored/resumed | P0 | ✅ | `sessions.test.ts` (6), CLI `sessions list/resume/delete` |
| FR-CTX-002 | Context compaction at ~80% | P0 | ✅ | `context-slicing.test.ts` (8) |
| FR-CTX-003 | Project memory persists | P1 | 🟡 | `project-memory-repo.ts` (56.25% coverage) |
| FR-CTX-004 | Per-agent context slices | P1 | ✅ | `context-slicing.test.ts` |

### Interfaces: headless, serve (FR-INT)

| ID | Requirement | Pri | Status | Evidence |
|----|-------------|-----|--------|----------|
| FR-INT-001 | Headless `run` with `--json`, exit codes | P1 | ✅ | `stage-e-headless.test.ts` (9) — exit 0/1/3/4/5/130 |
| FR-INT-002 | `serve` with loopback, bearer token, SSE | P1 | ✅ | `server.test.ts`, `stage-e-server.test.ts` |

### TUI Screens

| Screen | Status | Coverage |
|--------|--------|----------|
| Home screen (zones A–E) | ✅ | 96.77% |
| Banner (FLAPPY/CODE) | ✅ | 100% |
| Status bar | ✅ | 78.26% |
| Onboarding wizard | ✅ | 97.14% |
| Model picker | ✅ | 86.66% |
| Plan approval | ✅ | 100% |
| Task graph | ✅ | 97.7% |
| Diff review | ✅ | 100% |
| Permission prompt | ✅ | 92.3% |
| Pool exhausted | ✅ | 100% |
| Question prompt | ✅ | 100% |

### CLI Commands

| Command | Status |
|---------|--------|
| `run [prompt]` (--model, --approve-plan, --json, --cwd) | ✅ |
| `serve [--port]` | ✅ |
| `providers add\|list\|remove\|test\|refresh\|enable\|disable` | ✅ |
| `models [--free --provider --json --tier]` | ✅ |
| `models tag\|untag` | ✅ |
| `agents list` | ✅ |
| `agents show` | ⛔ NOT IMPLEMENTED |
| `agents bind` | ⛔ NOT IMPLEMENTED |
| `config get\|set\|edit\|path` | ✅ |
| `sessions list\|resume\|delete` | ✅ |
| `doctor [--json]` | ✅ |
| `upgrade` | ⛔ NOT IMPLEMENTED |
| `--version` | ✅ (returns `0.1.0`) |
| Phase 2 commands (login/logout/whoami/telemetry) | ✅ CORRECTLY ABSENT |

### Non-functional (selected)

| ID | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| NFR-REL-003 | SQLite WAL + versioned migrations | ✅ | `db.ts:221` `PRAGMA journal_mode = WAL`; 3 migrations |
| NFR-SEC-001 | Keys in keychain/encrypted store | ✅ | AES-256-GCM with scrypt + random per-install salt |
| NFR-SEC-003 | Server loopback + bearer token | ✅ | `127.0.0.1`, per-launch token, CORS off |
| NFR-SEC-006 | Logs redact secrets, size-rotated | ✅ | `logger.ts` SecretGuard redaction |
| NFR-PRV-001 | No outbound except providers | ✅ | No telemetry code paths |
| NFR-POR-001 | Cross-platform | ✅ | `cross-platform.test.ts` (6 tests) |
| NFR-MNT-001 | Coverage ≥70% / ≥90% safety | ✅ | 73.3% overall; all 5 safety modules ≥90% |
| NFR-MNT-002 | Connector contract tests | ✅ | 4 contract files (20 tests) |
| NFR-USA-002 | Error messages what/why/next | ✅ | `stage-e-errors.test.ts` |
| NFR-USA-003 | NO_COLOR, ASCII, reduced motion | ✅ | `terminal-compat.test.ts` |
| NFR-PERF-001–005 | Performance metrics | ⚪ | Need real terminal/memory measurement |

---

## Gap register reconciliation (GAP-001…060)

| GAP | Prior Status | Verified | Notes |
|-----|-------------|----------|-------|
| GAP-001 | COMPLETED | ✅ | `FallbackExecutor` exists and is wired; 35 tests |
| GAP-002 | COMPLETED | ✅ | `PoolExhaustedScreen` wired in CLI; `resolvePoolExhausted` in engine + server |
| GAP-003 | COMPLETED | ✅ | Backoff + jitter + Retry-After in `fallback-executor.ts` |
| GAP-004 | COMPLETED | ✅ | `model.substituted` events emitted |
| GAP-005 | COMPLETED | ✅ | `IntervalScheduler` wired in `engine.ts:220` |
| GAP-006 | COMPLETED | ✅ | `models tag/untag` commands work; overrides persist |
| GAP-007 | COMPLETED | ✅ | Single-model mode: `single-model.test.ts` (4 tests) |
| GAP-008 | COMPLETED | ✅ | Declarative agents load from files |
| GAP-009 | COMPLETED | ✅ | Feedback loop with max iterations |
| GAP-010 | COMPLETED | ✅ | Permission screens wired |
| GAP-011 | COMPLETED | ✅ | PlanToken self-expansion blocked |
| GAP-012 | COMPLETED | ✅ | Cancel → exit 130 |
| GAP-013 | COMPLETED | ✅ | Concurrency guard in DAG executor |
| GAP-014 | COMPLETED | ✅ | DocsKeeper wired |
| GAP-015 | COMPLETED | ✅ | CapabilityProbe with tri-state |
| GAP-016 | COMPLETED | ✅ | Real LSP client with JSON-RPC |
| GAP-017 | COMPLETED | ✅ | Real MCP client with stdio |
| GAP-018 | COMPLETED | ✅ | Full rules bundling + conflict detection |
| GAP-019 | COMPLETED | ✅ | Search tool added to correct agent scopes |
| GAP-020 | COMPLETED | ✅ | Git tool with safety guards |
| GAP-021 | COMPLETED | ✅ | Audit log wired in `flappyauto.ts:1265` |
| GAP-022 | COMPLETED | ✅ | FsJail boundary + symlink + Windows fixes |
| GAP-023 | COMPLETED | ✅ | Approval gates wired |
| GAP-024 | COMPLETED | ✅ | Exit code contract (0/1/2/3/4/5/130) |
| GAP-025 | COMPLETED | ✅ | Sessions persisted |
| GAP-026 | COMPLETED | ✅ | Context compaction + recovery |
| GAP-027 | COMPLETED | ✅ | Live task graph in TUI |
| GAP-028 | COMPLETED | ✅ | Child process env sanitization |
| GAP-029 | N/A | ✅ | `better-sqlite3` → `node:sqlite` fallback in `db.ts:170-201` |
| GAP-030 | COMPLETED | ✅ | PTY interactive tests |
| GAP-031 | COMPLETED | ✅ | Terminal multi-resolution tests |
| GAP-032 | COMPLETED | ✅ | Provider diagnostics + health state |
| GAP-033 | COMPLETED | ✅ | Real config system |
| GAP-034 | COMPLETED | ✅ | Ollama Cloud profile |
| GAP-035 | COMPLETED | ✅ | Anthropic/Google tool-call normalization |
| GAP-036 | COMPLETED | ✅ | User-Agent header on all requests |
| GAP-037 | COMPLETED | ✅ | AES-256-GCM with scrypt + random salt |
| GAP-038 | COMPLETED | ✅ | Researcher/Browser implemented |
| GAP-039 | COMPLETED | ✅ | Authenticate before discovery |
| GAP-040 | COMPLETED | ✅ | Local provider auto-detection |
| GAP-041 | COMPLETED | ✅ | Bundled data-use policy |
| GAP-042 | COMPLETED | ✅ | Token bucket rate limiter |
| GAP-043 | COMPLETED | ✅ | Modality/latency/price filters |
| GAP-044 | COMPLETED | ✅ | Agent fallbackPolicy |
| GAP-045 | COMPLETED | ✅ | SQLite-backed undo engine |
| GAP-046 | COMPLETED | ✅ | Planner repair + fallback |
| GAP-047 | COMPLETED | ✅ | Stop conditions implemented |
| GAP-048 | COMPLETED | ✅ | Clarifying questions tool |
| GAP-049 | COMPLETED | ✅ | 10 category-specific rules |
| GAP-050 | COMPLETED | ✅ | Changelog.md appended |
| GAP-051 | COMPLETED | ✅ | Structured run.failed events |
| GAP-052 | COMPLETED | ✅ | Honest server command handling |
| GAP-053 | OPEN | ⚪ | Performance metrics require real measurement |
| GAP-054 | COMPLETED | ✅ | Session recovery |
| GAP-055 | COMPLETED | ✅ | Typecheck + coverage targets met |
| GAP-056 | COMPLETED | ✅ | Structured JSON logging |
| GAP-057 | COMPLETED | ✅ | Package asset smoke test |
| GAP-058 | COMPLETED | ✅ | Error formatting (what/why/next) |
| GAP-059 | COMPLETED | ✅ | Cross-platform tests |
| GAP-060 | COMPLETED | ✅ | Connector contract tests |

**Summary: 58/60 gaps verified as fixed. GAP-029 was pre-existing (verified). GAP-053 remains NOT VERIFIABLE.**

---

## New gaps found

| ID | Description | Severity | Blocking P0? |
|----|-------------|----------|-------------|
| NEW-001 | No LICENSE file (Apache-2.0 or MIT) in repository root | HIGH | YES |
| NEW-002 | `agents show` and `agents bind` CLI subcommands missing | MEDIUM | NO |
| NEW-003 | `upgrade` CLI command missing | LOW | NO |
| NEW-004 | README status badge says "Planning Phase" — stale | MEDIUM | YES |
| NEW-005 | All source code still git-untracked | HIGH | YES |
| NEW-006 | `rate-limiter.ts` coverage at 33.33% — below core target | LOW | NO |
| NEW-007 | `search-tool.ts` coverage at 13.33% — JS fallback barely tested | MEDIUM | NO |
| NEW-008 | `community-catalog.json` uses `tier: "flagship"/"strong"/"balanced"` not `free/paid/disabled` | LOW | NO |

---

## Definition-of-Done check (TaskBreakdown §2.7)

| # | Item | Status |
|---|------|--------|
| 1 | `npm install -g flappycode` works on Win/Mac/Linux | 🟡 CLI builds; not published to npm |
| 2 | Home screen matches mockup zones A–E | ✅ |
| 3 | Add ≥3 providers incl. one local; pool + status correct | ✅ |
| 4 | `flappyauto` default; single-model mode; per-agent binding | ✅ |
| 5 | Zero paid calls in pool-exhaustion tests; notice shows 2 actions | ✅ |
| 6 | No write/delete without approved plan (automated test) | ✅ |
| 7 | Context.md and Changelog.md maintained | ✅ |
| 8 | No API key in prompts, logs, or outbound traffic | ✅ |
| 9 | Undo restores prior state | ✅ |
| 10 | README + quickstart published | ❌ |

---

## Recommended next actions

**Priority 1 (P0 blockers — must fix before release):**
1. Add `LICENSE` file with Apache-2.0 text
2. Update README — change "Planning Phase" badge, add quickstart, provider setup guides
3. Commit all source to git — `git add` all packages, tests, config, RULES.md, assets
4. Update ~20 stale TaskBreakdown checkboxes

**Priority 2 (Should fix):**
5. Add `agents show <name>` and `agents bind <agent> --model <id>` CLI subcommands
6. Improve `search-tool.ts` test coverage (JS fallback path)
7. Run `npm pack` + global install test on clean system
8. Measure cold-start time and memory usage (GAP-053)

**Priority 3 (Nice to have):**
9. Add `upgrade` command
10. Add semantic index for Codebase-Analyst (P1-D8)
11. Improve `rate-limiter.ts` test coverage
