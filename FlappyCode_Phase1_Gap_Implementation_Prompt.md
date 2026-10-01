# FlappyCode Phase 1 — Gap Implementation / Completion Prompt

## ROLE

You are the **Phase 1 Completion Engineer** for the FlappyCode repository.

The repository has already undergone a formal Phase 1 implementation audit. Your job now is to **implement every missing, partial, broken, or insufficiently wired Phase 1 capability identified by that audit**, verify the implementation, and leave the repository in a genuinely working Phase 1 state.

This is an **implementation task**, not another architecture exercise.

You must work from the actual repository state. The attached audit is evidence, not permission to blindly code from assumptions. Every gap must be re-checked against the current source before changing it because the repository may have changed after the audit.

The target is:

> **After this execution, FlappyCode Phase 1 must work end-to-end according to the project's Phase 1 specification, with the identified Phase 1 gaps implemented and verified.**

---

# 1. ABSOLUTE RULES

## 1.1 Repository `RULES.md` is supreme

Before touching implementation code:

1. Read the authoritative repository-root `RULES.md`.
2. Read any more-specific/nested rules files that apply to the files you will modify.
3. Follow them throughout the entire implementation.
4. Never bypass, weaken, replace, reinterpret, or self-authorize around them.
5. If a rule requires a plan/approval before implementation actions, obey that rule even when this prompt says to implement the work.
6. If the repository rules conflict with this prompt, the repository rules win.

Do not create a second competing source of truth for the ruleset.

---

## 1.2 Read the full specification set before implementation

Read the relevant full documents from `docs/`:

```text
docs/PRD.md
docs/SRS.md
docs/SystemArchitecture.md
docs/CLIDesign.md
docs/TaskBreakdown.md
```

Also read, if present:

```text
FlappyCode Product & Technical Specification v0.2
```

Read these two audit outputs completely:

```text
docs/PHASE1_IMPLEMENTATION_AUDIT.md
docs/PHASE1_GAPS.md
```

Treat the audit and gap register as the **current implementation diagnosis**, but treat the specification documents as the **behavioral source of truth**.

Do not quietly lower a requirement because the existing code is incomplete.

---

# 2. NO-GUESSING POLICY

You are explicitly forbidden from guessing how a gap should be implemented when the repository specification already defines the behavior.

For every gap:

1. Read the cited requirement in the source document.
2. Inspect the actual existing implementation.
3. Find all callers and execution paths.
4. Identify why the current implementation fails the requirement.
5. Implement the smallest architecture-consistent fix.
6. Add or update tests that prove the behavior.
7. Run the real execution path, not just an isolated unit test.
8. Re-check the original requirement after implementation.

Do not accept any of these as proof of completion:

- a class exists,
- an interface exists,
- a command parses,
- a screen renders static data,
- a schema exists,
- a TODO exists,
- a test exists but bypasses the real path,
- a mock exists without integration,
- a function returns a placeholder value,
- a README says the feature exists.

A feature is complete only when its **real execution path works** and the relevant requirement is demonstrably satisfied.

---

# 3. SCOPE BOUNDARY

## 3.1 Implement Phase 1 functionality

Implement all missing/partial/broken functionality required by the project's Phase 1 specification and by the owner's Phase 1 checklist represented in the project documents.

This includes the major areas:

- provider abstraction and model pool,
- model discovery/classification/registry,
- routing and fallback,
- flappyauto,
- specialist agents,
- per-agent model binding,
- task graph execution,
- filesystem/shell/git safety,
- LSP/MCP integrations that the project currently classifies as Phase 1/P1,
- rules enforcement,
- plan/diff/permission approvals,
- context/session persistence,
- CLI/TUI functionality,
- local `serve`,
- search/codebase analysis,
- test/fix loops,
- provider health/configuration,
- package/runtime correctness,
- required local verification.

The owner also explicitly expects the Phase 1 implementation to cover the Researcher/Browser and vision/image input capabilities listed in the Phase 1 task checklist. Implement those where the existing specification set and architecture provide a defined Phase 1 path. Do not invent an unrelated architecture merely to add these capabilities.

## 3.2 Do NOT implement deployment/DevOps

Do **not** implement:

- GitHub repository setup,
- GitHub Actions,
- CI/CD pipelines,
- cloud deployment,
- production hosting,
- Docker/Kubernetes deployment,
- npm publishing,
- release automation,
- provenance publishing,
- Phase 2 web/account/dashboard infrastructure,
- Phase 3 desktop application.

Local build/test/packaging verification is allowed and required where useful. Creating production deployment infrastructure is not.

Do not confuse `flappycode serve` with deployment. It is only the required local HTTP/SSE mode.

---

# 4. IMPLEMENTATION ORDER

Do not work on gaps randomly. Use this dependency order.

## Stage A — Safety and execution integrity FIRST

Fix these before adding further behavior:

1. GAP-010 — approval gates bypassed
2. GAP-011 — plan token self-expansion
3. GAP-022 — filesystem sandbox escapes
4. GAP-023 — permission prompt UI / approval flow
5. GAP-021 — tool audit logging / fabricated approval flags
6. GAP-047 — stop-condition coverage
7. GAP-028 — child-process environment leakage
8. GAP-037 — unsafe encrypted secret fallback derivation

Nothing else should be considered complete until these safeguards are actually enforced in the real execution path.

## Stage B — Core model routing and provider reliability

9. GAP-001 — model fallback/substitution
10. GAP-003 — substitution events/logging/UI
11. GAP-004 — retry/backoff/Retry-After
12. GAP-002 — pool exhaustion notice/two actions/resume
13. GAP-005 — periodic revalidation
14. GAP-006 — user model tier overrides
15. GAP-044 — pinned model fallback policy
16. GAP-034 — Ollama Cloud profile
17. GAP-035 — provider tool-call normalization
18. GAP-036 — User-Agent completeness
19. GAP-039 — credential validation on provider add
20. GAP-041 — provider data-use policy
21. GAP-042 — provider concurrency/rate limits
22. GAP-043 — registry filter completeness

## Stage C — Orchestration completeness

23. GAP-007 — single-model mode and real `--model`
24. GAP-008 — declarative agent definitions
25. GAP-009 — Reviewer/Tester → Coder feedback and test-fix loop
26. GAP-013 — real parallel execution + strict concurrency
27. GAP-012 — cancellation
28. GAP-014 — Context.md update
29. GAP-025 — sessions/resume
30. GAP-026 — context compaction/project memory/per-agent slices
31. GAP-046 — planner invalid-output model fallback
32. GAP-027 — live task graph/status state
33. GAP-019 — agent-accessible search and semantic codebase analysis

## Stage D — Rules and product interaction completeness

34. GAP-018 — complete RULES loading/injection/nesting/conflicts/package asset
35. GAP-048 — clarifying question interaction
36. GAP-049 — category-specific rule activation where required
37. GAP-050 — record headless approval provenance
38. GAP-032 — provider test/health/doctor reachability
39. GAP-033 — real config-file system
40. GAP-040 — local provider auto-detection
41. GAP-020 — Git tool integration and safe push/PR drafting
42. GAP-045 — persisted undo/checkpoint behavior as required

## Stage E — CLI/server correctness and observability

43. GAP-024 — complete headless exit-code contract
44. GAP-051 — failure events in JSON mode
45. GAP-052 — server must not fake success for unsupported commands
46. GAP-056 — local debug/logging subsystem
47. GAP-058 — actionable error messages
48. GAP-054 — task/session persistence and crash recovery
49. GAP-053 — local performance verification/instrumentation where required

## Stage F — P1 integrations and remaining provider/model capabilities

50. GAP-015 — capability probe
51. GAP-016 — real LSP integration
52. GAP-017 — real MCP client
53. GAP-018 remaining nested rules/conflict work
54. GAP-038 only for capabilities explicitly required by the owner's Phase 1 checklist; otherwise preserve documented phase boundaries

## Stage G — Test/build/packaging hardening

55. GAP-055 — typecheck, core coverage targets, and local quality gates
56. GAP-060 — recorded-response connector contract tests
57. GAP-057 — local `npm pack`/install smoke verification and runtime asset packaging
58. GAP-030 — runtime verification of TTY path where environment permits
59. GAP-031 — terminal compatibility/fallback fixes
60. GAP-059 — cross-platform code/test hardening; do not claim OS runtime proof without actually running there

---

# 5. CRITICAL GAP IMPLEMENTATION REQUIREMENTS

## GAP-001 — Model fallback on provider/model failure

Requirement: when a selected model is busy, rate-limited, errors, times out, exhausts free quota, or disappears, continue with the next eligible free/rate-limited-free model.

Implement:

- ranked-candidate iteration,
- `excludeModelIds` flow,
- error classification,
- model error/cooldown accounting,
- model success accounting,
- provider/model concurrency leases,
- fallback in both planning and worker execution paths,
- correct handling of model disappearance,
- no fallback to paid models without explicit grant.

Do not duplicate routing logic in multiple places. Create one reusable execution/fallback policy layer.

Add deterministic mock scenarios for:

- busy,
- 429,
- 5xx,
- timeout,
- quota exhausted,
- disappeared model,
- sequential multiple failures,
- total free-pool exhaustion.

---

## GAP-002 — Pool exhaustion pause/resume

Implement the complete interactive workflow:

1. Router determines no free/rate-limited-free model can satisfy the requirement.
2. Persist paused run state.
3. Emit the pool-exhaustion approval event.
4. Present exactly two actions:
   - recharge/add credit on a paid provider,
   - connect another free-tier provider.
5. Do not issue paid requests before explicit confirmation.
6. If paid path is chosen and confirmed, issue the required `PaidGrant` and resume.
7. If another free provider is connected, refresh the registry and resume.
8. Resume the exact paused node/task, not a fresh run.
9. Preserve task graph and context.

The same semantics must work through the TUI and local server command/event path.

Headless mode must represent this state honestly rather than pretending it has completed.

---

## GAP-003 / GAP-004 — Substitution events and retry policy

Implement:

- `model.substituted` emission,
- node substitution history,
- visible substitution in run/task graph views,
- exponential backoff,
- jitter,
- `Retry-After` support,
- bounded retries,
- fallback after retry budget is exhausted.

Do not retry forever.

Tests must verify both timing semantics and eventual fallback behavior.

---

## GAP-005 — Periodic registry revalidation

Implement the scheduler using configured `revalidateEveryHours`.

Requirements:

- default interval from specification,
- configurable interval,
- no provider work when none are enabled,
- refresh providers safely in parallel where specified,
- disappeared models become `unavailable`,
- registry updated event emitted,
- scheduler shuts down cleanly,
- tests use a short interval and fake clock/timers where possible.

---

## GAP-006 — Manual model tier overrides

Expose a real user path for:

- tag model `free`,
- tag model `paid`,
- disable model,
- remove override.

Provide the CLI surface required by the existing command design and integrate TUI support where appropriate.

Verify overrides persist across `providers refresh` and discovery.

---

## GAP-007 — Single-model mode

`flappycode run --model <id>` must actually change execution mode.

Implement:

- real flag propagation,
- single-agent execution loop,
- same safety/rules/approval gates as flappyauto,
- real model selection in TUI,
- `flappyauto` always first in picker,
- per-agent bind flow,
- `agents bind` if required by CLI design,
- persistent bindings.

A pinned paid model must still require explicit paid authorization.

---

## GAP-008 — Declarative agent definitions

Implement file-backed agent definitions according to the documented schema and project architecture.

Support:

- name,
- system prompt,
- allowed tools,
- preferred model,
- fallback policy.

Load/merge built-ins + project custom agents.

Validate with Zod or the repository's existing schema system.

Reject malformed files with actionable errors.

Make execution actually honor the loaded definition.

---

## GAP-009 — Reviewer/Tester feedback and test-fix loop

Replace the single-shot node execution behavior with the required bounded feedback loop.

Implement:

1. Coder produces changes.
2. Tester/Command-Executor runs relevant checks.
3. Failures are captured as structured feedback.
4. Reviewer evaluates output.
5. Failure feedback returns to Coder with relevant context.
6. Coder can patch.
7. Tests/review run again.
8. Loop stops on success or configured maximum, default 3 if specified.
9. Escalation is emitted when maximum attempts are reached.

Tool results must become real model messages/context, not only logs.

Add an end-to-end failing-test fixture proving the loop.

---

## GAP-010 / GAP-011 / GAP-023 — Approval and permission enforcement

These are safety-critical.

### Diff approval

Never write an edit to disk unless:

1. required implementation plan is approved,
2. generated diff is presented,
3. user explicitly approves the diff.

Default behavior when no approval callback exists must be **deny**, never approve.

### Plan approval

Never auto-approve merely because stdin is non-TTY.

Use the documented headless rule:

- no `--approve-plan` → approval required/exit appropriately,
- `--approve-plan` is explicit user intent,
- record approval provenance.

### Plan scope

Never expand a PlanToken because the model asks to write a new path.

An out-of-plan write must:

- be blocked,
- surface an approval request,
- require a new explicit approval if the product rules permit it,
- never silently broaden authorization.

Wildcard tokens must not bypass the intended scope.

### Shell permissions

Remove hard-coded `isUserApproved:true` from model-issued shell commands.

Route each command through the real permission engine.

Implement the permission prompt flow and `allow/ask/deny` behavior.

Destructive commands must always require the required explicit confirmation and may not be silently auto-allowed.

Record the true approval state in audit logs.

---

## GAP-022 — Filesystem sandbox escape

Fix all path escape classes found by the audit:

- absolute paths outside root,
- sibling-prefix paths,
- existing and non-existing symlink-directory escapes,
- any Windows-specific drive/UNC/junction escape relevant to the platform.

Use canonical boundary-safe path validation.

Do not rely on `startsWith(root)` without path-boundary semantics.

Test:

- `../`,
- absolute outside path,
- sibling prefix,
- symlink target outside root,
- nested symlink,
- Windows path forms where available.

Both reads and writes must respect the jail.

---

## GAP-021 — Audit log

Wire every tool call into the audit repository with truthful metadata:

- node/run id,
- tool,
- args/redacted args,
- result summary,
- real `approved_by_user` state,
- timestamp.

Do not fabricate approval=true.

Never write secrets into the audit log.

Verify persisted rows after a real run.

---

## GAP-012 — Cancellation

Wire:

- Ctrl-C,
- Esc where TUI design supports it,
- server cancellation command,
- engine cancellation,
- AbortSignal propagation,
- node cancellation state,
- safe finalization,
- documented exit code 130.

Do not call `process.exit(0)` as a substitute for structured run cancellation.

Verify no corrupted files and undo/recovery behavior.

---

## GAP-013 — Parallel execution

Fix the concurrency off-by-one.

Use actual provider/model leases where required.

Write an integration test with two slow independent nodes and timestamp them to prove overlap.

Write a test proving the concurrency cap is never exceeded.

Dependent nodes must remain sequential.

---

## GAP-014 — Context.md / Changelog.md

After every approved change set:

- update `Context.md`, creating it if missing,
- append timestamped `Changelog.md` entry,
- record the meaningful change summary,
- record required approval provenance when applicable.

Use the existing DocsKeeper architecture rather than a duplicate implementation.

---

## GAP-015 — Tool-call capability probe

Wire capability probing into first tool-using assignment.

Cache result.

Do not repeatedly probe healthy models unnecessarily.

Exclude probe-failing models from roles requiring tools.

---

## GAP-016 — LSP

Implement a real LSP client appropriate to the repository's TypeScript/Node architecture.

Minimum:

- launch appropriate language server,
- JSON-RPC/stdio transport,
- workspace/document sync,
- diagnostics collection,
- lifecycle cleanup,
- expose diagnostics to agent context,
- feed diagnostics after edits to Coder/Reviewer.

Use a deterministic fixture project with a deliberate type error.

The model must receive the real diagnostic, not an invented summary.

---

## GAP-017 — MCP client

Implement an actual MCP client.

Minimum:

- documented SDK/transport,
- server configuration,
- initialization/handshake,
- tool enumeration,
- tool invocation,
- result normalization,
- permission-engine wrapping,
- failure isolation,
- tool exposure to appropriate agents.

Use a local fixture MCP server for tests.

Do not implement an MCP server unless the current Phase 1 specification explicitly requires it.

---

## GAP-018 — RULES loading and enforcement

Fix all of:

- package-shipped universal `RULES.md` asset,
- project-level extension,
- nested scoped rules,
- conflict detection,
- full/faithful rules representation to agents,
- planner rules coverage,
- no silent truncation that removes operative rules.

Do not blindly concatenate an arbitrarily huge rules file into every prompt if architecture requires summarization/chunking; instead preserve the complete semantics and make relevant rules available to every agent.

Verify an installed package/project with no local `RULES.md` still gets the universal ruleset.

Verify nested rules actually alter only their intended scope.

---

## GAP-019 — Search / Codebase Analyst

Expose the lexical search tool to agents.

Implement the Codebase-Analyst path required by the specification.

The agent must be able to answer repository questions using actual repository evidence.

Implement semantic/indexed search if required by the Phase 1/P1 specification currently governing the project; do not pretend lexical grep is semantic search.

---

## GAP-020 — Git

Fix:

- git tool registration for agents,
- branch creation,
- status/diff,
- safe commit flow,
- generated commit message,
- PR description drafting,
- push confirmation,
- protected branch protection,
- force-push protection.

A push to any branch must not bypass the required confirmation policy.

Do not actually push to remote repositories during implementation/testing.

---

## GAP-024 — Headless exit behavior

Implement exact documented exit codes.

Verify:

- success = 0,
- task failure = 1,
- usage error = 2,
- approval required = 3,
- free pool exhausted = 4,
- no providers = 5,
- cancellation = 130.

Ensure errors map consistently.

---

## GAP-025 / GAP-026 / GAP-054 — Sessions, persistence, context, recovery

Implement real session creation and persistence.

Support documented resume behavior.

Persist task runs/nodes sufficiently for recovery.

Wire ContextManager into real execution.

Implement:

- context slices,
- compaction before context overflow,
- project memory persistence,
- per-agent relevant context,
- session reconstruction,
- restart/resume where specified.

Do not fabricate continuity from in-memory state.

---

## GAP-027 — Live task graph/status state

The TUI must show real execution state:

- node,
- agent,
- model,
- queued/running/completed/failed/cancelled,
- substitutions,
- waiting for approval,
- pool exhaustion.

Do not implement this as a static mock screen.

---

## GAP-032 / GAP-039 / GAP-040 / GAP-041 / GAP-042

Complete provider management:

- `providers test`,
- health/reachability checks,
- doctor diagnostics,
- actual credential validation during add,
- local Ollama/LM Studio detection on documented default ports,
- data-use policy from proper bundled/provider metadata,
- configurable concurrency and rate limits,
- real enforcement of RPM limits.

Do not claim health if no health request is made.

---

## GAP-033 — Config system

Implement the documented user/project configuration system.

It must support the repository's documented provider/agent/model/permission/sandbox structure and `env:NAME` references.

Implement precedence:

- built-in defaults,
- user config,
- project config,
- explicit CLI arguments as documented.

Validate config with the existing schema system.

Add `flappycode config get/set/edit/path` where required by the CLI design.

---

## GAP-043 — Registry filters

Complete filtering/query support for documented registry dimensions:

- cost/price,
- tier,
- context length,
- modality,
- tools,
- vision,
- latency,
- provider.

Expose CLI/TUI filters where the command design specifies them.

---

## GAP-044 — Pinned-model fallback policy

Respect each agent's `fallbackPolicy`.

If a pinned model becomes unavailable:

- `ask` → pause/ask,
- documented fallback policy → follow that policy,
- never silently switch behavior when the configured policy says to ask.

---

## GAP-045 — Undo/checkpoint

Implement the level of persistence required by the Phase 1 specification.

Undo must survive the appropriate lifecycle and restore the previous state after restart when the requirement expects persisted state.

Where the architecture specifies git checkpoint support, implement it safely without automatic push.

---

## GAP-046 — Planner repair/fallback

After invalid planner output:

1. validate,
2. make exactly the documented repair attempt,
3. if still invalid, use model fallback according to router policy,
4. do not silently substitute a fabricated hard-coded plan unless the specification explicitly allows it.

Add tests proving invalid planner output triggers the correct fallback.

---

## GAP-047 — Stop conditions

Expand stop-condition handling beyond shell/file destructive checks where required:

- breaking API changes,
- irreversible migrations,
- rule conflicts,
- other explicitly documented universal stop conditions.

Stop conditions must be enforced in code/tool layer, not merely instructed through prompt text.

---

## GAP-048 — Clarifying questions

Implement a first-class question flow:

- agent emits `question.asked`,
- TUI displays question/options/input,
- user responds,
- answer is returned to the correct run/node,
- task resumes,
- server command path supports the same event/command semantics.

Do not fake acknowledgements.

---

## GAP-049 / GAP-050

Implement category-specific rules only where supported by the current Phase 1 specification and existing category assets.

For headless approval:

- explicitly record `--approve-plan` provenance in Changelog,
- preserve correct behavior on failure/cancellation where required.

---

## GAP-051 — JSON failure event

Every terminal headless run state must be represented in JSON/NDJSON.

A failed run must end with a failure event carrying an actionable error code/message.

Do not suppress the only failure reason into stderr when `--json` is requested.

---

## GAP-052 — Server honesty

The local server must never return success for an unsupported/unimplemented command.

Every advertised command must:

- perform the real operation, or
- be rejected with a structured unsupported/invalid response.

Wire all Phase 1-required server commands to the same engine command/event path as the TUI/CLI.

---

## GAP-053 — Performance

Implement any necessary instrumentation and run the measurable Phase 1 performance checks:

- cold start,
- TUI responsiveness,
- provider discovery behavior,
- memory usage.

Do not invent benchmark values.

Record actual measurements.

---

## GAP-055 — Typecheck, coverage, quality gates

Fix all TypeScript/lint/typecheck failures.

Raise meaningful test coverage to the project's documented thresholds.

Prioritize weak areas identified by the audit, especially:

- `flappyauto`,
- DAG executor,
- RULES loader/docs keeper,
- router,
- classifier,
- permission gates,
- secrets,
- session/task/audit repositories,
- real provider connectors.

Do not lower coverage thresholds.

Do not delete tests merely to improve percentages.

Do not replace real integration tests with tautological tests.

No CI/GitHub implementation is required in this task; local quality gates are required.

---

## GAP-056 — Debug/logging subsystem

Implement local structured debug logging if required by the current specification:

- `--debug`,
- local-only log file/output,
- secret redaction,
- rotation/size handling,
- no telemetry upload.

Do not create a remote logging service.

---

## GAP-057 — Packaging

Do not publish to npm.

Do perform local package verification:

1. build the distributable,
2. run `npm pack` or the project's equivalent,
3. inspect tarball contents,
4. ensure required runtime assets are included,
5. install the packed artifact locally in a clean temp prefix,
6. execute `flappycode --version` and the core startup flow.

Fix package asset declarations if necessary.

---

## GAP-058 — Error quality

Audit major user-facing errors so every error communicates:

1. what happened,
2. why it happened where known,
3. what the user can do next.

Keep machine-readable error codes separate from human text.

Add tests for important CLI/TUI error states.

---

## GAP-059 — Cross-platform correctness

Harden the implementation for:

- Windows,
- macOS,
- Linux.

Do not claim actual runtime verification on an OS you did not run.

At minimum:

- use platform-safe path APIs,
- platform-specific shell selection,
- avoid hard-coded Windows paths,
- avoid POSIX-only behavior in shared code,
- add unit tests for platform path/shell semantics.

---

## GAP-060 — Connector contract tests

Add fixture-driven contract tests for each real connector implementation:

- OpenAI-compatible,
- Anthropic,
- Google,
- Ollama,
- any additional provider profile implemented for Phase 1.

Each suite should cover as applicable:

- authentication/error responses,
- model discovery,
- normalization,
- streaming completion,
- tool-call normalization,
- rate-limit responses,
- provider-specific quirks.

Tests should run offline from recorded fixtures.

---

# 6. P2 / OWNER-REQUESTED CAPABILITIES

The audit classifies some capabilities as P2 in the formal SRS, but the owner's Phase 1 checklist explicitly requested Researcher/Browser and image/screenshot input as part of the Phase 1 implementation target.

Therefore:

## Researcher / Browser

Implement only if there is already a coherent tool/agent interface in the repository or the architecture docs provide the intended integration path.

Implement:

- Researcher agent definition,
- browser tool/adapter,
- permission integration,
- isolation,
- result handoff into agent context.

No arbitrary cloud browser service or external deployment architecture.

## Vision / image input

Implement through the existing provider abstraction for providers/models declaring vision support.

Requirements:

- image input accepted only where provider/model capability says vision is supported,
- capability filtering,
- correct request serialization,
- no accidental image sending to non-vision models,
- tests with a local fixture/provider adapter where possible.

If a capability cannot be implemented without violating the repository's architecture or rules, document the exact blocker rather than inventing an unrelated system.

---

# 7. ARCHITECTURAL CONSTRAINTS

Respect the existing architecture:

```text
interfaces
  -> protocol/event bus
  -> core engine
  -> orchestration
  -> agents
  -> tools/sandbox
  -> router/registry
  -> provider connectors
  -> external provider
```

Keep the engine reusable as a library.

Do not solve a missing feature by embedding product behavior directly into one CLI command when the same behavior must also be available to server/TUI/other clients.

Prefer shared services over duplicated logic.

Keep safety controls in code/tool layer, not prompts alone.

Keep paid-model selection behind the existing hard safety boundary.

---

# 8. REQUIRED TEST STRATEGY

For every implemented gap, add or update tests at the correct layer.

Use this rule:

### Unit test
For deterministic pure logic.

### Integration test
For package-to-package behavior.

### End-to-end test
For CLI/TUI/server → engine → agent → tool/provider behavior.

### Chaos test
For failures, fallback, timeouts, disappearance, quota, retry.

### Security test
For permissions, traversal, secret leakage, approval bypasses.

Do not use only unit tests for integration requirements.

Do not write tests that bypass the code path under test.

The existing audit explicitly found a golden-flow test that bypassed the DAG executor and diff-approval path; do not repeat that pattern. fileciteturn6file17L1-L1

---

# 9. REQUIRED END-TO-END ACCEPTANCE SCENARIOS

Before declaring Phase 1 complete, these real flows must pass.

## Scenario A — Free-provider fallback

- Configure two free mock models.
- Start a real task.
- First model returns 429/5xx/timeout.
- Router retries according to policy.
- Next free model takes over.
- `model.substituted` is emitted.
- No paid request occurs.

## Scenario B — Free pool exhaustion

- All free models become unavailable.
- Run pauses.
- Exactly two actions are shown.
- No paid request occurs.
- Choose connect-another-provider.
- Provider is added/discovered.
- Run resumes from paused state.

Repeat with the paid-credit action and verify explicit `PaidGrant` behavior.

## Scenario C — Plan + diff approval

- Ask agent to modify a file.
- Plan is shown.
- Without plan approval, nothing is written.
- After plan approval, diff is shown.
- Without diff approval, nothing is written.
- After diff approval, files are modified.
- Changelog/context update happens.

## Scenario D — Out-of-plan write attempt

Approved plan allows `src/a.ts`.

Model requests write to `src/b.ts`.

Expected:

- request blocked,
- plan token not expanded,
- approval request generated,
- file unchanged.

## Scenario E — Dangerous shell command

Agent attempts a destructive command.

Expected:

- permission engine returns `ask`/deny as configured,
- no execution before approval,
- approval UI/command is shown,
- audit log records true approval state.

## Scenario F — Failing test → automatic fix loop

- Start with a controlled failing test.
- Tester runs it.
- Failure reaches Coder.
- Coder patches.
- Test reruns.
- Loop terminates on success or max attempts.

## Scenario G — Multi-agent handoff

File-Finder and Codebase-Analyst gather information.

Coder receives relevant findings.

Tester receives code/result context.

Reviewer receives diff/test context.

Verify captured model requests show the actual upstream context was provided.

## Scenario H — Session recovery

- Start task.
- Persist session/task state.
- Stop process.
- Restart.
- Resume session/task.
- State is consistent.

## Scenario I — Cancellation

- Start long-running task.
- Press Ctrl-C/Esc or invoke server cancellation.
- Nodes stop.
- Exit state is cancelled.
- No file corruption.
- Exit code is 130 where applicable.

## Scenario J — LSP diagnostics

- Create a deliberate compiler/type error.
- LSP returns real diagnostics.
- Agent receives them.
- Agent fixes code.
- Diagnostics clear.

## Scenario K — MCP

- Start local fixture MCP server.
- Configure it.
- Enumerate tools.
- Agent invokes permitted tool.
- Permission policy is enforced.
- Server failure is surfaced safely.

## Scenario L — Package/runtime smoke

- Build.
- Pack locally.
- Install packed artifact in temp prefix.
- Run `flappycode --version`.
- Start TUI.
- Run mock-provider task.

---

# 10. REQUIRED VERIFICATION COMMANDS

Use the repository's actual package manager/scripts, but ensure equivalent verification for:

```text
install dependencies
build
lint / typecheck
unit tests
integration tests
security tests
chaos tests
e2e tests
coverage
package/pack smoke test
CLI startup
CLI --version
CLI --help
providers commands
models commands
flappycode run
flappycode serve
```

Do not claim success for commands that were not run.

Record the exact commands and results in the final report.

---

# 11. REQUIRED COMPLETION REPORTS

After implementation create/update:

```text
docs/PHASE1_IMPLEMENTATION_AUDIT.md
docs/PHASE1_GAPS.md
```

Do not simply leave the old audit in place.

Re-run the complete verification process after fixes.

For every former gap, update its status to exactly one of:

- IMPLEMENTED
- PARTIALLY IMPLEMENTED
- IMPLEMENTED BUT BROKEN
- NOT IMPLEMENTED
- NOT VERIFIABLE

Every former gap must have fresh evidence.

Do not delete gap entries merely because they are inconvenient. Mark them implemented with evidence when actually fixed.

If a gap is intentionally outside the current Phase 1 scope, state why using the authoritative specification and do not silently remove it.

---

# 12. DEFINITION OF DONE

The implementation work is complete only when ALL of the following are true:

1. All P0 Phase 1 functional gaps are fixed.
2. All safety-critical bypasses are eliminated.
3. Router fallback works end-to-end.
4. Paid models remain impossible to call without explicit authorization.
5. Approval gates cannot be bypassed through non-TTY, server, model, or tool paths.
6. Filesystem jail blocks all tested escape classes.
7. Every tool call is truthfully audited.
8. Flappyauto actually orchestrates multiple agents with real context handoffs.
9. Reviewer/Tester feedback loops work.
10. Single-model mode actually works.
11. Sessions/context persistence works where required.
12. `Context.md` and `Changelog.md` maintenance actually executes.
13. CLI commands advertised by Phase 1 really work and do not fake success.
14. Local `serve` is honest about unsupported commands and shares real engine behavior.
15. Typecheck/lint is green.
16. Test coverage meets the documented thresholds or any remaining shortfall is explicitly proven to be outside the current Phase 1 requirement set.
17. Real connector contract tests exist.
18. Local package tarball contains required assets and runs from a clean install.
19. Required Phase 1 end-to-end scenarios pass.
20. The final audit contains **no unresolved P0 gap**.

For the owner's Phase 1 scope, also verify the requested Researcher/Browser and vision/image capabilities if they are included in the current authoritative task scope.

---

# 13. FINAL BEHAVIOR

At the end of the work, do not say "implemented" based on code inspection alone.

Run the verification suite again.

Then produce a concise final report containing:

```text
PHASE 1 IMPLEMENTATION STATUS: COMPLETE / NOT COMPLETE

Former gaps resolved: X / 60
Remaining gaps: Y
Remaining P0 gaps: Z

Build/typecheck: PASS/FAIL
Tests: PASS/FAIL
Coverage: <actual>
End-to-end acceptance scenarios: <actual results>
Package smoke test: PASS/FAIL

Remaining blockers:
1. ...
2. ...

Remaining non-blockers:
1. ...
2. ...
```

If any P0 requirement remains broken or missing, the final status must be:

```text
PHASE 1 IMPLEMENTATION STATUS: NOT COMPLETE
```

Do not hide unresolved defects.

---

# 14. START NOW

Execution order:

1. Read root `RULES.md` and all applicable nested rules.
2. Read the full Phase 1 specification documents.
3. Read `docs/PHASE1_IMPLEMENTATION_AUDIT.md` and `docs/PHASE1_GAPS.md`.
4. Verify the current repository state because the reports may be stale.
5. Build a dependency map of the gaps.
6. Implement Stage A through Stage G in order.
7. Run tests after each major stage.
8. Run the complete end-to-end suite after all stages.
9. Re-audit all 60 gaps.
10. Update the audit and gap register with fresh evidence.
11. Stop only when Phase 1 is genuinely complete or when a concrete, documented external blocker remains.

**Do not guess. Do not paper over failures. Do not fake success. Do not bypass the repository rules. Do not weaken the safety model to make tests pass. Implement the missing Phase 1 behavior in the actual execution path and prove it works.**
