# FlappyCode Phase 1 Independent Acceptance Audit

**Audit Date:** 2026-10-03  
**Auditor:** Independent Antigravity Forensic Auditor  
**Repository:** FlappyCode (`c:\Projects\FlappyCode`)  
**Target Specification:** FlappyCode Phase 1 Core CLI / TUI / Local Orchestration Engine  

---

## 1. Executive Verdict

```text
PHASE 1 NOT ACCEPTED
```

### High-Level Summary
FlappyCode Phase 1 has made immense engineering progress. The core governance and safety engines—including the **Filesystem Jail** (`FsJail`), **Secret Sanitization** (`SecretGuard`), **Model Classifier & Paid Gate**, **Plan Gate & Scope Token Enforcement**, **Deterministic Rules Engine** (`RULES.md`), and **Reviewer/Tester Feedback Loop**—are genuinely implemented, rigorously wired, and fully verified by automated tests and live adversarial runtime simulations.

However, an adversarial, evidence-based audit of the **actual user-facing production execution paths** reveals **3 critical/high-severity P0 defects** that directly violate mandatory Phase 1 release gate criteria:

1. **CRITICAL (P0): Single-Model Mode Locks Out Tool Execution (FR-ORC-004 / PRD US-09)**  
   When running `flappycode run "task" --model <model> --approve-plan`, the orchestrator bypasses the planner agent by initializing `files_to_modify: []`. `PlanGate.issueToken()` issues a token with an empty scope array. When the Coder agent attempts to write files, `executeToolCall` evaluates `this.planGate.validateScope(token, file)` which rejects every modification with `PlanGate Blocked: Cannot write to <path> — not in approved plan`. As a result, the Coder agent cannot stage changes, and the command aborts with error: `Coder agent completed without staging changes` (Exit Code 1).
2. **HIGH (P0): Interactive Model Picker Selection is Completely Unwired (UI-002 / FR-ORC-004)**  
   In the interactive TUI, `/models` renders `ModelPickerScreen` claiming `↑↓ move ↵ select`, but `cli.ts` merely attaches `await waitForAnyKey()` and immediately transitions back to the home screen. Users cannot select or switch models interactively.
3. **HIGH (P0): Custom Provider ID Connector Resolution Defect (FR-PRV-001 / FR-PRV-002)**  
   In `engine.ts` (`addProvider`), connector lookup calls `this.registry.getConnector(cfg.id)` instead of `cfg.type`. Because custom-named providers are not yet in SQLite, lookup falls back to `'openai-compatible'`, causing validation to fail with `Endpoint unreachable` when registering mock or local connectors under custom IDs.
4. **MEDIUM (P0/P1): Session Resumption Is Display-Only (FR-CTX-001)**  
   `flappycode sessions resume <id>` merely prints metadata to stdout and exits with code 0. It does not launch the TUI or restore the active conversation REPL.

Because mandatory P0 requirements are broken in the live execution path, Phase 1 **cannot be accepted** in its current state.

---

## 2. Environment Tested

- **OS:** Windows 11 Pro (win32 x64)
- **Node.js:** v24.12.0
- **Package Manager:** pnpm v12.6.0 (npm v11.6.2)
- **Git Commit / Hash:** `83dfc200ae3a7bcf7b4474773c2a68882df6ae57` (`HEAD`, branch `main`)
- **Git Status:** Clean working tree (0 uncommitted changes)
- **Test Runner:** Vitest v2.1.9
- **Bundler:** tsup v8.5.1
- **TypeScript:** v5.6.3 (`strict: true`)

---

## 3. Phase 1 Contract

The authoritative requirements contract is established by:
- `docs/PRD.md` (Product Requirements Document)
- `docs/SRS.md` (Software Requirements Specification)
- `docs/SystemArchitecture.md` (Architecture Specification)
- `docs/CLIDesign.md` (CLI / TUI Interaction Specification)
- `docs/TaskBreakdown.md` (Phase 1 Work Breakdown Structure)
- `docs/PHASE1_GAPS.md` (Gap Register)
- `docs/RULES-EXPLAINER.md` & `RULES.md` (Governance Engine Contract)

### Mandatory Phase 1 Release Gate Criteria (PRD §13 / SRS §1.3):
1. **All P0 requirements implemented and functional.**
2. **Clean packaging and installation** on clean prefix outside repository.
3. **Zero known data-loss or security vulnerabilities.**
4. **Deterministic `RULES.md` software-layer enforcement.**
5. **Free model pool exhaustion cannot trigger paid calls.**
6. **Real end-to-end `flappyauto` lifecycle functioning**:
   $$\text{CLI} \to \text{Plan} \to \text{Approval} \to \text{Execution} \to \text{Diff} \to \text{Approval} \to \text{Write} \to \text{Review/Test} \to \text{Doc Upkeep}$$
7. **Documented CLI commands and exit codes work as specified.**

---

## 4. Commands Executed

The following audit commands were executed directly against the workspace:

```powershell
# 1. Typecheck and Lint
pnpm lint

# 2. Production Monorepo Build
pnpm build

# 3. Automated Test Suite Execution
pnpm test

# 4. Test Coverage Analysis
pnpm test:coverage

# 5. Packaging & Clean External Environment Smoke Test
cd packages/cli
npm pack
# Extracted & installed to $env:LOCALAPPDATA\Temp\flappy-install-test-*
node_modules/.bin/flappycode --version
node_modules/.bin/flappycode doctor

# 6. Live Adversarial Runtime Simulations
# - Filesystem Jail Path Traversal & Symlink Attacks
# - SecretGuard Environment Variable & Prompt Scrubbing
# - Real SQLite Tool Audit Logging
# - Transient 429 Backoff & Persistent 429 Model Substitution
# - Pool Exhaustion & Paid Gate Blockade
# - Headless CLI Execution (--approve-plan, diff approval, rejected diffs)
# - Single-Model Mode Bypass & Plan Token Scope Test
```

---

## 5. Test Results

### Automated Unit, Integration, & Contract Tests
- **Test Files:** 66 passed (100%)
- **Total Tests:** 474 passed (100%)
- **Failing Tests:** 0
- **Skipped / Todo Tests:** 0

### Test Coverage Analysis
| Package / Module | Lines | Statements | Branches | Functions |
| :--- | :---: | :---: | :---: | :---: |
| `@flappycode/core` | 76.54% | 76.54% | 76.81% | 89.24% |
| - `routing/model-router.ts` | 97.02% | 97.02% | 96.22% | 100.00% |
| - `routing/paid-gate.ts` | 93.93% | 93.93% | 91.66% | 100.00% |
| - `classification/classifier.ts` | 100.00% | 100.00% | 100.00% | 100.00% |
| - `permissions/permission-engine.ts` | 96.00% | 96.00% | 90.00% | 100.00% |
| - `rules/plan-gate.ts` | 95.55% | 95.55% | 94.44% | 100.00% |
| - `rules/rules-loader.ts` | 96.17% | 96.17% | 95.23% | 100.00% |
| - `docs/docs-keeper.ts` | 100.00% | 100.00% | 100.00% | 100.00% |
| `@flappycode/cli` | 63.85% | 63.85% | 64.91% | 76.92% |
| `@flappycode/tui` | 74.20% | 74.20% | 74.50% | 85.71% |
| **Total Monorepo Average** | **74.02%** | **74.02%** | **74.11%** | **88.12%** |

---

## 6. Runtime Simulation Results

### Simulation A: Filesystem Sandboxing (`FsJail`)
- **Parent Traversal (`../outside.txt`):** BLOCKED with `JailViolationError`.
- **Absolute Outside Root (`C:\Windows\temp.txt`):** BLOCKED with `JailViolationError`.
- **Sibling Prefix Attack (`<root>-evil/payload.ts`):** BLOCKED with `JailViolationError`.
- **Symlink Directory Escape:** Target resolved via `fs.realpathSync`; traversal outside boundary BLOCKED.

### Simulation B: Secret Leakage & Environment Sanitization (`SecretGuard`)
- Shell tool environment sanitization strips `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, etc.
- Log outputs and prompt strings containing regex tokens matching API keys (`sk-proj-...`, `gsk_...`) are automatically redacted to `[REDACTED_API_KEY]`.

### Simulation C: Real Tool Audit Logging
- Real executions of `file_write`, `file_read`, and `run_command` were audited against SQLite storage.
- Verified 12 records inserted into `tool_call_log` containing `call_id`, `tool_name`, `input_params`, `approved_by_user`, `status`, and `timestamp`.

### Simulation D: Model Fallback & Cooldown
- **Transient 429:** Router retries with exponential backoff on the active model.
- **Persistent 429 / Quota Exhaustion:** Router trips model circuit, marks cooldown, selects the next eligible free model, and emits `model.substituted`.
- **No Paid Selection:** Paid models are strictly skipped in free tier pools.

### Simulation E: Pool Exhaustion
- Exhausted all mock free models.
- Execution immediately paused; emitted `pool.exhausted` event.
- Orchestration threw `PoolExhaustedError`.
- Exactly 0 requests reached paid models.

### Simulation F: Diff Approval Workflow
- When user rejects diff (`approve: false`), staging is discarded and disk remains untouched.
- When user approves diff (`approve: true`), staged contents are committed to disk, and `Changelog.md` and `Context.md` are deterministically updated.

### Simulation G: Reviewer / Tester Feedback Loop
- When Reviewer agent outputs `VERDICT: FAIL`, the orchestrator captures feedback, increments iteration counter, emits `feedback.iteration`, and re-invokes Coder agent with review feedback.

---

## 7. Requirements Traceability Matrix

| Requirement ID | Summary Description | Priority | Source | Implementation File | Wired? | Tests? | Runtime Evidence | Status |
| :--- | :--- | :---: | :--- | :--- | :---: | :---: | :---: | :---: |
| **FR-PRV-001** | Provider discovery & registration | P0 | SRS §3.1 | `packages/core/src/registry/provider-registry.ts` | **PARTIAL** | Yes | Connector lookup uses `id` instead of `type` | **PARTIALLY IMPLEMENTED** |
| **FR-PRV-002** | Credential secure storage & deletion | P0 | SRS §3.1 | `packages/core/src/security/keyring.ts` | **YES** | Yes | AES-256 encrypted SQLite storage | **IMPLEMENTED** |
| **FR-MOD-001** | 4-tier model classification | P0 | SRS §3.2 | `packages/core/src/classification/classifier.ts` | **YES** | Yes | Free, rate-limited, paid, disabled tiers enforced | **IMPLEMENTED** |
| **FR-MOD-002** | Paid model safety blockade | P0 | SRS §3.2 | `packages/core/src/routing/paid-gate.ts` | **YES** | Yes | 0 paid calls emitted under free exhaustion | **IMPLEMENTED** |
| **FR-ROU-001** | Free-tier pooled routing & selection | P0 | SRS §3.3 | `packages/core/src/routing/model-router.ts` | **YES** | Yes | Healthy free models selected by latency/priority | **IMPLEMENTED** |
| **FR-ROU-002** | Automatic substitution & backoff | P0 | SRS §3.3 | `packages/core/src/routing/model-router.ts` | **YES** | Yes | Emits `model.substituted` on failure | **IMPLEMENTED** |
| **FR-ROU-003** | Free pool exhaustion pause | P0 | SRS §3.3 | `packages/core/src/routing/model-router.ts` | **YES** | Yes | Throws `PoolExhaustedError`, pauses execution | **IMPLEMENTED** |
| **FR-ORC-001** | `flappyauto` multi-agent DAG workflow | P0 | SRS §3.4 | `packages/core/src/orchestration/flappyauto.ts` | **YES** | Yes | Planner $\to$ Coder $\to$ Reviewer $\to$ Tester | **IMPLEMENTED** |
| **FR-ORC-002** | Plan generation & user approval gate | P0 | SRS §3.4 | `packages/core/src/rules/plan-gate.ts` | **YES** | Yes | No writes occur before plan approval | **IMPLEMENTED** |
| **FR-ORC-003** | Staged diff generation & user approval | P0 | SRS §3.4 | `packages/core/src/orchestration/flappyauto.ts` | **YES** | Yes | Unapproved diffs do not touch disk | **IMPLEMENTED** |
| **FR-ORC-004** | Single-model mode bypass | P0 | SRS §3.4 | `packages/core/src/orchestration/flappyauto.ts` | **BROKEN** | Partial | Empty PlanToken blocks all Coder writes | **BROKEN** |
| **FR-SEC-001** | Filesystem sandboxing (`FsJail`) | P0 | SRS §3.5 | `packages/core/src/security/fs-jail.ts` | **YES** | Yes | Traversal, absolute outside, symlink attacks blocked | **IMPLEMENTED** |
| **FR-SEC-002** | Shell command permissions & sanitization | P0 | SRS §3.5 | `packages/core/src/permissions/permission-engine.ts` | **YES** | Yes | Allow/ask/deny policies & env scrubbing | **IMPLEMENTED** |
| **FR-SEC-003** | Persistent tool audit logging | P0 | SRS §3.5 | `packages/core/src/storage/sqlite-storage.ts` | **YES** | Yes | Real invocations written to SQLite `tool_call_log` | **IMPLEMENTED** |
| **FR-RUL-001** | `RULES.md` discovery & software layer enforcement | P0 | SRS §3.6 | `packages/core/src/rules/rules-loader.ts` | **YES** | Yes | Category rules, blocked actions deterministically evaluated | **IMPLEMENTED** |
| **FR-DOC-001** | Automatic `Context.md` / `Changelog.md` upkeep | P0 | SRS §3.7 | `packages/core/src/docs/docs-keeper.ts` | **YES** | Yes | Updated upon approved diff write | **IMPLEMENTED** |
| **FR-CLI-001** | Command-line interface & doctor command | P0 | SRS §3.8 | `packages/cli/src/cli.ts` | **YES** | Yes | `flappycode --version`, `doctor`, `models`, `run` | **IMPLEMENTED** |
| **FR-CLI-002** | Headless mode execution & exit codes | P0 | SRS §3.8 | `packages/cli/src/cli.ts` | **YES** | Yes | JSON output, exit codes 0, 1, 2, 3, 4, 130 | **IMPLEMENTED** |
| **FR-TUI-001** | Full-screen interactive terminal interface | P0 | SRS §3.9 | `packages/tui/src/tui-app.ts` | **YES** | Yes | Ink-based UI, multi-screen router | **IMPLEMENTED** |
| **FR-CTX-001** | Session persistence & resumption | P0 | SRS §3.10 | `packages/core/src/storage/sqlite-storage.ts` | **PARTIAL** | Yes | Resume prints metadata and exits without TUI | **PARTIALLY IMPLEMENTED** |

---

## 8. P0 Status

| Requirement ID | Summary Description | Status | Blocking Phase 1? |
| :--- | :--- | :---: | :---: |
| **FR-PRV-001** | Provider discovery & custom ID registration | **PARTIALLY IMPLEMENTED** | **YES** |
| **FR-PRV-002** | Credential secure encryption & deletion | **IMPLEMENTED** | NO |
| **FR-MOD-001** | 4-tier model classification system | **IMPLEMENTED** | NO |
| **FR-MOD-002** | Paid model safety blockade | **IMPLEMENTED** | NO |
| **FR-ROU-001** | Free-tier pooled routing | **IMPLEMENTED** | NO |
| **FR-ROU-002** | Automatic substitution & backoff | **IMPLEMENTED** | NO |
| **FR-ROU-003** | Free pool exhaustion pause | **IMPLEMENTED** | NO |
| **FR-ORC-001** | `flappyauto` multi-agent DAG workflow | **IMPLEMENTED** | NO |
| **FR-ORC-002** | Plan generation & user approval gate | **IMPLEMENTED** | NO |
| **FR-ORC-003** | Staged diff generation & user approval | **IMPLEMENTED** | NO |
| **FR-ORC-004** | Single-model mode bypass execution | **BROKEN** | **YES** |
| **FR-SEC-001** | Filesystem sandboxing (`FsJail`) | **IMPLEMENTED** | NO |
| **FR-SEC-002** | Shell command permissions & sanitization | **IMPLEMENTED** | NO |
| **FR-SEC-003** | Persistent tool audit logging | **IMPLEMENTED** | NO |
| **FR-RUL-001** | `RULES.md` software layer enforcement | **IMPLEMENTED** | NO |
| **FR-DOC-001** | `Context.md` / `Changelog.md` upkeep | **IMPLEMENTED** | NO |
| **FR-CLI-001** | Command-line interface & doctor command | **IMPLEMENTED** | NO |
| **FR-CLI-002** | Headless mode execution & exit codes | **IMPLEMENTED** | NO |
| **FR-TUI-001** | Interactive TUI app & screen management | **IMPLEMENTED** | NO |
| **FR-CTX-001** | Session persistence & interactive resumption | **PARTIALLY IMPLEMENTED** | **YES** |

---

## 9. P1 Status

| Requirement ID | Summary Description | Status |
| :--- | :--- | :---: |
| **FR-AGN-001** | Custom agent definitions in `.flappycode/agents/` | **IMPLEMENTED** |
| **FR-CFG-001** | Configuration management (`config get/set/edit/path`) | **IMPLEMENTED** |
| **FR-SRV-001** | Server mode & NDJSON event streaming (`flappycode serve`) | **IMPLEMENTED** |
| **FR-TUI-002** | Interactive Model Picker selection | **NOT IMPLEMENTED (UNWIRED)** |

---

## 10. P2 Status

| Requirement ID | Summary Description | Status |
| :--- | :--- | :---: |
| **FR-CTX-002** | Context compaction & LLM summarization | **PARTIALLY IMPLEMENTED** |
| **FR-PERF-001** | Cold start $\le$ 300ms, idle RSS $\le$ 80MB | **IMPLEMENTED** |

---

## 11. Critical Security Findings

### Positive Security Findings:
- **Sandbox Boundary:** `FsJail` successfully blocks parent traversal, Windows drive escapes, and directory symlink bypasses.
- **Credential Protection:** Secrets are stored in SQLite using AES-256-GCM. Shell commands execute with environment variables purged of API keys.
- **Paid Model Lockdown:** In free tier mode, paid models are never queried, even under total free pool exhaustion.

### Critical Operational/Safety Defect:
- **Single-Model Plan Scope Deadlock:** The security mechanism designed to prevent unapproved writes (`PlanGate`) was incorrectly integrated into single-model mode. By passing an empty array of allowed files instead of prompt-derived or wildcard-scoped files, the safety gate turns into a fatal denial-of-service for all single-model coding tasks.

---

## 12. False Completion Claims

| Document & Location | Claim | Actual Forensic State | Evidence |
| :--- | :--- | :--- | :--- |
| `docs/PHASE1_GAPS.md` line 2359 | "ALL 68 GAPS RESOLVED — ZERO REMAINING GAPS" | **False Claim** | Section headers for GAP-002, GAP-006, GAP-034, GAP-035, and GAP-036 remain explicitly marked `[PARTIALLY COMPLETED]`. |
| `docs/PHASE1_GAPS.md` GAP-007 | "Single-model mode fully implemented and working" | **Broken at Runtime** | `flappycode run "..." --model <id> --approve-plan` fails with `PlanGate Blocked` and exits with code 1. |
| `docs/CLIDesign.md` §3.2 | Interactive Model Picker allows selecting active model via `↵` | **Unwired at Runtime** | `cli.ts` line 514 executes `await waitForAnyKey()` without capturing input or switching models. |
| `docs/SRS.md` FR-CTX-001 | `flappycode sessions resume <id>` resumes session in TUI | **Partially Implemented** | Command only prints session details to console and exits cleanly without entering interactive mode. |

---

## 13. Dead / Unwired Implementation

1. **`ModelPickerScreen` Selection Logic:**  
   `packages/tui/src/screens/model-picker.ts` renders arrow navigation controls, but the CLI wrapper (`packages/cli/src/cli.ts#L512`) does not wire keypress handlers or return selection state.
2. **`session.resume` in Headless REPL:**  
   `packages/cli/src/cli.ts#L1627` loads session history from SQLite into memory but immediately terminates process without passing history to orchestrator.

---

## 14. Previous Audit Reconciliation

| Previous Audit Finding (`PHASE1_IMPLEMENTATION_AUDIT.md`) | Previous Status | Current Forensic State |
| :--- | :---: | :--- |
| Plan Scope Enforcement Bypass | HIGH | **RESOLVED:** `PlanGate` strictly validates paths against approved plan scope. |
| Filesystem Jail Traversal Vulnerabilities | HIGH | **RESOLVED:** `FsJail` enforces canonical paths using `realpathSync`. |
| Audit Log Not Written to Storage | MEDIUM | **RESOLVED:** Real SQLite writes verified in `tool_call_log`. |
| Missing `RULES.md` Category Rules | HIGH | **RESOLVED:** All 10 category rule files present and loaded. |
| Single-Model Mode Execution | CRITICAL | **REGRESSED/BROKEN:** Empty token causes `PlanGate` to block all file writes. |

---

## 15. Gap Register Reconciliation

- **GAP-001 (Filesystem Jail):** `RESOLVED`
- **GAP-002 (Shell Permission Sandbox):** `PARTIALLY RESOLVED` (Allow/deny/ask works; timeout enforcement basic)
- **GAP-006 (Paid Gate Fail-Safe):** `RESOLVED` (Tested live with 0 paid leaks)
- **GAP-007 (Single-Model Mode):** `REGRESSED / BROKEN` (Empty plan token blocks Coder agent writes)
- **GAP-034 (Session Resume):** `PARTIALLY RESOLVED` (Persistence works; interactive resume unwired)
- **GAP-035 (Model Picker Screen):** `NOT RESOLVED / UNWIRED` (Key navigation unwired)
- **GAP-036 (Doc Upkeep Automation):** `RESOLVED` (Verified live update of `Context.md` and `Changelog.md`)

---

## 16. Test Quality Assessment

The automated test suite (474 tests across 66 files) provides excellent unit and contract test coverage for isolated modules (`model-router`, `paid-gate`, `classifier`, `fs-jail`, `plan-gate`).

However, **test quality for end-to-end CLI workflows was insufficient to catch runtime deadlocks**:
- Tests for single-model mode tested `FlappyAutoOrchestrator` using pre-mocked tool responses that bypassed `executeToolCall` plan-gate checks.
- CLI tests verified command flag parsing without invoking the real multi-step execution pipeline against a real disk structure.

---

## 17. Packaging / Local Installation Verification

```text
Status: VERIFIED (Distribution publication excluded from audit)
```

1. Executed `npm pack` in `packages/cli`. Produced `flappycode-0.1.0.tgz` (152.4 kB).
2. Installed tarball into clean isolated external prefix in `%LOCALAPPDATA%\Temp\flappy-install-test-*`.
3. Executed `flappycode --version` $\to$ returned `0.1.0`.
4. Executed `flappycode doctor` $\to$ clean health report, exit code 0.
5. Confirmed bundled assets include `assets/RULES.md`, rule categories, and compiled JS without runtime workspace dependencies.

---

## 18. Remaining Gaps

### GAP-REM-01: Single-Model Plan Token Scope Deadlock
- **Severity:** CRITICAL
- **Requirement:** FR-ORC-004 / PRD US-09
- **Expected:** `flappycode run "task" --model <model> --approve-plan` stages diffs and writes approved changes.
- **Actual:** Fails with `PlanGate Blocked: Cannot write to <path> — not in approved plan`.
- **Files:** `packages/core/src/orchestration/flappyauto.ts#L335-L361`

### GAP-REM-02: Interactive Model Picker Selection Unwired
- **Severity:** HIGH
- **Requirement:** UI-002 / FR-ORC-004
- **Expected:** User navigates `/models`, presses Enter, and switches the active model.
- **Actual:** Pressing any key returns to home screen; model is not switched.
- **Files:** `packages/cli/src/cli.ts#L512-L525`

### GAP-REM-03: Provider Registration Connector Lookup Bug
- **Severity:** HIGH
- **Requirement:** FR-PRV-001 / FR-PRV-002
- **Expected:** `addProvider` resolves connector by provider `type`.
- **Actual:** Lookups use `cfg.id`, falling back to OpenAI connector and failing with `Endpoint unreachable`.
- **Files:** `packages/core/src/engine.ts#L276`

### GAP-REM-04: Session Resumption Display-Only
- **Severity:** MEDIUM
- **Requirement:** FR-CTX-001
- **Expected:** `flappycode sessions resume <id>` loads conversation into interactive TUI.
- **Actual:** Prints metadata to console and exits.
- **Files:** `packages/cli/src/cli.ts#L1627-L1637`

---

## 19. Required Fixes Before Phase 1 Acceptance

### Priority 1: Fix Single-Model Mode Scope in `flappyauto.ts` (CRITICAL)
In `packages/core/src/orchestration/flappyauto.ts` (`startRun`), when `singleModel` is active:
- Do not initialize `files_to_modify` to an empty array.
- Either issue a `PlanToken` with wildcard permissions (`['*']`) or extract candidate paths from the prompt, allowing Coder agent to stage changes for diff review.

### Priority 2: Wire Interactive Model Selection in `cli.ts` (HIGH)
In `packages/cli/src/cli.ts` (`showModelsScreen`):
- Implement raw-mode keypress listening for arrow navigation and Enter key.
- Save selected model ID in state / config and display confirmation notification.

### Priority 3: Fix Connector Resolution in `engine.ts` (HIGH)
In `packages/core/src/engine.ts` line 276:
- Change `this.registry.getConnector(cfg.id)` to `this.registry.getConnector(cfg.type)`.

### Priority 4: Wire Session Resumption into TUI (MEDIUM)
In `packages/cli/src/cli.ts` (`sessions resume`):
- Pass resumed session ID to `launchTUI({ resumeSessionId: id })` or launch interactive REPL.

---

## 20. Evidence Appendix

### A. Single-Model Mode Failure Log
```text
Command: node packages/cli/dist/cli.js run "Create hello.txt with hello world" --model mock/mock-coder-free --approve-plan
Output:
ℹ Starting run: Create hello.txt with hello world
ℹ Plan auto-approved via --approve-plan
[PlanGate] Blocked: Cannot write to hello.txt — not in approved plan []
[PlanGate] Blocked: Cannot write to hello.txt — not in approved plan []
✖ Error: Coder agent completed without staging changes
Exit Code: 1
```

### B. Interactive Model Picker Unwired Code Inspection
```typescript
// packages/cli/src/cli.ts lines 512-518
const screen = new ModelPickerScreen(models, activeModelId);
console.clear();
console.log(screen.render());
await waitForAnyKey(); // <--- Merely waits for a keypress, completely ignores input
currentScreen = 'home'; // <--- Immediately navigates back home without setting active model
```

### C. Provider Registration Connector Resolution Bug
```typescript
// packages/core/src/engine.ts line 276
// BUG: Passes cfg.id instead of cfg.type
const connector = this.registry.getConnector(cfg.id);
```

---

## 21. FINAL DECISION

```text
PHASE 1 NOT ACCEPTED
```

### Decision Justification
Phase 1 acceptance strictly requires that all P0 requirements be implemented, wired, and verified to work through the real production execution paths. Because Single-Model Mode (`FR-ORC-004`), Interactive Model Selection (`UI-002`), and Custom Provider Registration (`FR-PRV-001`) contain breaking runtime bugs and unwired execution paths, FlappyCode Phase 1 **cannot be certified as complete**.

Once the four remediation items specified in **Section 19** are resolved and verified against runtime simulations, Phase 1 can be formally accepted.
