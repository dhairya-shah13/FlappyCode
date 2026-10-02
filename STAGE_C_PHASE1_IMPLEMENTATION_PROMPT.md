# Stage C — Multi-Agent Orchestration Implementation Prompt

You are implementing **Stage C of Phase 1 development for FlappyCode**.

## 0. Primary Objective

Implement **the entire Stage C — Multi-Agent Orchestration** end-to-end.

This is **not** a gap-analysis task, a partial implementation task, or a request to only add missing files.

Your job is to:

1. Inspect the existing repository and **all project documentation**.
2. Identify every Stage C requirement and every existing partial implementation.
3. Complete **all missing implementation**.
4. Complete/fix **all partial or broken implementation**.
5. Wire every Stage C capability into the real execution path, CLI/TUI, storage, protocol, and orchestration layers where applicable.
6. Add or update tests and simulations proving the behavior works.
7. Run the complete validation suite.
8. Update the project documentation so that Stage C accurately reflects its completed implementation and evidence.
9. Do not mark anything complete merely because code exists; verify the actual runtime behavior.

**Stage C is complete only when every Stage C item below is implemented, integrated, tested, and documented.**

---

# 1. Repository Context and Documentation Rules

The repository contains the authoritative project context.

### Documentation locations

Read **all relevant documents under `docs/`** before modifying implementation.

Also read these root-level files:

- `Context.md`
- `Changelog.md`

The key documents include, but are not limited to:

- `docs/PRD.md`
- `docs/SRS.md`
- `docs/CLIDesign.md`
- `docs/SystemArchitecture.md` if present under `docs/`
- `docs/TaskBreakdown.md`
- `docs/progress_tracker.md`
- `docs/PHASE1_IMPLEMENTATION_AUDIT.md`
- `docs/PHASE1_GAPS.md`
- any other Stage C-relevant documentation under `docs/`

**Do not assume the current implementation is correct simply because a document says an item is complete.**

The current project state indicates:

- Stage A is mostly complete.
- Stage B is complete.
- Stage C is partially implemented.
- Stage C must now be brought to full completion.

The existing architecture is event-driven and local-first. The core engine is the source of orchestration behavior, while CLI/TUI/server clients consume commands/events.

Preserve existing Stage A and Stage B behavior while implementing Stage C.

---

# 2. Stage C Scope

The Stage C tracker currently identifies these items:

| GAP | Capability | Current State |
|---|---|---|
| GAP-007 | Single-Model Mode | Missing |
| GAP-008 | Declarative Agent Definitions | Partial |
| GAP-009 | Reviewer/Tester Feedback Loop | Missing |
| GAP-013 | Parallel Execution Concurrency | Partial |
| GAP-012 | Run Cancellation & Exit 130 | Missing |
| GAP-014 / GAP-050 | Context.md & Changelog.md Updates | Already implemented; verify and preserve |
| GAP-025 / GAP-026 / GAP-054 | Sessions, Compaction, Recovery | Partial |
| GAP-046 | Planner Repair & Model Fallback | Missing/partial |
| GAP-019 | Search Tool for Agents | Partial |
| GAP-027 | Live Task Graph View | Missing |

You must implement **all of them**, including the items currently marked partially/mostly implemented.

Do not leave any Stage C item as "known limitation", "stub", "future work", "partially implemented", or "not wired".

---

# 3. GAP-007 — Single-Model Mode

## Requirement

A user must be able to select one specific model and bypass `flappyauto` multi-agent orchestration.

The selected model must still obey **all existing safety and routing rules**.

### Implement

- Wire the existing CLI `--model <model-id>` option into the actual execution path.
- Ensure the parsed model option is not merely stored/ignored.
- Add the corresponding execution mode in the core orchestration layer.
- Single-model execution must:
  - use the explicitly selected model;
  - not silently switch to the normal multi-agent planner;
  - still enforce PlanGate;
  - still enforce permission checks;
  - still enforce filesystem jail;
  - still enforce secret redaction;
  - still enforce paid-model safety rules;
  - still use the existing tool layer;
  - still produce the normal typed event stream.
- If the requested model is unavailable, disabled, exhausted, or otherwise unusable, handle the condition according to the project's documented model/fallback policy. Do not silently violate an explicit user model selection.
- Make single-model mode available through all applicable interfaces already specified by the project documentation, including the model picker where required.

### Tests

Add tests proving:

1. `--model X` actually selects X.
2. `--model X` does not invoke the multi-agent planner unnecessarily.
3. The selected model receives the correct task.
4. Safety gates remain active.
5. An unavailable pinned model follows the configured fallback policy.
6. Paid-model protections remain intact.
7. JSON/headless and interactive paths behave consistently where applicable.

---

# 4. GAP-008 — Declarative Agent Definitions

## Requirement

Agents must be declaratively definable and loadable from project files.

The documented architecture specifies project-level agent definitions under:

```text
.flappycode/agents/
```

The definition must support the documented agent properties, including:

- name
- system prompt
- allowed tools
- preferred model/reference
- fallback policy

## Implement

Build a complete declarative agent-definition system.

### Required behavior

- Create a schema-validated agent definition format based on the existing protocol/types and documentation.
- Support the documented YAML/Markdown format(s) rather than inventing an incompatible format.
- Scan the project's `.flappycode/agents/` directory.
- Load all valid definitions.
- Merge custom definitions with built-in agents according to deterministic precedence.
- Preserve built-in agents when no override exists.
- Permit project-specific custom agents.
- Validate every loaded definition.
- Reject invalid definitions with clear, actionable errors.
- Prevent malformed definitions from silently corrupting the agent registry.
- Honor:
  - custom prompt;
  - allowed tools;
  - preferred model;
  - fallback policy.
- Integrate loaded definitions into the actual orchestrator/router.
- Persist or expose definitions through the existing protocol/storage surfaces where the existing architecture requires it.
- Ensure definitions are scoped to the current project and cannot escape project boundaries.

### Tests

Create fixtures covering:

- valid custom agent;
- multiple custom agents;
- overriding a built-in agent;
- custom tools;
- custom model binding;
- custom fallback policy;
- invalid schema;
- malformed YAML/Markdown;
- missing required fields;
- duplicate definitions;
- project without `.flappycode/agents/`;
- custom agent actually executing in a real run.

---

# 5. GAP-009 — Reviewer/Tester → Coder Feedback Loop

## Requirement

The Reviewer and Tester must be able to send failures back to the Coder.

The loop must be bounded.

Default:

```text
max iterations = 3
```

After the maximum number of unsuccessful iterations, the system must escalate instead of looping forever.

This requirement also covers the test-fix loop.

## Current defect

The current execution is effectively single-shot:

```text
model completion
→ tool calls
→ node completion
```

There is no complete multi-turn feedback conversation.

## Implement

Create a real multi-turn orchestration loop.

### Expected flow

```text
Planner
   ↓
File-Finder
   ↓
Coder
   ↓
Tester
   ↓
Tester result
   ├── PASS → Reviewer
   └── FAIL → Coder
                  ↓
               fix code
                  ↓
               Tester
                  ↓
               ...
   ↓
Reviewer
   ├── PASS → complete
   └── FAIL → Coder
                  ↓
               fix code
                  ↓
               Tester/Reviewer
                  ↓
               ...
```

### Requirements

- Preserve conversation/tool results between iterations.
- Feed upstream results to downstream agents.
- Reviewer receives:
  - relevant task context;
  - changed files;
  - relevant diff;
  - Tester output;
  - prior feedback;
  - applicable rules/context.
- Tester receives:
  - implementation context;
  - relevant files;
  - changed files;
  - test results from previous iterations where applicable.
- Coder receives structured failure feedback.
- Preserve tool-call results verbatim according to architecture/rules.
- Maintain iteration counters per feedback loop.
- Make maximum iterations configurable.
- Default to 3.
- Stop immediately on success.
- Emit appropriate events for:
  - feedback;
  - retry/iteration;
  - escalation;
  - completion/failure.
- Avoid duplicate or stale feedback.
- Prevent infinite loops.
- Do not bypass approval/safety gates during subsequent iterations.
- Test-fix iterations must re-run tests after each attempted fix.
- Reviewer and Tester must be able to independently trigger feedback.

### Escalation

After the configured maximum:

- stop automatic retrying;
- emit an explicit escalation/failure event;
- preserve the useful diagnostic information;
- expose the state to the user;
- do not silently declare success.

### Tests

At minimum:

1. Tester fails once → Coder receives failure → Coder fixes → Tester passes.
2. Tester fails twice → two feedback iterations occur.
3. Tester fails three times → bounded behavior.
4. Reviewer fails → Coder receives reviewer feedback.
5. Reviewer passes → no unnecessary extra Coder iteration.
6. Tester and Reviewer both participate correctly.
7. Tool results are preserved between turns.
8. Iteration count never exceeds configured maximum.
9. Failure escalation is observable.
10. Safety gates remain enforced during every retry.

---

# 6. GAP-013 — Parallel Execution and Concurrency

## Requirement

Independent DAG nodes must execute in parallel.

Dependent nodes must remain sequential.

Concurrency must be strictly bounded.

## Current known issue

The existing `DagExecutor` has an off-by-one issue involving logic equivalent to:

```ts
Math.max(1, slotsAvailable)
```

which can admit one additional task beyond the configured concurrency.

## Implement

- Correct concurrency-slot calculation.
- Never execute more than the configured maximum number of nodes simultaneously.
- Preserve dependency ordering.
- Ensure independent nodes overlap in time.
- Integrate provider/model concurrency state and leases where the architecture requires it.
- Ensure cancellation propagates to all active nodes.
- Ensure a failed node does not deadlock unrelated independent nodes.
- Ensure dependent nodes do not start before dependencies finish successfully/appropriately.
- Ensure the executor works with both sequential and highly parallel graphs.
- Avoid race conditions around queue mutation, cancellation, and completion.

### Tests

Use deterministic test doubles with controllable delays.

Verify:

- two independent nodes overlap;
- three independent nodes overlap when concurrency ≥ 3;
- a concurrency limit of 1 produces sequential execution;
- concurrency limit N never exceeds N active nodes;
- no off-by-one execution;
- dependency edges remain sequential;
- mixed independent/dependent DAGs behave correctly;
- cancellation stops pending and active work appropriately.

Use timestamps or active-count instrumentation to prove real overlap rather than merely asserting completion order.

---

# 7. GAP-012 — Run Cancellation and Exit Code 130

## Requirement

A running task must be cancellable.

Supported cancellation input must follow the project CLI design, including:

- `Ctrl-C` / SIGINT;
- `Esc` in interactive TUI where applicable.

Cancellation must not corrupt the project tree.

## Implement

- Wire CLI SIGINT handling into the engine cancellation API.
- Wire TUI Esc into cancellation rather than directly exiting the process.
- Use the existing `AbortSignal`/cancellation mechanism.
- Propagate cancellation to:
  - DAG executor;
  - active agent calls;
  - active connector calls where supported;
  - tool execution;
  - pending nodes.
- Mark affected nodes/runs as cancelled.
- Persist cancelled run state where session/recovery storage requires it.
- Ensure staged/partial changes remain safe.
- Use undo/recovery mechanisms according to the existing architecture.
- Exit with code:

```text
130
```

for cancelled headless runs.
- Emit a structured cancellation event.
- Do not report a cancellation as a generic success.
- Do not report a cancellation as an unrelated model/provider error.
- Ensure cleanup occurs before process exit.
- Remove event listeners/abort handlers during teardown.

### Tests

- SIGINT during planner.
- SIGINT during an agent completion.
- SIGINT during tool execution.
- Esc during interactive execution.
- Cancellation with pending DAG nodes.
- Cancellation with multiple parallel nodes.
- Cancellation after staged changes.
- Verify no corrupted files.
- Verify cancellation state is persisted.
- Verify exit code 130.
- Verify JSON/NDJSON event stream remains valid.

---

# 8. GAP-025 — Sessions, Persistence, and Resume

## Requirement

Every coding run must create/update a persistent session containing structured context.

The project already has session storage infrastructure; wire it into the actual execution lifecycle.

## Implement

At run start:

- create or resume a session;
- persist run/session metadata.

During execution persist relevant:

- user turns;
- agent turns;
- tool outputs;
- retrieved files/context;
- task graph/run state;
- model selections where appropriate;
- feedback iterations;
- cancellation/failure/completion state.

At run completion:

- persist final state.

Implement:

```text
flappycode sessions list
flappycode sessions delete
flappycode sessions resume <session-id>
```

and the documented equivalent resume flow.

Implement:

```text
flappycode run ... --continue
```

if required by the project CLI specification.

### Resume behavior

After process restart:

1. session remains in SQLite;
2. previous context can be reconstructed;
3. the user can resume;
4. context is not fabricated;
5. the resumed task continues from the persisted state;
6. already-completed work is not blindly repeated;
7. safety approvals are not incorrectly assumed to remain valid if the architecture says they must be re-approved.

### Tests

- run → persist → restart engine → list session;
- resume session;
- verify previous messages/context exist;
- verify tool outputs are restored;
- verify interrupted run recovery;
- verify cancelled run recovery;
- verify corrupted/incomplete session is handled safely;
- verify session isolation between projects.

---

# 9. GAP-026 — Context Compaction, Project Memory, and Agent Context Slices

## Requirement

Context management must be wired into actual agent execution.

The existing `ContextManager` must not remain a dead utility.

## Implement

### Context compaction

When approaching the model context limit:

- detect the threshold;
- summarize older conversation/context;
- preserve important information;
- replace older verbose history with the summary;
- retain recent messages;
- notify the user through the appropriate event/UI;
- never silently discard important context.

Use the existing documented heuristic/configuration rather than inventing a conflicting policy.

### Project memory

Persist project memory appropriately.

It must:

- survive process restart;
- be project-scoped;
- feed the maintained project context;
- integrate with `Context.md` according to the documented design.

### Per-agent context slices

Each agent should receive only the context relevant to its role.

Examples:

- File-Finder → task + search context;
- Coder → task + relevant files + plan + feedback;
- Tester → implementation + test context + relevant changes;
- Reviewer → diff + requirements + test results + relevant context.

Do not send identical, unnecessarily large context to every agent.

### Tests

- long conversation triggers compaction;
- compaction emits an event/notice;
- important information survives compaction;
- project memory survives restart;
- different agents receive different appropriate context slices;
- no context is silently lost;
- context stays within model limits.

---

# 10. GAP-046 — Planner Repair and Model Fallback

## Requirement

Planner output is schema validated.

On invalid planner output:

1. attempt one repair;
2. if repair still fails, use the model fallback mechanism;
3. only fail after the configured fallback path is exhausted.

Do not use a hard-coded default graph as a substitute for the required model fallback unless the project documentation explicitly defines such behavior as the final emergency path.

## Implement

- Preserve schema validation.
- Produce a structured repair prompt containing the validation failure.
- Allow exactly one repair attempt for the same planner/model attempt.
- If repaired output is still invalid:
  - mark planner model as failed where appropriate;
  - use Stage B fallback infrastructure;
  - select the next eligible planner model;
  - request a fresh valid plan;
  - validate it.
- Ensure paid-model protections remain active.
- Preserve fallback eventing and model substitution eventing.
- Do not loop indefinitely.
- If all planner candidates fail, surface an honest planner failure/pool exhaustion state.

### Tests

1. valid plan → immediate success.
2. invalid output → repair succeeds.
3. invalid output → repair fails → next model selected.
4. first planner model fails schema and second succeeds.
5. multiple planner models fail.
6. all planner candidates fail.
7. no paid model is silently called.
8. fallback/substitution events are emitted.
9. malformed planner output never reaches DAG execution.

---

# 11. GAP-019 — Search Tool for Agents

## Requirement

Lexical codebase search is a P0 capability.

The existing `SearchTool` must be exposed through the real agent tool system.

## Implement

- Add the existing search tool to the appropriate agents' `allowed_tools`.
- Wire it into actual `runAgentStep`/agent execution.
- Preserve project-root jail restrictions.
- Prevent searching outside the project.
- Preserve secret/redaction rules.
- Ensure search results can be fed into subsequent agent context.
- Ensure custom declarative agents can request the tool when allowed.
- Do not expose tools that the agent definition does not permit.

### Tests

- Coder can invoke search.
- File-Finder can invoke search where configured.
- Search results appear in agent context.
- Search cannot escape project root.
- Disallowed agent cannot use search.
- Search works in a real orchestration run, not only an isolated unit test.

---

# 12. GAP-027 — Live Task Graph and Run View

## Requirement

The interactive TUI must display the task graph live.

The graph should communicate at minimum:

- agent;
- node/task;
- dependency/state;
- status;
- selected model;
- substitutions;
- progress.

The status bar must correctly transition between documented states, including:

- ready;
- working;
- waiting for approval;
- pool exhausted;
- cancelled;
- completed/appropriate final state.

## Implement

Create the documented task-graph/run-view screen.

### Event-driven state

Do not build a disconnected fake UI.

The UI state must be derived from the engine event stream.

Handle relevant events including:

- run started;
- plan proposed;
- node started;
- node finished;
- node failed;
- model selected;
- model substituted;
- approval requested;
- feedback/retry;
- pool exhausted;
- cancellation;
- run completed;
- run failed.

### Graph behavior

Display:

```text
Planner
  │
  ├── File-Finder
  │      │
  │      ▼
  │    Coder
  │      │
  │      ├── Tester
  │      │     └── FAIL → Coder
  │      │
  │      └── Reviewer
  │             └── FAIL → Coder
```

The actual graph must be generated from the run's DAG, not hard-coded.

Show model substitutions on the affected node.

Ensure responsive rendering at the documented terminal widths.

### Tests

Use event fixtures and integration tests to verify:

- graph appears;
- node states update;
- models update;
- substitutions appear;
- feedback iterations appear;
- status bar transitions;
- cancellation state appears;
- pool exhaustion state appears;
- completion state appears;
- layout works at 60/80/120 columns or the documented target widths.

---

# 13. GAP-014 / GAP-050 — Context.md and Changelog.md

These are already reported as implemented, but **verify them as part of Stage C completion**.

Do not regress the existing behavior.

After approved changes:

- update `Context.md`;
- append a timestamped `Changelog.md` entry;
- ensure missing files can be created;
- ensure the generated documentation accurately describes the actual Stage C implementation.

The final Stage C changelog entry must include:

- date/time;
- Stage C completion;
- implemented GAPs;
- important architectural changes;
- test/verification evidence;
- final validation results.

---

# 14. Cross-Cutting Orchestration Requirements

Stage C must operate as one coherent system.

Do not implement each GAP as an isolated patch.

The final execution model should support:

```text
User request
   ↓
Session create/resume
   ↓
Planner
   ↓
schema validation
   ↓
repair if needed
   ↓
planner model fallback if needed
   ↓
approved task graph
   ↓
DAG execution
   ├── sequential dependencies
   └── bounded parallel branches
          ↓
     specialist agents
          ↓
     tools/search/context
          ↓
     Tester/Reviewer
          ↓
     feedback loop
          ├── pass → continue
          └── fail → bounded Coder retry
                          ↓
                     Tester/Reviewer
          ↓
     final state
   ↓
session persistence
   ↓
Context.md update
   ↓
Changelog.md update
```

All of the following must remain active throughout:

- PlanGate;
- permission engine;
- filesystem jail;
- secret guard;
- zero-paid gate;
- Stage B fallback executor;
- model substitution eventing;
- provider rate limiting/concurrency;
- audit logging;
- undo/recovery;
- event-sourced UI.

---

# 15. Event and Protocol Integrity

Before adding new events, inspect the existing protocol.

Prefer existing event types when they already represent the required behavior.

If Stage C requires new events:

1. add them to the shared protocol;
2. update Zod schemas;
3. update TypeScript types;
4. update event consumers;
5. update tests;
6. preserve backward compatibility where appropriate.

Do not emit undocumented ad-hoc event objects.

Every event must accurately represent what happened.

Never fabricate:

- user approval;
- tool execution;
- agent result;
- test result;
- model selection;
- session state.

---

# 16. Storage and Recovery Integrity

Use the existing SQLite repositories and migrations.

Do not create parallel in-memory state when persistent state is required.

If schema changes are needed:

- create a proper migration;
- preserve existing data;
- test migration;
- verify fresh database creation;
- verify upgrade from the current schema.

Persist enough state to recover Stage C runs safely.

---

# 17. CLI/TUI Integration

Do not stop at core implementation.

Every Stage C feature that has a user-facing CLI/TUI requirement must be wired into the real client.

Specifically verify:

- `--model`;
- `--continue`;
- sessions commands;
- cancellation;
- live task graph;
- status bar;
- feedback/retry visibility;
- planner failure/fallback messaging;
- declarative agent loading/errors;
- search availability through agent execution.

Do not leave a screen/component unused.

Do not leave a CLI option parsed but ignored.

Do not leave a core method with zero real call sites when that method is required for Stage C.

---

# 18. Testing Strategy

Do not rely only on existing tests.

Add a dedicated Stage C test suite.

Suggested structure:

```text
tests/unit/stage-c-*.test.ts
tests/integration/stage-c-*.test.ts
tests/fixtures/agents/...
tests/fixtures/projects/...
```

Use the existing mock provider/chaos infrastructure wherever possible.

## Required test categories

### Single model

- selection;
- execution;
- unavailable model;
- safety;
- paid gate.

### Declarative agents

- valid definitions;
- invalid definitions;
- custom tools;
- model binding;
- fallback policy;
- runtime execution.

### Feedback loop

- tester fail → coder;
- reviewer fail → coder;
- successful retry;
- max-3 escalation;
- bounded iterations.

### Parallel DAG

- actual overlap;
- strict concurrency cap;
- dependencies;
- mixed graph.

### Cancellation

- SIGINT;
- Esc;
- active node;
- pending node;
- parallel nodes;
- exit 130;
- recovery.

### Sessions

- create;
- update;
- list;
- resume;
- continue;
- restart recovery.

### Context

- compaction;
- summary preservation;
- project memory;
- per-agent slices.

### Planner

- valid;
- repair;
- fallback;
- all candidates fail.

### Search

- exposed tool;
- successful invocation;
- jail;
- permissions.

### Task graph

- event replay;
- live state;
- substitution;
- feedback;
- cancellation;
- status bar;
- responsive layout.

---

# 19. End-to-End Simulation Requirements

After implementation, run realistic simulations using the repository's mock provider infrastructure.

At minimum simulate:

## Simulation A — Normal multi-agent task

```text
user request
→ planner
→ file finder
→ coder
→ tester
→ reviewer
→ completion
```

Verify:

- session created;
- DAG visible;
- correct model selection;
- context passed;
- tools work;
- final state persisted;
- Context.md updated;
- Changelog.md updated.

## Simulation B — Tester failure and recovery

```text
Coder
→ Tester FAIL
→ Coder feedback
→ Tester PASS
→ Reviewer PASS
```

Verify exactly the expected iterations.

## Simulation C — Reviewer failure and recovery

```text
Coder
→ Tester PASS
→ Reviewer FAIL
→ Coder feedback
→ Tester
→ Reviewer PASS
```

## Simulation D — Planner repair

```text
invalid planner output
→ repair
→ valid plan
→ execution
```

## Simulation E — Planner model fallback

```text
planner model invalid
→ repair fails
→ fallback model
→ valid plan
```

## Simulation F — Parallel graph

Use at least two independent slow nodes and verify real overlap without exceeding concurrency.

## Simulation G — Cancellation

Cancel while work is active.

Verify:

- no corrupted tree;
- cancellation event;
- persisted cancelled session;
- exit 130;
- no orphaned work.

## Simulation H — Resume

```text
start run
→ interrupt/cancel/process restart
→ sessions list
→ resume
→ continue with recovered context
```

## Simulation I — Single-model mode

Run a task with:

```text
flappycode run "<task>" --model <known-free-model>
```

Verify it bypasses multi-agent orchestration as specified.

## Simulation J — Custom agent

Create:

```text
.flappycode/agents/<custom-agent>.yaml
```

Run a task requiring that agent and verify the custom prompt/tool/model configuration is actually honored.

---

# 20. Validation Commands

Use the repository's actual package manager and scripts.

At minimum run:

```bash
pnpm lint
pnpm test
pnpm build
```

Also run:

- all Stage C unit tests;
- all Stage C integration tests;
- relevant existing Stage A tests;
- relevant existing Stage B tests;
- end-to-end simulations;
- package/CLI smoke tests if available.

If the project uses additional verification commands documented in the repository, run them too.

Do not stop after the first passing command.

---

# 21. Regression Requirements

Stage C implementation must not regress:

- Stage A safety guarantees;
- Stage B fallback behavior;
- zero-paid invariant;
- pool exhaustion behavior;
- model substitution events;
- Retry-After/backoff;
- registry revalidation;
- model overrides;
- approval gates;
- filesystem jail;
- permission enforcement;
- audit logging;
- secret redaction;
- undo;
- server behavior.

If an existing test fails after the implementation, investigate and fix the regression rather than weakening/removing the test.

Do not modify tests merely to make incorrect behavior appear correct.

---

# 22. Documentation Completion

Once implementation and verification are complete, update:

### `docs/progress_tracker.md`

Change Stage C from:

```text
🔴 Partially Done
```

to the appropriate completed state used by the project.

Every Stage C GAP must accurately show completion.

Include concrete implementation references and test evidence.

### `docs/PHASE1_GAPS.md`

Update the Stage C gap entries so their statuses, evidence, required work, and verification sections reflect the actual final state.

Do not delete historical information that is required for traceability; mark the gap as completed and add final evidence.

### `docs/PHASE1_IMPLEMENTATION_AUDIT.md`

Update Stage C-related findings/traceability where appropriate so the audit reflects the post-implementation state.

Do not rewrite unrelated historical audit findings.

### `Context.md`

Add/update the current project state to describe Stage C completion and the resulting architecture.

### `Changelog.md`

Add a new dated Stage C completion entry describing:

- GAP-007;
- GAP-008;
- GAP-009;
- GAP-012;
- GAP-013;
- GAP-019;
- GAP-025;
- GAP-026;
- GAP-027;
- GAP-046;
- verification results;
- test counts;
- build/lint results;
- simulations completed.

Documentation must describe **what was actually implemented**, not what was intended.

---

# 23. Stage C Definition of Done

Do not declare Stage C complete until all of the following are true:

- [ ] GAP-007 single-model mode works end-to-end.
- [ ] GAP-008 declarative agent files work end-to-end.
- [ ] GAP-009 Tester/Reviewer → Coder feedback loop works and is bounded.
- [ ] GAP-013 parallel execution is real and strictly bounded.
- [ ] GAP-012 cancellation works through SIGINT/Esc and exits 130.
- [ ] GAP-025 sessions are actually persisted and resumable.
- [ ] GAP-026 context compaction and context slicing are actually wired.
- [ ] GAP-046 planner repair and model fallback work.
- [ ] GAP-019 search is available to appropriate agents.
- [ ] GAP-027 live task graph is rendered from real events.
- [ ] GAP-014/GAP-050 documentation lifecycle remains functional.
- [ ] All Stage C functionality is wired into real execution paths.
- [ ] No Stage C method/flag/screen exists only as dead code.
- [ ] No Stage C requirement is satisfied only by a unit test while the real execution path remains broken.
- [ ] Stage A and Stage B regression tests pass.
- [ ] Stage C unit tests pass.
- [ ] Stage C integration tests pass.
- [ ] End-to-end simulations pass.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm build` passes.
- [ ] Documentation is updated with evidence.
- [ ] No unrelated Stage D/E/F/G feature work is introduced unless it is strictly necessary to complete Stage C.

---

# 24. Important Implementation Discipline

## Do not:

- stop after implementing only the obvious missing features;
- assume "partial" means "good enough";
- create fake UI disconnected from events;
- leave CLI flags parsed but unused;
- leave storage repositories unused;
- hard-code test-specific behavior;
- hard-code a default plan where model fallback is required;
- bypass safety gates during feedback iterations;
- silently exceed concurrency;
- silently discard context;
- fabricate successful tests or approvals;
- weaken existing safety checks to make orchestration easier;
- delete historical audit information;
- mark documentation complete before runtime verification;
- expand the scope into unrelated Stage D/E/F/G work.

## Do:

- inspect existing implementation first;
- reuse existing abstractions;
- preserve architectural boundaries;
- integrate with the event bus;
- use existing Stage B fallback infrastructure;
- use existing SQLite repositories;
- use existing TUI patterns;
- use deterministic mock providers for simulations;
- add regression tests for every bug fixed;
- verify behavior through the real execution path;
- document evidence.

---

# 25. Final Required Output

At the end of the implementation, provide a concise engineering completion report containing:

## Implementation summary

List every Stage C GAP and what was implemented.

## Files changed

Group by:

- protocol;
- core;
- storage;
- CLI;
- TUI;
- tests;
- documentation.

## Verification

Report exact results for:

```text
pnpm lint
pnpm test
pnpm build
```

and all Stage C simulations.

Include the final test count.

## Stage C status

Explicitly state whether **every Stage C requirement is complete**.

If anything is not complete, do **not** claim completion. Identify the exact remaining requirement and why.

---

# Final Instruction

**Implement Stage C completely.**

Treat the existing code as a partially completed implementation that must be finished, not as a greenfield project.

The success criterion is not "the missing files now exist."

The success criterion is:

> **The complete Stage C multi-agent orchestration system works end-to-end in the real FlappyCode execution path, all partial implementations are completed, all missing implementations are implemented, tests and simulations prove the behavior, existing safety and Stage B guarantees remain intact, and the documentation accurately records the completed Stage C implementation.**
