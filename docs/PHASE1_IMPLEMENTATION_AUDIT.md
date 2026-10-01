# FlappyCode Phase 1 Implementation Audit

## Audit Metadata

- Audit date: 2026-10-01
- Repository: FlappyCode (local working copy `C:\Projects\FlappyCode`, branch `main`)
- Commit/hash: `3134d018c24fccf030e4c072ae9a75b96d8b4c77` (HEAD). **Note:** `git ls-files` returns only 6 tracked files (`README.md` + `docs/*`). All source code, tests, `RULES.md`, `Context.md`, `Changelog.md` and workspace config are **untracked** in git at audit time (`git status` shows `?? packages/`, `?? tests/`, `?? RULES.md`, etc.).
- OS: Windows (win32), Windows 10/11-style environment (`C:\Projects\FlappyCode`), bash shell
- Node version: v24.12.0 (≥ 20 required ✓)
- Package manager/version: pnpm 12.6.0 (npm 11.6.2 also present); lockfile `pnpm-lock.yaml` present
- Test runner: vitest 2.1.9 (`RUN v2.1.9`); build: tsup 8.5.1; TypeScript 5.6.x
- Auditor: Buffy (AI agent, Freebuff/Codebuff), executing `FlappyCode_Phase1_Verification_Audit_Prompt.md`
- Rules files reviewed: `RULES.md` (repository root, 1446 lines), `rules/RULES.md` (nested copy — `diff -q` confirms it is byte-identical to the root file, so no scoped-rule conflict exists)

**Stated assumptions (RULES.md §1.3):**
1. "Phase 1 requirements" = the P0/P1/P2 requirements in `docs/SRS.md`/`docs/PRD.md`/`docs/CLIDesign.md`/`docs/TaskBreakdown.md`. Per PRD §13, **P0 items are the Phase 1 commitment**; P1/P2 items are audited and reported but do not alone block completion.
2. No new external provider API calls were made with the user's real credentials during this audit. Verification used the built-in mock connector, isolated temp-directory/temp-DB runs, and read-only inspection of existing local state. (A pre-existing, previously-configured Groq provider entry in the local DB was observed but not called.)
3. Temporary verification scripts were created under `./audit-temp/`, `./audit-tmp/` and OS temp dirs, and were removed after the audit (per prompt §1.2 cleanup rule).
4. This audit created only the two mandated report documents plus `Context.md`/`Changelog.md` updates (RULES.md §8.1). **No production code, tests, or configuration were modified.**

---

## Executive Verdict

- **PHASE 1 NOT COMPLETE**
- Requirement rows audited: **106** (every Phase 1 requirement in `docs/SRS.md` appears as its own row)
- Implemented (full evidence): **27** rows
- Partially implemented: **44** rows
- Broken (implemented but behavior demonstrably wrong): **9** rows
- Not implemented: **22** rows
- Not verifiable in this environment: **4** rows
- Gap register: **60** gaps, of which **43** are judged blocking against the PRD §13 P0 gate (see `docs/PHASE1_GAPS.md`)

The engine has a real, working foundation (provider discovery, classification, a deterministic free-only router with a hard paid gate, a schema-validated planner, a DAG executor, plan-gate, root-jail, headless exit codes, loopback server), and all 54 tests pass. However, **multiple P0 requirements are broken or absent in the real execution path** — most critically: writes are applied **without diff approval**, the plan-token scope **self-expands when the model targets out-of-plan files**, sandbox path checks **allow absolute-path / sibling-prefix / symlink-directory escapes**, agent shell commands **bypass the approval tier**, there is **no model fallback on 429/error** (P0 FR-RTE-003), the **Reviewer/Tester feedback loop is absent** (P0 FR-ORC-008), **single-model mode is absent** (P0 FR-ORC-004, `--model` flag parsed but ignored), **`Context.md` upkeep never runs** (P0 FR-RUL-004), the **tool audit log is never written** (P0 FR-TOL-004), and **sessions are never created** (P0 FR-CTX-001). Typecheck (`pnpm lint`) also **fails with 8 errors**, and coverage is 47.1 % vs the ≥ 70 % requirement.

---

## Critical Findings

These map to the prompt §22 "high-risk examples" and are each backed by executed evidence (details in §15/§16):

1. **CRITICAL — Diffs are applied with no user approval in the real CLI path.** `FlappyAutoOrchestrator.executeApprovedPlan(runId, cb?)` defaults `approved = true` when no callback is provided, and `cli.ts` calls `engine.executePlan(runId)` **without** a callback. Runtime proof: out-of-plan and in-plan files were written to disk with no diff prompt ever shown (`audit-temp/audit-e2e.js` result: `DIFF APPLIED WITHOUT DIFF-APPROVAL … in-plan file modified=true`). Violates FR-COD-001, FR-RUL-003, US-03.
2. **CRITICAL — Plan token self-expansion defeats plan scope.** In `flappyauto.ts`, when the model writes a file **not** in the approved plan, the orchestrator silently re-issues the PlanToken including the new path (`planGate.issueToken(run, [...files_to_modify, cleanPath])`). Runtime proof: `src/NOT-IN-PLAN.txt` was created although `files_to_modify = ["src/math.ts"]`. Violates SystemArchitecture §6.4 ("an agent cannot exceed the approved scope without a new approval") and FR-RUL-003.
3. **CRITICAL — Filesystem sandbox escapes (P0 FR-TOL-001).** `FsJail.resolveSafePath` uses `normalized.startsWith(canonicalRoot)` without a boundary check. Runtime proof: (a) **absolute path** outside the root → `WROTE OUTSIDE ROOT`; (b) **sibling-prefix** path (`<root>-EVIL/…`) → `WROTE TO SIBLING DIR`; (c) **directory-symlink escape** for a not-yet-existing target → `WROTE OUTSIDE VIA SYMLINK` (realpath check is skipped when the target does not exist). `../` traversal *is* blocked.
4. **CRITICAL — Permission tier "ask" is bypassed for every agent shell command (P0 FR-TOL-003).** `flappyauto.runAgentStep` always calls `shell.execute(cmd, { isUserApproved: true })`. Runtime proof: `PermissionEngine.checkCommand('rm -rf node_modules')` returns `{decision:'ask', isDestructive:true}` yet the command is executed when `isUserApproved:true` is passed (observed execution). Deny-list entries still block. There is also **no permission-prompt UI** anywhere in the CLI.
5. **CRITICAL — Plan approval is auto-granted in non-TTY interactive mode (P0 FR-RUL-003).** `cli.ts` non-TTY branch runs `engine.approvePlan(plan.run_id)` immediately after `submitPrompt`, with no user interaction. Runtime proof: piped input `Fix failing test` executed the full run (stderr: `✖ Task error: Coder agent completed without staging changes.`) with zero approval steps.
6. **CRITICAL — No fallback / no substitution (P0 FR-RTE-003/007/008).** Nothing in the codebase ever calls `router.select` with `excludeModelIds`, ever consumes `rankedCandidates`, ever emits `model.substituted` (grep: schema only), or retries with backoff. Runtime proof: a mock 429 during planning propagates as a fatal error (`Mock 429: Rate limit exceeded. Retry-After: 2`); zero `model.substituted` events. `recordModelError`/`acquireLease` are never called by the execution path, so busy/cooldown state is never populated.
7. **HIGH — Single-model mode / `--model` flag ignored (P0 FR-ORC-004, CLI-004, US-09).** `flappycode run --model <id>` parses the option but `options.model` is never referenced (grep: 0 usages). The TUI model picker renders rows but has no selection binding. `flappyauto` cannot be bypassed at all.
8. **HIGH — No Reviewer/Tester → Coder feedback loop (P0 FR-ORC-008).** Each node performs exactly **one** model completion and one batch of tool calls; there is no loop, no max-3 iteration, no escalation. (Also means no test-fix loop, FR-COD-003.)
9. **HIGH — No agent-to-agent handoff (P0/§7.5).** Captured CompletionRequests prove the Reviewer receives only its own system prompt (role + truncated rules + goal) and `user = node.description`. No upstream task results, file findings, diffs, or test output are passed.
10. **HIGH — `Context.md` is never updated by the engine (P0 FR-RUL-004).** `DocsKeeper.updateContextSummary` has **zero callers**. Runtime proof: after a full run, `Changelog.md` had an entry but `Context.md` was byte-identical.
11. **HIGH — Tool audit log never written (P0 FR-TOL-004).** After a run with 3 tool calls, `SELECT COUNT(*) FROM tool_call_log` = **0**. `auditRepo` is constructed but never used. Additionally, every tool record is stamped `approved_by_user: true` unconditionally in code — fabricated approval metadata (violates FR-RUL-006 / RULES §48).
12. **HIGH — Pool-exhaustion notice with exactly two actions and resume does not exist (P0 FR-RTE-006).** The zero-paid invariant **holds** (runtime exit 4, zero paid calls, `pool.exhausted` event emitted), but the two-action notice screen (`PoolExhaustedScreen`) is never invoked by the CLI, no `resolvePoolExhausted` handling exists anywhere, and paused runs cannot resume. The `serve` layer returns `{"success":true}` for this *and 8 other commands it does not implement* (runtime proof: `POST /v1/commands {"type":"cancelRun"}` → `200 {"success":true,...}`) — a client would believe a grant/resolution happened when nothing occurred.
13. **HIGH — Sessions never created; no resume (P0 FR-CTX-001).** `sessionRepo.createSession` has zero callers; `flappycode sessions list` always prints `Past sessions (0)` (runtime); no `--continue`/`/sessions resume`.
14. **MEDIUM — Build gate failing:** `pnpm lint` (`tsc --noEmit`) exits 2 with 8 errors (`tests/unit/event-bus.test.ts` uses event type `run.started` which does not exist in the protocol union). Coverage 47.1 % overall vs NFR-MNT-001's ≥ 70 % core / ≥ 90 % on router+classifier+permission+RULES gates (actual: router 85.5 %, classifier 80.3 %, rules-loader 67.4 %, docs-keeper 47.5 %, flappyauto 18.0 %, dag-executor 6.9 %).
15. **MEDIUM — Repository hygiene:** all source is git-untracked; no `.github/` CI exists although TaskBreakdown marks P1-A3 (CI) `[x]`; `Context.md` claims "TypeScript strict typechecking passes with 0 errors" — false (see 14).

---

## Requirement Traceability Matrix

Statuses: **I** = IMPLEMENTED · **P** = PARTIALLY IMPLEMENTED · **B** = IMPLEMENTED BUT BROKEN · **N** = NOT IMPLEMENTED · **NV** = NOT VERIFIABLE. Gap IDs refer to `docs/PHASE1_GAPS.md`.

| ID | Requirement | Source | Status | Implementation Evidence | Runtime/Test Evidence | Gap |
|---|---|---|---|---|---|---|
| UI-001 | `flappycode` launches interactive TUI | SRS §3.1 | P | `packages/cli/src/cli.ts` default action, `tui/src/screens/home-screen.ts` | `node dist/cli.js` renders home screen (non-TTY branch exercised; TTY raw-mode branch traced statically only) | GAP-030 |
| UI-002 | TUI shows banner, taglines, prompt input, status bar | SRS §3.1 | I | `banner.ts`, `home-screen.ts`, `status-bar.ts` | Rendered output contains banner/taglines/prompt box/status bar; counts showed `Providers: 1 … Free models: 4` matching DB | — |
| UI-003 | Works over SSH / no true-colour; `NO_COLOR` fallbacks | SRS §3.1 | P | `palette.ts` (`NO_COLOR`, `FLAPPYCODE_PLAIN`, `FLAPPYCODE_ASCII`) | `NO_COLOR=1` render contains zero ANSI escapes ✓; **width-45 render overflows (74/76 visible chars vs 45)**; SSH not tested | GAP-031 |
| CLI-001 | `flappycode` → interactive TUI | SRS §3.2 | I | `cli.ts` | `--version`→0, TUI renders | — |
| CLI-002 | `providers add\|list\|remove\|test\|refresh` | SRS §3.2 | P | `cli.ts` providers subcommands | `add/list/remove/refresh/enable/disable` work at runtime; **`test` subcommand absent** (`providers --help` output) | GAP-032 |
| CLI-003 | `models [--free] [--json]` | SRS §3.2 | I | `cli.ts` models cmd | `models --json` outputs 5 models; `--free` lists 4 ✓ | — |
| CLI-004 | `run "<prompt>" [--model] [--approve-plan] [--json]` | SRS §3.2 | B | `cli.ts` run cmd | exit 3 without flag ✓, exit 5 no providers ✓, exit 4 exhausted ✓, 14/14 pure-NDJSON lines ✓; **`--model` ignored**; usage error exits 1 (documented 2); no 130 | GAP-007, GAP-024 |
| CLI-005 | `serve [--port]` (P1) | SRS §3.2 | I | `cli.ts` serve, `server/src/server.ts` | Server started; endpoints verified (§8) | — |
| CLI-006 | `config`, `doctor`, `--version` | SRS §3.2 | P | `doctor`+`--version` in `cli.ts` | `doctor` runtime OK; **no `config` command** (unknown command silently launches TUI, exit 0) | GAP-033 |
| PI-001 | Connectors: OpenAI-compatible (OpenRouter/Groq/Together/Fireworks/Kilocode/LM Studio/llama.cpp/Azure-style), Anthropic, Google, Ollama local+cloud | SRS §3.3 | P | `providers/src/{openai-compatible,anthropic,google,ollama,mock}.ts`, `profiles.ts` (12 profiles) | Mock discovery + completion verified; real Groq discovery previously persisted in local DB (6 free models); **no Ollama Cloud profile**; Anthropic/Google/Ollama/LM Studio never exercised (no local endpoints/keys) | GAP-034 |
| PI-002 | Each connector: authenticate, listModels, streaming complete, getQuota(optional), healthCheck; tool-call normalisation where supported | SRS §3.3 | P | `types.ts` ProviderConnector; all methods present | Streaming + tool-calls verified for openai-compatible & mock (and code path for Ollama); **Anthropic and Google `complete()` never parse/emit `tool_calls`** (grep: 0 occurrences) → tool-using agents cannot work there | GAP-035 |
| PI-004 | Honest `User-Agent: flappycode/<version>` on every connector | SRS §3.3 | P | UA present in `openai-compatible.ts`, `anthropic.ts` | UA sent (static); **no UA header in `google.ts`/`ollama.ts`**; no live verification of transmitted headers | GAP-036 |
| SI-001 | Secrets in OS keychain; AES-256-GCM file fallback (key in keychain or user passphrase) | SRS §3.4 | P | `storage/src/secrets.ts` | `doctor` → "OS Keychain Active" ✓; fallback AES-GCM works but key is **derived from hostname/username/platform**, not keychain-or-passphrase → offline dictionary-able | GAP-037 |
| SI-002 | Config may reference env vars via `env:NAME` | SRS §3.4 | P | `secrets.ts resolveSecretRef('env:…')` | Mechanism exists, but **no config file loader exists at all** (grep `loadConfig` = 0), so nothing can reference it | GAP-033 |
| SI-003 | LSP integration exposing diagnostics to agents (P1) | SRS §3.4 | N | `tools/lsp-client.ts` (23 lines) | `getDiagnostics()` hard-coded `return []`; `isAvailable()` always false; no call site in orchestrator | GAP-016 |
| SI-004 | MCP client (P1) | SRS §3.4 | N | `tools/mcp-client.ts` (25 lines) | `listTools()` returns `[]`, `callTool()` throws "No MCP server configured"; no SDK dependency, no protocol connection | GAP-017 |
| SI-005 | May act as MCP server (P2) | SRS §3.4 | N | — | Not attempted (P2) | GAP-038 |
| FR-PRV-001 | Add unlimited providers via prompt or config file | SRS §4.1 | I | `cli.ts providers add`, `/providers add` wizard | Added mock provider at runtime; DB persists unlimited rows | — |
| FR-PRV-002 | Validate credentials with specific error | SRS §4.1 | P | `OpenAICompatibleConnector.authenticate()` | Discovery errors surfaced (`Failed to add provider: …`); **`authenticate()` is never invoked on add**; errors are HTTP-status-level, not always specific | GAP-039 |
| FR-PRV-003 | Discovery runs immediately on add | SRS §4.1 | I | `engine.addProvider → registry.discoverProviderModels` | `providers add mock` → "5 models discovered (4 free…)" instantly | — |
| FR-PRV-004 | Disable/hide/remove provider; removal deletes secret | SRS §4.1 | I | `providerRepo.delete` + `secretStore.deleteSecret` in `cli.ts` | Code path traced; `enable/disable` subcommands present | — |
| FR-PRV-005 | Local providers auto-detected on default ports (P1) | SRS §4.1 | P | `ollama.ts` has localhost `/api/tags` probe helper | No wiring into CLI/onboarding (onboarding screen is static text; grep shows no detect call in `cli.ts`) | GAP-040 |
| FR-PRV-006 | Per-provider `data_use_policy` label from bundled updatable list, shown in picker | SRS §4.1 | P | Schema + `profiles.ts defaultDataUsePolicy` + model-picker `⚠ trains` badge | Profiles define policies, but **CLI `providers add` hard-codes `data_use_policy: 'unknown'`**; no bundled/updatable list separate from profiles | GAP-041 |
| FR-PRV-007 | Per-provider health: latency, rolling error rate, last success (P1) | SRS §4.1 | N | `healthCheck()` exists on connectors | **Never called** by any product path (grep: only definitions); no `providers test` | GAP-032 |
| FR-PRV-008 | Per-provider concurrency/rate limits configurable, safe defaults | SRS §4.1 | P | `max_concurrency` column; enforced in `registry.isAvailable` | Enforced (isAvailable uses `cfg.max_concurrency ?? 4`); CLI hard-codes 4; no user-facing config; `rateLimitRpm` in profiles unused | GAP-042 |
| FR-MOD-001 | Fetch full model list, normalise to schema | SRS §4.2 | I | `discoverProviderModels`, connector `listModels` | Mock: 5 models normalised; real Groq models persisted | — |
| FR-MOD-002 | Classifier precedence 1 override > 2 community > 3 pricing > 4 rules; unknown → paid | SRS §4.2 | I | `registry/classifier.ts` | `tests/unit/classifier.test.ts` 6/6 pass; default returns `paid` ✓; community snapshot bundled (`community-models.json`) | — |
| FR-MOD-003 | Registry deduplicated, queryable by tier, cost, context, modality, tools, vision, latency | SRS §4.2 | P | `model-repo.listModels` filters: tier/minContext/tools/vision/provider | Dedup via PK ✓; tier/context/tools/vision filters ✓; **no modality, price/cost or latency filters** | GAP-043 |
| FR-MOD-004 | Free & rate-limited-free rank ahead of paid | SRS §4.2 | I | Router paid-gate filter | `paid-gate.test.ts` 5/5 pass; runtime exhausted result when only paid exists | — |
| FR-MOD-005 | User force-tag `free/paid/disabled`; overrides persist across refresh | SRS §4.2 | N | `registry.setOverride` + `model_override` table + `getOverride` on discovery | **No caller anywhere** (grep): no CLI command, no TUI, no protocol handler → users cannot create overrides | GAP-006 |
| FR-MOD-006 | Revalidate every `revalidateEveryHours` (6) + on demand; disappeared models marked `unavailable` | SRS §4.2 | P | `refreshAllProviders`, `markUnavailable`; config field `revalidate_every_hours` | Manual `providers refresh` ✓ runtime; chaos test proves `unavailable` marking ✓; **no periodic timer exists** (grep `setInterval` = 0) | GAP-005 |
| FR-MOD-007 | Tool-call capability probe before first tool use (P1) | SRS §4.2 | N | `registry/probe.ts probeToolCalling()` | **Never called** (grep): `tool_probe_passed` always `null` | GAP-015 |
| FR-MOD-008 | Status-bar free count = enabled healthy free models | SRS §4.2 | I | `registry.countFreeAvailable`, `status-bar.ts` | Runtime: doctor 4, `models --free` 4, status bar 4 | — |
| FR-RTE-001 | Requirement profile + single best-fit available model | SRS §4.3 | I | `router.select(req)` + `scoring.ts` | Router unit tests + runtime model.selected events per node | — |
| FR-RTE-002 | No opaque quality grade | SRS §4.3 | I | `scoring.ts` transparent weights over declared metadata | Static trace: only declared fields (context, tools, vision, latency, error rate, locality, data policy) | — |
| FR-RTE-003 | Transparent fallback on busy/429/5xx/timeout/quota exhaustion | SRS §4.3 | N | Ranked list produced but **never iterated**; `excludeModelIds` never supplied | Runtime: 429 → fatal error, no substitute; zero `model.substituted` events | GAP-001 |
| FR-RTE-004 | Per-agent binding overrides auto; unavailable pinned model → `fallbackPolicy` (default ask) | SRS §4.3 | P | Router pinned branch (unit-tested) | **No UI/command to bind** (`agents` command absent); `fallback_policy` field never read; unavailable pin silently falls back to auto (no ask) | GAP-007, GAP-044 |
| FR-RTE-005 | Never call paid without explicit user choice/grant | SRS §4.3 | I | `PaidGate` + router filter | Runtime: paid-only pool → `pool.exhausted`, exit 4, **zero paid requests**; `paid-gate.test.ts` 5/5 | — |
| FR-RTE-006 | Exhaustion → pause, notice with **exactly two actions**, resume only after user acts | SRS §4.3 | B | `PoolExhaustedScreen` (2 actions) exists; `resolvePoolExhausted` command schema exists | Pause+zero-paid ✓ (exit 4); **screen never invoked; no resolution handler anywhere; no resume; `serve` fakes `success:true` for the command** | GAP-002 |
| FR-RTE-007 | Model substitutions visible in graph/task log | SRS §4.3 | N | `events.ts model.substituted` schema only | Never emitted (grep); `node.substitutions` always `[]` in all captured events | GAP-003 |
| FR-RTE-008 | Exponential backoff with jitter, honour `Retry-After` | SRS §4.3 | N | — | 429 throws immediately from connector; no retry loop in codebase | GAP-004 |
| FR-RTE-009 | No benchmark/quality/usage data leaves the machine (Phase 1) | SRS §4.3 | I | Grep all `fetch(` call sites | All outbound calls target configured provider base URLs only; no telemetry/update-check endpoints | — |
| FR-ORC-001 | `flappyauto` first in every picker, default for Planner | SRS §4.4 | P | `model-picker.ts` row 0 = flappyauto `[DEFAULT]` | Picker render ✓; but picker is display-only (no selection), so "default" is trivially the only mode | GAP-007 |
| FR-ORC-002 | flappyauto picks planner model, decomposes to graph, assigns specialist agents, router picks per-agent model | SRS §4.4 | I | `flappyauto.startRun/executeApprovedPlan` | Headless JSON run: plan → 4 nodes → `model.selected` per node with correct agent→model mapping | — |
| FR-ORC-003 | Nodes carry id/agent/description/depends_on/status/model_used/tool_calls; independent nodes parallel (bounded), dependents sequential | SRS §4.4 | P | `protocol/tasks.ts`, `dag-executor.ts` | All fields present in runtime events; dependent sequencing ✓; **parallelism never observed at runtime** (DagExecutor 6.9 % covered); concurrency guard over-admits by 1 (`Math.max(1, slotsAvailable)`) | GAP-013 |
| FR-ORC-004 | User can select a single model bypassing flappyauto, same rules apply | SRS §4.4 | N | `--model` option parsed | **`options.model` never referenced**; no picker selection path | GAP-007 |
| FR-ORC-005 | Specialist agents File-Finder, Coder, Reviewer, Tester, Command-Executor (P0); Analyst (P1); Researcher (P2) | SRS §4.4 | I | `agents/agent-definitions.ts` (6 built-ins) | File-Finder→Coder→Tester→Reviewer executed in runtime JSON run; Analyst defined; Researcher absent (P2) | GAP-038 (P2) |
| FR-ORC-006 | Declarative agent definitions loadable from files (name, prompt, tools, model, fallback) | SRS §4.4 | N | — | Only hard-coded `BUILTIN_AGENTS`; no file loader (grep `.flappycode` = 0); no `agent_definition` usage | GAP-008 |
| FR-ORC-007 | Reviewer uses a different model than Coder when possible (P1) | SRS §4.4 | I | `scoring.ts` −50 same-model penalty | `router.test.ts` assertion ✓; runtime: coder=`mock-coder-free`, reviewer=`mock-analyst-free` | — |
| FR-ORC-008 | Reviewer/Tester failure loops back to Coder, max 3 (default), then escalate | SRS §4.4 | N | — | Single completion round per node; no loop, no feedback channel | GAP-009 |
| FR-ORC-009 | Task graph visible live in TUI (agent, status, model) | SRS §4.4 | P | CLI prints `node.started/finished/model.selected` lines during run | Log-line progress exists (headless & interactive); no graph view; status-bar never switches to `working`/`waiting_approval` (grep in cli.ts) | GAP-027 |
| FR-ORC-010 | Run cancellable any time (Esc/Ctrl-C) without corrupting files; partial edits revertible | SRS §4.4 | P | `DagExecutor.cancel()` + AbortSignal; `/undo` + `UndoEngine` | Undo verified by golden-flow test ✓; **Ctrl-C just `process.exit(0)`** — cancel API not wired to any input; undo state is in-memory (lost on restart) | GAP-012, GAP-045 |
| FR-ORC-011 | Planner output schema-validated; invalid → 1 repair, then model fallback | SRS §4.4 | P | `planner.ts` `PlanProposalSchema.parse` + exactly-one repair attempt | Repair path present in code (planner 64.6 % covered); **no model-fallback step** — instead a hard-coded default graph is used | GAP-046 |
| FR-RUL-001 | RULES.md ships with package, loaded at session start; project/nested rules; conflicts flagged | SRS §4.5 | P | `rules-loader.ts` (root → `rules/RULES.md` → default) | Root load verified at runtime (`# Rules test` injected); **package does not bundle rules** (no asset in `packages/cli`); **no nested per-directory rules; `conflicts` always `[]`** | GAP-018 |
| FR-RUL-002 | Rules injected into system prompt of **every** agent | SRS §4.5 | P | `PromptComposer.compose` inserts rules block | Verified present in captured reviewer prompt — but **truncated to first 1200 chars** (+summary suffix); planner receives only **500 chars** | GAP-018 |
| FR-RUL-003 | Plan-before-execution enforced by tool layer (write/delete locked until token exists) | SRS §4.5 | B | `PlanGate`, `FsJail.writeFile/deleteFile` gates | Pre-approval write blocked ✓ (runtime); **non-TTY auto-approve** ✓reproduced; **token self-expansion** ✓reproduced; plan with empty `files_to_modify` issues `['*']` wildcard token | GAP-010, GAP-011 |
| FR-RUL-004 | After each approved change set: update `Context.md`, append timestamped `Changelog.md` | SRS §4.5 | B | `docs-keeper.ts` both methods | Changelog appended ✓ (runtime); **`updateContextSummary` has zero callers → `Context.md` untouched** (runtime byte-compare) | GAP-014 |
| FR-RUL-005 | Stop conditions (destructive ops, breaking API, migrations, rule conflicts) always pause for approval | SRS §4.5 | P | `stop-conditions.ts` (shell destructive + file-op checks) | Destructive classification ✓ (unit-verified) **but bypassed via `isUserApproved:true`**; **breaking-API / migration / rule-conflict detection does not exist** | GAP-010, GAP-047 |
| FR-RUL-006 | Never-do list enforced by tool-layer guards (secret commits blocked, no deletes outside plan, no fabricated results) | SRS §4.5 | P | `git-tool.commit` secret scan; `FsJail.deleteFile` gate | Secret-commit block present (static; `secret-guard.test.ts` ✓); **`approved_by_user: true` hard-coded for every tool call = fabricated approval record** | GAP-021 |
| FR-RUL-007 | Clarifying question is a first-class TUI interaction | SRS §4.5 | N | `question.asked` event schema only | Never emitted; no question UI | GAP-048 |
| FR-RUL-008 | Category rule sections activated by repo detection, manual override (P1) | SRS §4.5 | P | `RulesLoader.detectCategories` (CLI/Frontend/Backend via package.json) | Partial detection works; **only 3 categories; no activation of the actual category rule files; no manual override** | GAP-049 |
| FR-RUL-009 | Headless plan approval requires `--approve-plan`; use recorded in Changelog | SRS §4.5 | P | `cli.ts run` gate | Exit 3 without flag ✓ (runtime); Changelog entry written by DocsKeeper does **not** record the `--approve-plan` use | GAP-050 |
| FR-COD-001 | Multi-file edits shown as unified diff, applied only after approval | SRS §4.6 | B | `DiffEngine.createUnifiedDiff`, `diff.ready` event, `DiffReviewScreen` | Diff computed & event emitted ✓; **applied with no approval in the real CLI path** (runtime proof); `DiffReviewScreen` never imported by cli.ts | GAP-010 |
| FR-COD-002 | Edits atomic per batch; one-key undo restores prior state | SRS §4.6 | P | `applyStagedDiffs` batch write; `UndoEngine`; `/undo` | Golden-flow test proves undo restores content ✓; no git-stash checkpoint; undo not persisted across restart; no hunk-level partial apply | GAP-045 |
| FR-COD-003 | Test-fix loop: run tests → parse failures → patch → re-run, bounded | SRS §4.6 | N | — | No iteration mechanism anywhere (see FR-ORC-008) | GAP-009 |
| FR-COD-004 | Git: status/diff/branch/commit (generated msg)/PR draft; push & force need confirmation; protected branches never pushed silently | SRS §4.6 | P | `git-tool.ts` | status/diff/branch/commit+secret-guard ✓ (static); force-push blocked ✓, main/master push blocked ✓; **push to other branches executes without any confirmation**; **no PR-description drafting**; git tool not exposed to agents (no `git` tool in agent tool list) | GAP-020 |
| FR-COD-005 | LSP diagnostics fed to Coder/Reviewer after edits (P1) | SRS §4.6 | N | — | LSP stub + no call site | GAP-016 |
| FR-COD-006 | Codebase search: lexical P0; semantic index P1 | SRS §4.6 | P | `tools/search-tool.ts` (JS regex scan, jail-scoped) | Lexical search works in isolation, **but `search` is never exposed as an agent tool** (`runAgentStep` registers only read_file/list_files/write_file/execute_command) and no call site exists; no semantic index | GAP-019 |
| FR-COD-007 | Image/screenshot input for vision models (P2) | SRS §4.6 | N | — | Not attempted (P2) | GAP-038 |
| FR-TOL-001 | FS tool rooted at project dir; canonical paths prevent traversal/symlink escape | SRS §4.6 | B | `fs-jail.ts` | `../` blocked ✓; **absolute-path, sibling-prefix and dir-symlink escapes reproduced — writes landed outside root** | GAP-022 |
| FR-TOL-002 | Shell: timeout, output cap, cwd restricted, allow/ask/deny lists | SRS §4.6 | I | `shell-tool.ts`, `permission-engine.ts` | Runtime: timeout killed at 1.0 s (exit 124) ✓; output capped at ~200 000 chars ✓; cwd = project root ✓; deny/allow/ask evaluated ✓; secrets redacted from output ✓ | — |
| FR-TOL-003 | Permission tiers: read auto; writes diff-approved; shell/git per-command approval unless allow-listed; "always allow" memory | SRS §4.6 | B | Tier logic in `PermissionEngine` | Tier logic unit-correct, **but orchestration layer passes `isUserApproved:true` for every model-issued command** (runtime proof) and **no permission prompt UI exists**; `allowCommandPattern` never exposed | GAP-010, GAP-023 |
| FR-TOL-004 | Every tool call written to audit log (tool, args, summary, approved_by_user, ts) | SRS §4.6 | N | `storage/repositories/audit-repo.ts` | 0 rows after a 3-tool-call run (runtime SQL count) | GAP-021 |
| FR-TOL-005 | Browser automation isolated from main session (P2) | SRS §4.6 | N | — | No browser code (P2) | GAP-038 |
| FR-TOL-006 | MCP tools exposed to agents under same permission tiers (P1) | SRS §4.6 | N | — | MCP stub | GAP-017 |
| FR-TOL-007 | Secrets never in prompts; redaction filter on tool output | SRS §4.6 | I | `secret-guard.ts`; key passed as header arg, never into messages | Runtime: `echo <secret>` → `[REDACTED_SECRET]` ✓; prompts captured contain no keys ✓ | — |
| FR-CTX-001 | Sessions stored locally and resumable (`--continue` / `/sessions`) | SRS §4.7 | B | `session-repo.ts`, CLI `sessions list/delete` | `createSession` never called → `sessions list` = 0 (runtime); no resume anywhere | GAP-025 |
| FR-CTX-002 | Context compaction (summarise, don't silently truncate) near window limit | SRS §4.7 | N | `context-manager.ts buildContextSlice` | **Zero callers** (grep); agents get fixed 2-message history regardless of length | GAP-026 |
| FR-CTX-003 | Project memory persists per project and feeds Context.md (P1) | SRS §4.7 | P | `ContextManager.projectMemory` (in-memory Map) | Not persisted to DB, never written to/read from Context.md | GAP-026 |
| FR-CTX-004 | Each agent receives only the context slice it needs (P1) | SRS §4.7 | N | — | No slicing; identical fixed prompt shape for all agents (and no upstream context at all) | GAP-026 |
| FR-INT-001 | Headless `run --json` NDJSON events + meaningful exit codes | SRS §4.8 | P | `cli.ts run` | exit 0/1/3/4/5 verified; 14/14 stdout lines valid JSON ✓; **usage error exits 1 not 2; no 130 cancel code; no `run.failed` event — failure reason invisible in `--json`** | GAP-024, GAP-051 |
| FR-INT-002 | `serve`: local HTTP API (OpenAPI 3) + SSE, `127.0.0.1`, per-launch bearer token | SRS §4.8 | I | `server/src/server.ts` | Runtime: `/health` 200, `/openapi.json` 200, `/v1/registry` 401 w/o token & 200 w/ token, no CORS header, SSE endpoint subscribed; non-loopback bind throws (static) | (fake-ack behavior → GAP-052) |
| NFR-PERF-001 | Cold start ≤ 1.5 s | SRS §5.1 | I | — | `time flappycode --version` → **0.111 s** | — |
| NFR-PERF-002 | TUI input latency ≤ 50 ms; render loop never blocks on network | SRS §5.1 | NV | Redraw is synchronous full-screen write; network only in run path | Not instrumented during audit | GAP-053 |
| NFR-PERF-003 | Discovery ≤ 10 s typical; providers refreshed in parallel (P1) | SRS §5.1 | P | `AbortSignal.timeout(10000)`; `Promise.allSettled` in refresh | Static evidence only; live-network timing not measured (no external calls made) | GAP-053 |
| NFR-PERF-004 | Idle ≤ 250 MB; ≤ 600 MB with 4 agents (P1) | SRS §5.1 | NV | — | Not measured | GAP-053 |
| NFR-PERF-005 | Orchestrator overhead ≤ 200 ms/node (P1) | SRS §5.1 | NV | Runtime node `started_at/ended_at` deltas ~2 ms (mock models) | Not measurable against real model latency in this environment | GAP-053 |
| NFR-REL-001 | Crash mid-run must not corrupt tree; session recoverable | SRS §5.2 | P | Staged-then-apply design (disk untouched until apply) | No crash test performed; no persisted run state to recover from (`task_run`/`task_node` never written — `task-repo` 15 % covered, no callers) | GAP-054 |
| NFR-REL-002 | Any provider failure degrades gracefully (fallback, then notice) — never unhandled | SRS §5.2 | P | CLI try/catch prints `✖ Task error: …` | Graceful *error reporting* verified (429 → clean message, exit 1); **no fallback or notice** — degrades to outright failure | GAP-001 |
| NFR-REL-003 | SQLite WAL + transactions; versioned reversible migrations | SRS §5.2 | I | `db.ts` WAL pragma, `migrations.ts` `schema_version` | Runtime `doctor`: "Connected (WAL mode)" ✓; migrations table applied | — |
| NFR-SEC-001 | Keys only in keychain/encrypted store/env; never logged, prompted, or sent to any FlappyCode server | SRS §5.3 | I | `secrets.ts`, `secret-guard.ts`, no telemetry endpoints | Keychain active (runtime); redaction (runtime); captured prompts contain no keys; no FlappyCode server endpoints exist | — |
| NFR-SEC-002 | Prompt-injection defence: tool output cannot alter permissions/approvals/rules; destructive needs human approval | SRS §5.3 | P | Untrusted-content framing in `PromptComposer`; gates are code-level | Framing exists; **however model output *can* widen approval scope (token self-expansion) and model-issued shell commands skip approval** → control not fully code-enforced | GAP-010, GAP-011 |
| NFR-SEC-003 | Server loopback + bearer token; CORS disabled | SRS §5.3 | I | `server.ts` host guard + auth | Runtime: 401 without token, no `Access-Control-*` headers, loopback-only guard throws on other hosts (static) | — |
| NFR-SEC-004 | Deps scanned in CI (`npm audit`, lockfile pinned) (P1) | SRS §5.3 | P | `pnpm-lock.yaml` present & consistent | **No CI exists** (`.github/` absent); `npm audit` not run as part of repo tooling | GAP-055 |
| NFR-SEC-006 | Logs local, redact secrets, size-rotated | SRS §5.3 | P | Redaction implemented & verified | **No logging subsystem at all** (`--debug` absent), so nothing to rotate; redaction only applies to shell output | GAP-056 |
| NFR-PRV-001 | Phase 1 makes no network calls except configured providers (community list read-only, npm check disableable) | SRS §5.4 | I | Grep all `fetch(`; community snapshot is bundled JSON | Only provider base URLs + localhost are contacted | — |
| NFR-USA-001 | Install → first task < 5 min (P0) | SRS §5.5 | NV | Local build→run works in seconds | npm package not published; fresh-machine install flow untestable here | GAP-057 |
| NFR-USA-002 | Every error states what happened, why, next action | SRS §5.5 | P | Mix of good (`No providers connected yet…`) and opaque (`Coder agent completed without staging changes`) messages | Sampled across runtime runs | GAP-058 |
| NFR-USA-003 | `NO_COLOR`, `FORCE_COLOR`, reduced-motion, ASCII mode (P1) | SRS §5.5 | P | `palette.ts` handles NO_COLOR/PLAIN/ASCII | NO_COLOR ✓ (runtime); **`FORCE_COLOR` unhandled; `FLAPPYCODE_NO_ANIM` unimplemented** (no animation subsystem) | GAP-031 |
| NFR-USA-004 | Never colour-alone (P1) | SRS §5.5 | I | Status bar uses icon+word (`⚡ Ready!`, `✖ …`) | Verified in rendered output | — |
| NFR-POR-001 | Identical core behaviour on Windows/macOS/Linux; platform shell selection | SRS §5.6 | P | `shell-tool.ts` branches `powershell.exe` vs `/bin/sh`; path normalization for both separators | Verified on Windows only; macOS/Linux untested in this audit | GAP-059 |
| NFR-POR-002 | `npm i -g flappycode` without compiler toolchain | SRS §5.6 | P | `optionalDependencies better-sqlite3` + `node:sqlite` fallback; `@napi-rs/keyring` prebuilt; tsup bundle | Design supports it; **`npm pack`/global-install smoke test not run** (package unpublished) | GAP-057 |
| NFR-MNT-001 | Strict TS; lint+format in CI; coverage ≥ 70 % core, ≥ 90 % router/classifier/permission/RULES gates | SRS §5.7 | B | vitest+coverage configured | **`pnpm lint` FAILS (8 errors)**; coverage 47.1 % overall (router 85.5, classifier 80.3, permission 96, plan-gate 95.2, rules-loader 67.4, docs-keeper 47.5, flappyauto 18, dag 6.9); no CI | GAP-055 |
| NFR-MNT-002 | Connectors isolated with recorded-response contract tests | SRS §5.7 | P | Connector modules isolated | Only mock-based chaos tests; **no contract tests for anthropic/google/ollama/openai-compatible** (providers coverage 3–6 %) | GAP-060 |
| NFR-OBS-001 | `doctor` reports environment, keychain, provider reachability, DB integrity, version (P1) | SRS §5.7 | P | `engine.doctor` | Runtime output includes node/db/keychain/providers/free-count/git ✓; **provider reachability not actually probed**; no DB integrity check | GAP-032 |
| NFR-OBS-002 | `--debug` structured local logs (P1) | SRS §5.7 | N | — | Flag/absent; no logging | GAP-056 |

---

## 1. Provider & Model Pool Foundation

**What works (verified):**
- Four real connector implementations + one mock + 12 provider profiles (`openrouter, groq, together, fireworks, kilocode, lm-studio, llama-cpp, openai, anthropic, google, ollama, mock`).
- Honest `User-Agent: flappycode/0.1.0` on openai-compatible and anthropic connectors.
- Discovery → classification → SQLite registry → free-count is a real, wired path (runtime: `providers add mock` → 5 models, 4 free; pre-existing Groq config shows 6 free models discovered from the real API).
- Classifier precedence exactly as specified, default `paid` (6 unit tests pass).
- Live-state (cooldown/error-rate/concurrency) data structures exist but **are never populated by the execution path**.

**What fails:** see §13 matrix. Key gaps: no Ollama Cloud profile; health/quota functions never invoked; no periodic revalidation; no user overrides; Anthropic/Google lack tool-call normalisation; Google/Ollama lack User-Agent.

## 2. Multi-Agent Orchestration Engine

- Planner produces schema-validated JSON graphs with exactly one repair attempt; falls back to a hard-coded 1-node graph (not model fallback).
- DAG executor schedules by `depends_on`, supports cancel() (unwired), max concurrency 4 (off-by-one over-admission).
- Agents: 6 built-ins present; all participate in the real graph (runtime events show File-Finder/Coder/Tester/Reviewer executing).
- **Missing:** agent loop is one-shot (no multi-turn tool conversation), no handoff of upstream results, no feedback loop, no declarative agent files, no per-agent binding UI, no single-model mode, search tool not exposed to agents.
- **Handoff evidence:** captured Reviewer request = system(role+truncated rules+goal) + user(`"Review src/auth.ts changes"`). Nothing else.

## 3. FlappyAuto / Fallback / RULES Enforcement

- `flappyauto` is effectively the only orchestration mode (it is first in the picker and the sole implemented path), it selects a planner model via the router, builds the graph, routes each node, and emits typed events. **Executed end-to-end** (mock, headless): plan → approve → 4 nodes → completion, plus a failing variant.
- **Fallback:** structurally absent (GAP-001/003/004). The router returns a ranked list nobody consumes.
- **RULES:** loaded from project root at runtime and injected (truncated) into every agent prompt; plan gate blocks unapproved writes; deny-list and secret redaction enforceable; **but** plan approval is bypassable (non-TTY), plan scope self-expands, diff approval missing, permission "ask" tier bypassed, `Context.md` upkeep never runs, audit log never written, no conflict detection, rules not shipped inside the npm package.

## 4. Agentic Coding Capabilities

| Capability | Status | Key evidence |
|---|---|---|
| Multi-file edit with diff + approval | BROKEN | diff computed, **auto-applied** in real path (runtime) |
| Atomic batch + undo | Partial | golden-flow undo test passes; in-memory only |
| Test/fix loop | Not implemented | no loop in code |
| Semantic search Q&A | Not implemented (P1); lexical works but unexposed to agents | `search-tool.ts` has no call site |
| LSP diagnostics | Stub (P1) | returns `[]` always |
| Command execution | Works, approvals bypassed | timeout/cap/cwd verified; `isUserApproved:true` always |
| Git-aware ops | Partial | status/diff/branch/commit+secret-guard; push unconfirmed; no PR draft; git not an agent tool |
| Multi-file refactoring sequencing | Partial (by graph only) | `depends_on` sequencing exists; no dependency analysis of imports |
| Browser/Researcher | Not implemented (P2) | no browser code |
| Vision input | Not implemented (P2) | no image path |

## 5. Tool & Sandbox Layer

- **Filesystem:** plan-gated writes work; jail **escapes reproduced** (absolute path, sibling prefix, dir symlink). `../` traversal blocked.
- **Shell:** spawn without shell interpolation of model text (args array), timeout kill (verified 1.0 s → exit 124), output cap (~200 kB, verified), cwd = project root, deny/ask/allow, secret redaction (verified), env passed through (inherits full `process.env` — no env scrubbing, minor note).
- **Git:** as above; `git push --force*` and `rm -rf /` deny patterns verified; destructive classification verified (`git reset --hard` → ask).
- **Search:** jail-scoped JS scan; binary files skipped only via try/catch.
- **LSP/MCP/Browser:** stubs or absent.
- **Audit trail:** none written.

## 6. CLI / TUI

Verified: `--version` (0.1.0), `--help`, `providers add/list/remove/refresh/enable/disable`, `models [--free|--json|--provider|--tier]`, `doctor`, `sessions list/delete`, `run`, `serve`, TUI home render (banner, taglines, input box, status bar with true counts), onboarding card when 0 providers, `NO_COLOR` monochrome.
Missing vs `CLIDesign.md` §5.1: `agents`, `config`, `upgrade`, `providers test`, `sessions resume`, `--continue`; slash commands limited to `/models /providers /rules /undo /exit` (no `/plan /diff /status /agents /sessions /new /help`); model picker is display-only (no keyboard selection, no bind-to-agent); **diff review, permission prompt, clarifying question, pool-exhausted, completion-summary and live task-graph screens are never displayed** (`DiffReviewScreen`, `PoolExhaustedScreen` not imported by `cli.ts`; no permission/question screen exists); status bar never leaves `ready`/`no_providers` states; narrow-width (<70) rendering overflows at 45 cols.
Unknown commands (`flappycode badcmd`, `flappycode config`, `flappycode agents`) silently launch the TUI with exit 0 instead of a usage error.

## 7. Headless Mode

| Case | Expected | Actual (measured) |
|---|---|---|
| success | 0 | **Not reachable via CLI with mock** (mock Coder never stages edits without programmatic canned tool-calls → run fails). Success path only proven in-process. |
| task failure | 1 | **1** ✓ (stderr suppressed in `--json`) |
| no providers | 5 | **5** ✓ |
| plan approval required | 3 | **3** ✓ |
| pool exhausted (paid available) | 4 | **4** ✓, zero paid calls, `pool.exhausted` event only |
| usage error | 2 | **1** ✗ |
| cancellation | 130 | **not implemented** ✗ |
| `--json` output | valid NDJSON | **14/14 lines valid JSON, no mixed UI text** ✓ |
| `--cwd` | honoured | flag parsed; `FlappyEngine({projectRoot})` wired ✓ (static) |
| `--model` | selects model | **ignored** ✗ |

## 8. Local Server Mode

All measured live (`flappycode serve --port 4499`):
- Binds `127.0.0.1` ✓ (constructor throws for any other host — static ✓)
- Per-launch random bearer token printed ✓
- `GET /health` → 200 (unauthenticated, by design) ✓
- `GET /openapi.json` → OpenAPI 3.0 document ✓
- `GET /v1/registry` without token → **401** ✓; with token → 200 + registry payload ✓
- `POST /v1/commands` without token → **401** ✓
- No `Access-Control-*` headers (CORS disabled) ✓
- `GET /v1/events` SSE endpoint accepts authenticated subscribers (no events occurred during the 2 s sample; SSE behavior covered by `server.test.ts` 5/5)
- **Defect:** 10 of 12 protocol commands are acknowledged with `{"success":true}` although unimplemented (e.g. `cancelRun`, `approveDiff`, `resolvePoolExhausted`), and there is **no command that executes an approved plan** → server mode cannot complete a task end-to-end.

## 9. Persistence / Context / Sessions

- Providers/models/overrides tables persist across processes (verified: temp-DB provider survived multiple CLI invocations; real DB retains Groq config + models).
- Keychain secrets persist (real provider: "OS Keychain Active").
- `usage_local` rows written per completion (`recordUsage`), though tokens-in is hard-coded `100`.
- **Sessions never created** (0 rows, runtime), tasks/nodes never persisted (`task-repo` has no callers), tool log empty, project memory in-memory only, agent definitions not persisted.
- Restart-reconstruction of a run is therefore impossible.

## 10. Security / Permissions / Secrets

- Verified good: plan-gate pre-approval block, deny-list, allow-list, ask-gate at tool level, shell timeout/output-cap, secret redaction, secret-in-commit block, loopback server auth, keys in keychain, prompts contain no keys, no telemetry endpoints, non-loopback server bind rejected, force-push blocked, main/master push blocked.
- Verified broken: 3 sandbox escapes, permission-tier bypass for agent shell commands, non-TTY plan auto-approval, plan-scope self-expansion, fabricated `approved_by_user:true`, no audit log, encrypted-file fallback key derived from machine identity (not passphrase), full `process.env` passed to child processes.

## 11. Privacy

Static scan of every `fetch()` call site: endpoints are provider base URLs (configured by the user) and localhost only. `community-models.json` is bundled (no periodic download code). No update check, no analytics, no FlappyCode server, no benchmark upload, no API-key exfiltration path. **Phase 1 privacy requirement (NFR-PRV-001, PRD §4.3) holds.**

## 12. Test / Build Verification

| Command | Result |
|---|---|
| `pnpm run lint` (`tsc --noEmit`) | **FAIL — exit 2, 8 errors** in `tests/unit/event-bus.test.ts` (event `run.started` not in protocol union) |
| `pnpm test` (`vitest run`) | **PASS — 13 files, 54/54 tests, 1.06 s** |
| `pnpm run build` (`pnpm -r run build`) | **PASS** — all 7 packages bundle (cli dist 25.24 KB) |
| `npx vitest run --coverage` | **PASS but below target** — All files 47.1 % stmts; core/src 70.54 %; key files: router 85.5, classifier 80.3, permission-engine 96, plan-gate 95.2, rules-loader 67.4, docs-keeper 47.5, flappyauto 18.0, dag-executor 6.9, secrets 27.6, audit-repo 15.6, session-repo 12.8 |
| Missing entirely | lint/format config (none), CI (`.github/` absent despite TaskBreakdown P1-A3 `[x]`), integration tests for connectors, TUI interactive tests (layout.test covers 60/80/120 static only), e2e golden-task benchmark (P1-J1) |

Test-quality notes: `chaos-mock.test.ts` "zero paid calls" assertion uses a local variable `paidCallExecuted` that nothing ever sets (tautological); `golden-flow.test.ts` never executes the DAG (it hand-calls `stageChange`/`applyStagedDiffs`), so **no test proves the real plan→execute→diff→apply path** — which is exactly where the critical defects live.

## 13. Provider-by-Provider Verification Matrix

`N/A` only where the documented interface genuinely lacks the capability.

| Provider (profile) | Connector Exists | Auth Works | Discovery Works | Completion Works | Tool Calls | Health | Quota | Classification | Fallback Tested | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| OpenRouter (via openai-compatible) | ✓ | ✓ (code; not live-tested) | ✓ (code, `/models`) | ✓ (code path shared w/ Groq) | ✓ (OpenAI schema) | implemented, **never called** | header-based, **never called** | profile `:free`/0-price rule + community | **no fallback exists** | PARTIAL |
| Groq (openai-compatible) | ✓ | ✓ (**live evidence**: real key in keychain, models present) | ✓ **live evidence** (6 free models in local DB) | shared code path (not called during audit) | ✓ | implemented, uncalled | uncalled | profile rule (whisper/safeguard excluded) | no | PARTIAL |
| Together AI | ✓ | code only | code only | shared code | ✓ | uncalled | uncalled | default→paid (no profile rule) → community/metadata | no | PARTIAL (static) |
| Fireworks | ✓ | code only | code only | shared | ✓ | uncalled | uncalled | default paid-until-proven | no | PARTIAL (static) |
| Kilocode | ✓ | code only | code only | shared | ✓ | uncalled | uncalled | default paid-until-proven | no | PARTIAL (static) |
| Ollama (local) | ✓ (native) | N/A (no auth by design) | ✓ code (`/api/tags`) | ✓ code | ✓ (parses `message.tool_calls`) | uncalled | N/A (local) | `isLocal → free` | no | PARTIAL (static; no local Ollama here) |
| LM Studio (profile) | ✓ (profile→openai-compatible) | localhost, key optional | code | shared | ✓ | uncalled | uncalled | `freeClassifierRule: true` | no | PARTIAL (static) |
| llama.cpp (profile) | ✓ (profile) | localhost | code | shared | ✓ | uncalled | uncalled | free rule | no | PARTIAL (static) |
| Anthropic | ✓ | code (`x-api-key`) | code (`/models`) | code | **✗ not normalised** (0 `tool_calls` handling) | uncalled | N/A (`getQuota` absent) | default paid (no free rule) | no | PARTIAL/BROKEN for tools |
| Google AI Studio | ✓ | code (`x-goog-api-key`) | code | code | **✗ not normalised** | uncalled | absent | flash free rule | no | PARTIAL/BROKEN for tools; no UA |
| OpenAI (profile) | ✓ (profile) | code | code | shared | ✓ | uncalled | uncalled | default paid | no | PARTIAL (static) |
| Ollama Cloud | **✗ no profile/connector** | — | — | — | — | — | — | — | — | NOT IMPLEMENTED (PRD lists it) |
| Azure OpenAI / AWS Bedrock | N/A | — | — | — | — | — | — | — | — | N/A — explicitly P2 in SRS PI-003 |
| Mock harness | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | exercised (429/5xx/disappear) | IMPLEMENTED (test double only) |

## 14. Agent-by-Agent Verification Matrix

| Agent | Definition | Loaded | Real Execution | Model Binding | Tools | RULES Enforced | Handoff | Tests | Status |
|---|---|---|---|---|---|---|---|---|---|
| Planner / FlappyAuto | `TaskPlanner` + orchestrator | ✓ | ✓ runtime | router picks planner model ✓; no pin UI | none (text-only plan) | rules excerpt (500 chars) in prompt | N/A | planner covered 64.6 %; golden test | IMPLEMENTED (fallback-to-model missing) |
| File-Finder | ✓ builtin | ✓ | ✓ (node executed in run) | `flappyauto` only | read/list exposed; **`search` not exposed** | injected (truncated) | receives nothing upstream | no dedicated test | PARTIAL |
| Coder/Editor | ✓ builtin | ✓ | ✓ (tool-call staging + markdown fallback) | `flappyauto` only | read/list/write; **`fs_delete` declared but never registered** | injected | receives nothing upstream | golden test bypasses real path | PARTIAL (stages without diff approval) |
| Reviewer | ✓ builtin | ✓ | ✓ runtime (different model) | `flappyauto` only | `git_diff` declared but **not registered**; read/list only | injected | **none** (proven) | scoring penalty test only | PARTIAL |
| Tester | ✓ builtin | ✓ | ✓ (shell tool runs) | `flappyauto` only | shell_exec ✓ (auto-approved) | injected | none | none | PARTIAL |
| Command-Executor | ✓ builtin | ✓ | reachable via graph | `flappyauto` only | shell_exec (auto-approved) | injected | none | none | PARTIAL |
| Codebase-Analyst (P1) | ✓ builtin | ✓ | reachable (used as reviewer model in run) | `flappyauto` only | read/list; search unexposed | injected | none | none | PARTIAL |
| Researcher / Browser (P2) | ✗ | — | — | — | — | — | — | — | NOT IMPLEMENTED (P2) |

No agent can be assigned its own model through any product surface; `preferred_model_ref` is hard-coded `'flappyauto'` for all agents.

## 15. Evidence: Commands Executed

```text
# Governance / repo state
diff -q RULES.md rules/RULES.md            → identical
git rev-parse HEAD                          → 3134d018c24fccf030e4c072ae9a75b96d8b4c77
git ls-files | wc -l                        → 6 (README + docs only)
find packages tests -name '*.ts'            → 75 source files (~7.1k LOC), 13 test files (~1.2k LOC)

# Build / verify
pnpm run lint                               → FAIL exit 2 (8 TS errors in tests/unit/event-bus.test.ts)
pnpm test                                   → PASS 13 files / 54 tests / 1.06 s
pnpm run build                              → PASS (all 7 packages)
npx vitest run --coverage                   → PASS; All files 47.1 % stmts

# CLI (isolated temp LOCALAPPDATA DB)
node packages/cli/dist/cli.js --version                 → 0.1.0, exit 0
node packages/cli/dist/cli.js --help                    → command list
node packages/cli/dist/cli.js badcmd                    → TUI banner, exit 0 (should be usage error)
node packages/cli/dist/cli.js run                       → "missing required argument 'prompt'", exit 1 (doc says 2)
node packages/cli/dist/cli.js run "hello"               → "No providers connected", exit 5 ✓
node packages/cli/dist/cli.js providers add mock        → "5 models discovered (4 free…)", exit 0
node packages/cli/dist/cli.js models --free             → 4 models; status/doctor counts = 4 ✓
node packages/cli/dist/cli.js run "Fix failing test"    → "Approval required…--approve-plan", exit 3 ✓
node packages/cli/dist/cli.js run ... --approve-plan --json → exit 1; 14/14 stdout lines valid JSON
node packages/cli/dist/cli.js run ... (all tiers=paid)  → exit 4; only event = pool.exhausted; 0 paid calls ✓
node packages/cli/dist/cli.js sessions list             → "Past sessions (0)"
node packages/cli/dist/cli.js providers refresh         → "Catalogs refreshed. Free models available: 4"
node packages/cli/dist/cli.js config | agents           → silently launch TUI, exit 0
printf 'Fix failing test\n' | node dist/cli.js          → ran without ANY approval prompt (auto-approve)
time node dist/cli.js --version                         → real 0.111 s

# Serve (live)
flappycode serve --port 4499                → listening 127.0.0.1, token printed
curl /health                                 → 200
curl /openapi.json                           → 200 OpenAPI 3.0
curl /v1/registry (no token)                 → 401
curl /v1/registry (Bearer token)             → 200 + registry JSON
curl -D - /v1/registry                       → no Access-Control-* headers ✓
curl -X POST /v1/commands {"type":"cancelRun"} (authed) → 200 {"success":true,"command":"cancelRun"} ← unimplemented
curl -N /v1/events (Bearer)                  → SSE stream accepted

# Temporary audit scripts (cleaned up)
node audit-temp/audit-security.js            → 14/19 pass; failures: absolute-path escape, sibling-prefix escape,
                                               dir-symlink escape, destructive-cmd executed with isUserApproved
node (targeted retest)                       → TIMEOUT kill at 1.0 s exit 124 ✓; output cap 200 080 chars ✓
node audit-temp/audit-e2e.js                 → 10/16 pass; failures: diff auto-applied, out-of-plan write executed,
                                               Context.md untouched, tool_call_log = 0 rows, no model.substituted
node (handoff capture)                       → Reviewer request = role prompt + "Review src/auth.ts changes" only
node (piped non-TTY run)                     → executed full run with zero approval interaction
NO_COLOR=1 render check                      → 0 ANSI escapes ✓
width=45 render check                        → visible lines of 74 and 76 chars (overflow) ✗
```

## 16. Evidence: Test Results

```text
RUN  v2.1.9 C:/Projects/FlappyCode
 ✓ tests/tui/layout.test.ts (6)         ✓ tests/unit/permission-engine.test.ts (5)
 ✓ tests/unit/plan-gate.test.ts (5)     ✓ tests/unit/router.test.ts (3)
 ✓ tests/unit/classifier.test.ts (6)    ✓ tests/unit/secret-guard.test.ts (2)
 ✓ tests/unit/paid-gate.test.ts (5)     ✓ tests/unit/event-bus.test.ts (4)
 ✓ tests/unit/fs-jail.test.ts (5)       ✓ tests/unit/diff-undo.test.ts (3)
 ✓ tests/integration/golden-flow.test.ts (1)
 ✓ tests/chaos/chaos-mock.test.ts (4)
 ✓ tests/unit/server.test.ts (5)
 Test Files 13 passed (13) | Tests 54 passed (54) | Duration 1.06 s

Coverage (v8): All files 47.1 % stmts / 68.32 % branch
  core/src 70.54 % · router 85.54 % · classifier 80.32 % · permission-engine 96 %
  plan-gate 95.23 % · rules-loader 67.44 % · docs-keeper 47.45 %
  flappyauto 18.03 % · dag-executor 6.93 % · git-tool 24.44 % · secrets 27.64 %
  audit-repo 15.62 % · session-repo 12.82 % · task-repo 15 %

Coverage vs NFR-MNT-001 target (≥70 % core; ≥90 % router/classifier/permission/RULES gates):
  router 85.5 % ✗ · classifier 80.3 % ✗ · permission-engine 96 % ✓ · plan-gate 95.2 % ✓ ·
  rules-loader 67.4 % ✗ · docs-keeper 47.5 % ✗ · overall 47.1 % ✗
```

Known weak tests (test-quality audit): tautological zero-paid assertion in chaos test; golden-flow test bypasses the DAG executor and the diff-approval path entirely; `event-bus.test.ts` does not typecheck; no test covers `flappyauto.ts`'s agent-step or tool-execution code (18 % coverage of the file that contains all critical defects).

## 17. Remaining Risks

1. Windows-only verification: macOS/Linux shell, path and keychain behavior untested (NFR-POR-001).
2. Real-provider completion paths (Groq/OpenRouter/Anthropic/Google/Ollama) not exercised with live calls during this audit; only discovery for Groq has historical live evidence.
3. TTY interactive branch (raw-mode plan approval keyboard flow) verified by static trace only.
4. SSE long-run stability and event ordering under concurrency not load-tested.
5. `better-sqlite3` optional dependency is disabled in `pnpm-workspace.yaml allowBuilds`; runtime relies on `node:sqlite` (Node 22+). On Node 20 (the documented minimum) **both adapters may be unavailable** — `node:sqlite` does not exist in Node 20 → startup failure risk (NFR/POR: engines say ≥20).
6. All source is untracked in git: no commit-level history/review for any code audited.
7. Child processes inherit the full environment (`shell-tool.ts`), risking secret exposure to spawned tooling.

## 18. Final Acceptance Decision

# `PHASE 1 NOT COMPLETE`

**Critical blockers:**
1. Diffs/edits are applied to disk without user diff approval in the real CLI path (FR-COD-001, FR-RUL-003) — GAP-010.
2. Plan-token scope self-expands to out-of-plan files on model request (FR-RUL-003 / SystemArchitecture §6.4) — GAP-011.
3. Filesystem sandbox escapes: absolute-path, sibling-prefix, directory-symlink (FR-TOL-001) — GAP-022.
4. Agent shell commands bypass the permission "ask" tier (`isUserApproved:true` hard-wired); no permission prompt exists (FR-TOL-003) — GAP-010/GAP-023.
5. Plan approval auto-granted in non-TTY interactive mode (FR-RUL-003) — GAP-010.
6. No model fallback/substitution/backoff on 429/5xx/timeout/quota/disappearance (FR-RTE-003/007/008) — GAP-001/003/004.
7. No Reviewer/Tester → Coder feedback loop and no test-fix loop (FR-ORC-008, FR-COD-003) — GAP-009.
8. Single-model mode absent; `--model` flag ignored (FR-ORC-004, CLI-004) — GAP-007.
9. `Context.md` upkeep never executed; tool audit log never written; approval flags fabricated (FR-RUL-004, FR-TOL-004, FR-RUL-006) — GAP-014/021.
10. Pool-exhaustion two-action notice + resume flow not wired; serve fakes success for unimplemented commands (FR-RTE-006) — GAP-002/052.
11. Sessions never created / no resume (FR-CTX-001) — GAP-025.
12. Typecheck fails and coverage targets are missed (NFR-MNT-001) — GAP-055.

**Non-blocking gaps:**
1. P1 items not yet wired: LSP (SI-003), MCP (SI-004), capability probe (FR-MOD-007), health checks (FR-PRV-007), semantic search (FR-COD-006), category rule activation (FR-RUL-008), debug logging (NFR-OBS-002).
2. P2 items absent as planned: Researcher/Browser, vision input, MCP server.
3. UX defects: narrow-terminal overflow, missing slash commands, static model picker, status-bar state machine unused, unknown-command handling, usage exit code 2.
4. Registry filter completeness (modality/cost/latency), periodic revalidation timer, user tier overrides.
5. Data-use policy wiring (`'unknown'` hard-coded on add), Ollama Cloud profile missing, UA header missing on 2 connectors.

**Recommended verification after fixes:**
1. Re-run this audit's automated probes: sandbox escape script (`../`, absolute, sibling, symlink-dir), diff-approval e2e (assert file unchanged until `approveDiff`), plan-scope e2e (assert out-of-plan write blocked), permission-bypass probe (assert `ask` throws without user answer), and the full headless exit-code matrix (0/1/2/3/4/5/130) incl. a reachable success path.
2. Add chaos/fallback integration tests that drive the real `executeApprovedPlan` (not hand-staged calls): 429 storm, model disappearance mid-run, all-exhausted pool — asserting `model.substituted` events, zero paid calls, and two-action notice + resume.
3. Fix `pnpm lint`, raise coverage to targets (esp. `flappyauto.ts`/`dag-executor.ts`), then run `npm pack` + global-install smoke on Windows/macOS/Linux, and verify `Context.md`/`Changelog.md` updates from an actual product run.
