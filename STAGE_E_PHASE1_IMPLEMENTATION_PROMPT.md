# Stage E — CLI & Server Correctness: Complete Implementation Prompt

## Role

You are implementing **Stage E of FlappyCode Phase 1** in the existing repository.

Your task is **not** to write a partial patch, proof-of-concept, mock implementation, or documentation-only change. You must inspect the current repository, understand the existing Stage A–D implementation, and then **fully implement every Stage E requirement, including all currently partial and missing implementation**.

Stage E is:

> **CLI & Server Correctness — Headless exit codes, structured `run.failed`, honest server command handling, local debug logging, and consistent error formatting.**

The current tracker says Stage E is only partially complete. Treat that status as the starting point, not the desired end state.

---

# 1. Mandatory Context

Before modifying code, read and use these sources as the authoritative project context:

### Repository documentation

All project documentation is under:

```text
docs/
```

Relevant documents include, at minimum:

```text
docs/PHASE1_GAPS.md
docs/PHASE1_IMPLEMENTATION_AUDIT.md
docs/progress_tracker.md
docs/SystemArchitecture.md
docs/TaskBreakdown.md
docs/PRD.md
docs/SRS.md
docs/CLIDesign.md
```

Also read the root-level project context files:

```text
Context.md
Changelog.md
```

If filenames differ slightly from the above, locate the corresponding documents in the repository rather than inventing replacements.

### Important

The Stage A–D implementation has already been completed according to the current progress tracker. **Do not regress or reimplement completed Stage A–D functionality.**

The current tracker records:

- Stage B — complete
- Stage C — complete
- Stage D — complete
- Stage E — partially done

The current Stage E gap set is:

- `GAP-024` — Headless Exit Code Contract
- `GAP-051` — Structured `run.failed` in JSON mode
- `GAP-052` — Honest Server Command Handling
- `GAP-056` — Local Debug Logging
- `GAP-058` — Consistent Error Formatting

The progress tracker explicitly describes Stage E as:

> CLI & Server Correctness — Headless exit codes 2/130, structured `run.failed` event, server command handling, debug logging, error formatting.

Do not move on to Stage F or G unless required incidentally to make Stage E correct.

---

# 2. Primary Objective

## Completely implement Stage E

Every Stage E gap must end in a genuinely implemented, wired, tested, and usable state.

This means:

- no placeholder implementations;
- no dead code;
- no unused handlers;
- no "success" response for an operation that did not actually execute;
- no silent fallback to old behavior;
- no partially wired event;
- no CLI flag that parses but does nothing;
- no server command that acknowledges without performing the command;
- no generic error wrapper that loses structured error information;
- no debug logger that leaks secrets;
- no documentation claiming completion without test evidence.

The final repository should behave as though Stage E had been designed correctly from the beginning.

---

# 3. Non-Negotiable Implementation Rules

## 3.1 Inspect before changing

First inspect:

- current CLI entry point;
- Commander/argument parsing;
- headless `run`;
- JSON/NDJSON event streaming;
- cancellation handling;
- exit-code handling;
- event schemas and event bus;
- server command endpoint;
- command protocol schemas;
- engine command handlers;
- existing error paths;
- existing redaction utilities;
- config system;
- filesystem/data directories;
- current TUI/headless distinction;
- existing tests and fixtures.

Use the actual current implementation as the source of truth for integration points.

Do not assume the audit's old implementation details are still unchanged. The audit describes the defects that existed before Stage B–D completion.

---

# 4. GAP-024 — Headless Exit Code Contract

## Required contract

The CLI must implement the documented exit-code contract:

| Code | Meaning |
|---:|---|
| `0` | Successful completion |
| `1` | Task/run failure |
| `2` | Usage error |
| `3` | Approval required |
| `4` | Free model pool exhausted |
| `5` | No providers available |
| `130` | Run cancelled |

The exact meanings must remain consistent with the project documentation.

## Current known defects

The audit found:

- usage errors exit `1` instead of `2`;
- unknown commands can launch the TUI and exit successfully instead of being treated as usage errors;
- cancellation code `130` was unreachable at audit time;
- a reachable CLI success path using the mock provider was not proven.

Stage C subsequently implemented cancellation in the engine, including `run.cancelled` and exit code `130`. Stage E must ensure this is **correctly surfaced through the CLI process boundary**.

## Implement completely

### A. Usage errors

Implement a single, deterministic usage-error path.

Examples must include:

```text
flappycode run
flappycode <invalid-command>
flappycode run --invalid-option
```

These must:

- display an appropriate usage/error message;
- return exit code `2`;
- not start a task;
- not create a false success event;
- not initialize a full interactive run unnecessarily.

Unknown commands must not silently launch the normal TUI.

### B. Cancellation

Wire the already-existing Stage C cancellation mechanism all the way through the CLI process.

Verify:

```text
SIGINT / Ctrl+C
```

during an active headless run results in:

- cancellation being propagated to the engine;
- in-flight work being aborted where supported;
- run/node state becoming cancelled as appropriate;
- `run.cancelled` being emitted;
- process exit code `130`;
- no misleading `run.completed`;
- no misleading exit code `1`.

Handle cancellation races safely.

For example, if cancellation and completion occur almost simultaneously, the final terminal state must be deterministic and must not emit contradictory terminal outcomes.

### C. Success path

Create or use a deterministic mock-provider scenario that allows a complete headless CLI run to succeed.

Verify an actual process invocation returns:

```text
exit code 0
```

and emits the correct completion events.

Do not fake success merely to test the exit code.

### D. Preserve existing codes

Do not regress:

- `1` task failure;
- `3` missing plan approval;
- `4` pool exhaustion;
- `5` no providers.

Create an explicit exit-code mapping layer rather than scattering numeric literals throughout the CLI.

Prefer named constants/enums/types where compatible with the existing architecture.

---

# 5. GAP-051 — Structured `run.failed` in JSON Mode

## Requirement

Headless JSON mode must provide a machine-readable failure event.

The project already has an event-sourced architecture. Follow the existing protocol/event conventions rather than inventing a second event system.

When a run fails, `--json` / NDJSON mode must emit:

```text
run.failed
```

with enough structured information for a machine consumer to understand the failure.

## Implement completely

### A. Protocol

If the event schema is incomplete:

- add the `run.failed` event to the shared protocol;
- validate it using the existing schema system;
- use consistent run identifiers and timestamps;
- include structured error information appropriate to the existing protocol design.

Do not put secrets, API keys, credentials, or raw sensitive provider data into the event.

### B. Event emission

Ensure every relevant terminal failure path can produce `run.failed`, including failures originating from:

- planner/execution failure;
- provider/model failure after fallback is exhausted;
- tool failure;
- permission/approval-related terminal failure where applicable;
- unexpected engine failure;
- cancellation only if the existing protocol explicitly requires a failure event — otherwise preserve `run.cancelled` as the cancellation terminal event.

Do not emit both `run.failed` and `run.completed` for the same terminal run.

### C. JSON/NDJSON behavior

For:

```text
flappycode run "<prompt>" --approve-plan --json
```

the output must remain valid NDJSON.

Every stdout line in JSON mode must be valid JSON according to the established CLI contract.

Do not print human-readable error banners into stdout in JSON mode.

Human-readable diagnostics may go to stderr where appropriate, but must not corrupt the JSON event stream.

### D. Exit-code alignment

`run.failed` must correspond to the appropriate process exit code.

For an ordinary task failure:

```text
run.failed + exit 1
```

For cancellation:

```text
run.cancelled + exit 130
```

Do not represent cancellation as an ordinary failure.

### E. Structured error payload

The event should expose structured information such as:

- stable error code/category;
- what happened;
- why it happened when known;
- next action/remediation;
- optional safe diagnostic details.

Use the project's existing error architecture once implemented under GAP-058.

Avoid exposing stack traces or secrets to normal JSON consumers unless explicitly required by debug mode.

---

# 6. GAP-052 — Honest Server Command Handling

## Requirement

The loopback server must execute supported commands honestly.

The audit found that an authenticated request such as:

```json
{"type":"cancelRun"}
```

could receive:

```json
{"success":true}
```

even though the operation was not actually implemented.

This behavior is unacceptable.

## Implement completely

### A. Inventory all server commands

Inspect:

- protocol command definitions;
- `/v1/commands`;
- server command dispatch;
- engine command methods;
- CLI command handlers;
- TUI-triggered commands.

Build a complete command-to-handler matrix.

Every command must be classified as exactly one of:

1. implemented and executable;
2. intentionally unsupported and explicitly rejected;
3. malformed/invalid request.

There must be no fake acknowledgement.

### B. Real command dispatch

For every Stage E-relevant command:

- validate the command against the protocol schema;
- authorize it appropriately;
- execute the actual engine operation;
- return the actual result;
- surface real failures;
- preserve event-bus behavior.

In particular, ensure commands related to:

- run cancellation;
- pool-exhaustion resolution;
- approvals;
- permissions;
- provider/model/config operations where already supported by the protocol;

do not merely acknowledge receipt.

Do not duplicate core business logic in the HTTP server. The server should remain a thin interface over the core engine as specified by the architecture.

### C. Unsupported commands

If a command is defined but not implemented, return an explicit unsupported/error response.

Do **not** return:

```json
{"success":true}
```

unless the operation actually succeeded.

Use an appropriate HTTP status and structured error body consistent with the existing API design.

### D. Invalid command handling

Malformed JSON, unknown command types, invalid command payloads, nonexistent run IDs, invalid state transitions, and unauthorized requests must produce deterministic errors.

Do not crash the server.

Do not leak internal stack traces by default.

### E. Authentication and loopback guarantees

Preserve the existing server guarantees:

- bind only to `127.0.0.1`;
- bearer-token authentication;
- no default public binding;
- CORS behavior;
- SSE behavior.

Stage E must not weaken these protections.

---

# 7. GAP-056 — Local Debug Logging

## Requirement

Implement local structured logging/debug logging.

The project documentation requires logs to be:

- local;
- secret-safe;
- structured;
- size-rotated;
- useful for debugging;
- enabled through a debug mode.

The current implementation has no actual log file subsystem and no working `--debug` flag.

## Implement completely

### A. Logger subsystem

Create a reusable logger module in the appropriate package/layer.

Do not tie the logger directly to the CLI so tightly that the server/core cannot use it.

Support levels appropriate to the project, for example:

```text
error
warn
info
debug
```

Use the existing architecture/package boundaries.

### B. `--debug`

Implement the documented CLI debug flag.

It must:

- enable debug-level local logging;
- work for relevant headless/serve execution paths;
- not turn normal stdout into debug noise;
- not corrupt `--json` output.

If the existing CLI architecture has global options, integrate `--debug` there instead of adding a duplicate flag.

### C. Log location

Use the project's existing platform-aware local data/config directory conventions.

Do not hard-code a Windows-only path.

Respect existing:

- `LOCALAPPDATA`;
- `XDG_*`;
- platform-specific directory logic;
- project/user config conventions.

Do not store logs in the repository unless the architecture explicitly requires it.

### D. Structured records

Log records should contain useful fields such as:

```text
timestamp
level
component
event/message
runId when available
nodeId when available
error code when available
```

Do not log secrets.

### E. Secret redaction

Integrate the existing secret-redaction facilities.

Test against at least:

- API keys;
- bearer tokens;
- passwords;
- credential-like environment variables;
- provider secrets;
- sensitive command arguments where applicable.

Never log raw provider credentials.

Do not rely only on callers remembering to redact. The logger itself should have a final redaction boundary.

### F. Rotation

Implement deterministic size-based rotation.

The exact size/retention should follow existing project documentation/configuration if specified.

If the docs do not specify an exact number, choose a conservative documented default and make it configurable where appropriate.

Verify that:

- the active log does not grow without bound;
- rotation preserves recent logs;
- rotation is safe under repeated writes;
- startup handles existing oversized logs.

### G. Debug-only detail

Debug mode may contain substantially more diagnostic information, but must still respect secret and privacy boundaries.

Do not write prompts, API keys, provider credentials, or other sensitive content merely because `--debug` is enabled.

---

# 8. GAP-058 — Consistent Error Formatting

## Requirement

Every user-facing error must clearly communicate:

1. **What happened**
2. **Why it happened**, when known
3. **What the user should do next**

The audit specifically identified opaque messages such as:

```text
Coder agent completed without staging changes. Check model output or tool calls.
```

and generic:

```text
Task failed: ...
```

as insufficient.

## Implement completely

### A. Central error model

Create the appropriate shared error/formatting subsystem, expected by the gap register as an `errors.ts`-style implementation unless the current architecture provides a better equivalent.

Define structured error information with concepts such as:

- stable code;
- category;
- human-readable `what`;
- `why`;
- `next`;
- optional safe details;
- underlying cause for debug logs only.

### B. CLI formatter

Create consistent human-readable output.

Example conceptual shape:

```text
What: The task could not be completed.
Why: The selected model failed before producing the required changes.
Next: Retry the task, choose another model, or inspect the debug log with --debug.
```

Do not blindly copy this example. Adapt wording to the actual error.

### C. JSON formatter

JSON/NDJSON mode must receive structured error objects rather than preformatted terminal strings.

Do not force JSON consumers to parse human-readable error text.

### D. Server formatter

Server errors must use the same underlying error model.

Return structured API errors rather than arbitrary strings.

### E. Error catalogue

Audit the existing CLI/core/server error paths and replace generic/opaque messages relevant to Stage E.

At minimum inspect:

- argument/usage errors;
- provider errors;
- task failures;
- planner failures;
- model exhaustion;
- approval-required conditions;
- cancellation;
- invalid server commands;
- invalid run IDs;
- unsupported commands;
- internal errors.

### F. Safe fallback

Unknown/unexpected exceptions must still produce a useful safe message without leaking implementation internals.

Debug logs may contain diagnostic details according to the logger's security policy.

---

# 9. Cross-Cutting Integration Requirements

Stage E is not five isolated features.

Integrate the five gaps into one coherent error/command architecture.

The desired flow is:

```text
CLI / HTTP / TUI
      |
      v
Command + input validation
      |
      v
Core engine
      |
      +---- Event Bus ----> CLI JSON / SSE / TUI
      |
      +---- Error model --> Human / JSON / HTTP formatters
      |
      +---- Logger -------> Local rotated debug log
      |
      v
Correct terminal state
      |
      v
Correct process/API result
```

Do not create parallel incompatible representations of the same error.

A single underlying failure should be capable of being rendered as:

- human CLI output;
- JSON/NDJSON event data;
- HTTP structured error;
- debug log entry.

---

# 10. Testing Requirements

Do not consider Stage E complete because implementation compiles.

Add focused unit, integration, and end-to-end tests.

## 10.1 Exit-code matrix

Create an explicit test covering:

| Scenario | Expected |
|---|---:|
| successful run | `0` |
| ordinary task failure | `1` |
| missing/invalid required CLI argument | `2` |
| unknown command | `2` |
| approval required | `3` |
| free model pool exhausted | `4` |
| no providers | `5` |
| cancellation | `130` |

Use real process-level CLI tests where necessary. In-process tests alone are insufficient for exit-code behavior.

---

## 10.2 JSON failure tests

Verify:

- failure emits `run.failed`;
- event is schema-valid;
- event includes structured error information;
- JSON stdout contains only valid NDJSON;
- exit code is correct;
- no `run.completed` follows a failed terminal run;
- cancellation uses `run.cancelled` rather than being incorrectly reported as ordinary failure.

---

## 10.3 Server command tests

For every supported command, verify:

```text
request
  -> authentication
  -> validation
  -> real engine operation
  -> actual result
  -> correct event/state transition
```

Explicitly test:

- valid command;
- malformed command;
- unknown command;
- nonexistent run;
- invalid run state;
- unauthorized request;
- cancellation;
- pool exhaustion resolution;
- any other command currently defined in the protocol.

Add a regression test specifically proving that an unimplemented command can **never** return a fake success acknowledgement.

---

## 10.4 Debug logging tests

Verify:

1. `--debug` creates a local log.
2. normal execution does not unnecessarily emit debug-level records.
3. structured records contain expected metadata.
4. secrets are redacted.
5. oversized logs rotate.
6. multiple rotations behave correctly.
7. JSON stdout remains clean when `--debug --json` is used.
8. logs use the platform-aware local data path.

---

## 10.5 Error-format tests

Use snapshot or structural assertions where appropriate.

Verify representative errors contain:

```text
what
why
next
```

or their equivalent structured fields.

Verify:

- human CLI output is readable;
- JSON output is structured;
- HTTP output is structured;
- unexpected exceptions are safe;
- secrets are not exposed.

---

# 11. Simulation / Runtime Verification

After tests pass, perform actual runtime simulations.

Do not rely solely on unit tests.

At minimum run:

### Simulation A — Usage error

```text
flappycode run
```

Expected:

```text
exit 2
```

### Simulation B — Unknown command

```text
flappycode definitely-not-a-command
```

Expected:

```text
exit 2
```

and no normal TUI execution.

### Simulation C — No providers

Run a headless task in an isolated environment with no providers.

Expected:

```text
exit 5
```

### Simulation D — Approval required

Run without `--approve-plan`.

Expected:

```text
exit 3
```

### Simulation E — Pool exhausted

Configure an isolated all-paid/no-free pool.

Expected:

```text
exit 4
```

with zero paid calls unless the explicit paid-grant flow is intentionally exercised.

### Simulation F — Ordinary failure

Force a deterministic task failure.

Expected:

```text
run.failed
exit 1
```

### Simulation G — JSON failure

Run:

```text
flappycode run "<failure scenario>" --approve-plan --json
```

Verify every stdout line is valid JSON and a structured `run.failed` is present.

### Simulation H — Cancellation

Start a deliberately long-running mock scenario and send SIGINT.

Expected:

```text
run.cancelled
exit 130
```

### Simulation I — Server command

Start:

```text
flappycode serve
```

Then exercise authenticated `/v1/commands`.

Verify a real command actually changes engine state.

### Simulation J — Fake-success regression

Send a command that is invalid, unsupported, or impossible in the current state.

Expected:

- non-success response;
- structured error;
- no fake `{success:true}`.

### Simulation K — Debug logging

Run with:

```text
flappycode --debug ...
```

Verify:

- local log created;
- structured records;
- secrets redacted;
- rotation works.

### Simulation L — Debug + JSON

Run:

```text
flappycode --debug run "<prompt>" --approve-plan --json
```

Verify stdout remains pure NDJSON while debug information is written locally.

---

# 12. Regression Requirements

Stage E implementation must not break Stage A–D behavior.

Before declaring completion, rerun the full repository suite.

Pay particular attention to:

- approval gates;
- PlanGate;
- permission engine;
- FsJail;
- fallback executor;
- pool exhaustion;
- model substitution;
- scheduler;
- single-model mode;
- feedback loop;
- cancellation;
- sessions;
- ContextManager;
- RULES loading/conflict detection;
- provider diagnostics;
- config;
- Git safety;
- undo;
- TUI screens;
- event bus.

If an existing test conflicts with the actual documented Stage E contract, inspect the source documents and update the test only when the documented behavior clearly requires the change.

Do not weaken security/safety behavior to make Stage E tests pass.

---

# 13. Documentation Updates Are Part of the Implementation

After implementation and verification, update the project documentation.

Do not simply append "Stage E complete" without evidence.

## Required updates

### `docs/PHASE1_GAPS.md`

For:

- `GAP-024`
- `GAP-051`
- `GAP-052`
- `GAP-056`
- `GAP-058`

update:

- Status;
- What Exists;
- What Is Missing or Broken;
- Evidence;
- Expected Behavior;
- Required Work;
- Verification Needed;
- blocking status if appropriate.

The final entries must accurately describe the implementation that actually exists.

### `docs/progress_tracker.md`

Change Stage E from:

```text
🔶 Partially Done
```

to:

```text
✅ Complete
```

and update each Stage E row with:

- implementation summary;
- test/simulation evidence;
- relevant file/test references.

Do not claim completion if any Stage E row remains partial.

### `docs/TaskBreakdown.md`

Update the relevant Stage E checklist/status entries to reflect actual completion.

Preserve the existing document structure and terminology.

### `Context.md`

Add a concise current-state entry documenting:

- Stage E completion;
- major implementation areas;
- important test/simulation evidence;
- any limitations that genuinely remain.

Do not delete historical context.

### `Changelog.md`

Add a new reverse-chronological entry for Stage E.

Include:

- date/time;
- Stage E completion;
- GAP-024/051/052/056/058;
- major implementation changes;
- tests/simulations;
- final verification commands/results.

Do not claim a test passed unless it actually passed.

### Other docs

If the implementation changes documented architecture, protocol contracts, CLI behavior, server API behavior, or configuration semantics, update the relevant document(s), especially:

```text
docs/SystemArchitecture.md
docs/CLIDesign.md
docs/SRS.md
```

Only change normative documentation when the implementation genuinely establishes or corrects that behavior.

---

# 14. Verification Gate

Stage E is complete only when all of the following are true:

## Implementation

- [ ] GAP-024 fully implemented.
- [ ] GAP-051 fully implemented.
- [ ] GAP-052 fully implemented.
- [ ] GAP-056 fully implemented.
- [ ] GAP-058 fully implemented.
- [ ] No Stage E placeholder remains.
- [ ] No Stage E fake-success path remains.
- [ ] No dead Stage E handler/flag/event remains.
- [ ] Core/server/CLI integration is complete.

## Tests

- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] CLI process-level exit-code matrix passes.
- [ ] JSON/NDJSON failure tests pass.
- [ ] Server command tests pass.
- [ ] Debug logging tests pass.
- [ ] Error-format tests pass.
- [ ] Cancellation process-level test passes.
- [ ] Runtime simulations pass.

## Quality

- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm build` passes.
- [ ] Relevant coverage does not regress.
- [ ] No new TypeScript errors.
- [ ] No new security regression.
- [ ] No secrets appear in logs/events/errors.
- [ ] JSON stdout remains machine-readable.
- [ ] Server never reports success for an operation that did not execute.

## Documentation

- [ ] `docs/PHASE1_GAPS.md` updated.
- [ ] `docs/progress_tracker.md` updated.
- [ ] `docs/TaskBreakdown.md` updated.
- [ ] root `Context.md` updated.
- [ ] root `Changelog.md` updated.
- [ ] Any affected normative architecture/design docs updated.

---

# 15. Final Completion Report

At the end of the implementation, provide a concise completion report containing:

## Stage E status

```text
Stage E: COMPLETE
```

## Implemented gaps

```text
GAP-024 — COMPLETE
GAP-051 — COMPLETE
GAP-052 — COMPLETE
GAP-056 — COMPLETE
GAP-058 — COMPLETE
```

## Files changed

List the important implementation and test files.

## Tests

Report exact commands and actual results, for example:

```text
pnpm lint
pnpm test
pnpm build
```

plus the Stage E-specific test/simulation commands.

## Exit-code verification

Report actual observed results for:

```text
0 / 1 / 2 / 3 / 4 / 5 / 130
```

## Server verification

Report the commands exercised and actual HTTP/result behavior.

## Logging verification

Report:

- log path;
- debug activation;
- redaction;
- rotation;
- JSON-mode separation.

## Documentation

Confirm which documentation files were updated.

---

# 16. Definition of Done

**Do not stop after making the code compile.**

Stage E is considered complete only when the repository demonstrates all of the following:

```text
CLI input
   ↓
correct validation
   ↓
correct exit contract
   ↓
correct engine terminal state
   ↓
correct typed event stream
   ↓
correct human/JSON representation
   ↓
correct local debug logging
```

and:

```text
HTTP command
   ↓
authenticated request
   ↓
schema validation
   ↓
real engine command
   ↓
real state transition
   ↓
real event/result
```

with:

```text
failure
   ↓
structured error
   ├── human CLI formatter
   ├── JSON/NDJSON formatter
   ├── HTTP formatter
   └── redacted debug logger
```

There must be **no fake acknowledgements, no silent failures, no swallowed terminal states, no malformed JSON output, no incorrect exit codes, and no secret leakage**.

---

# 17. Final Instruction

**Implement the entire Stage E now.**

Treat the existing codebase as partially implemented production code that must be completed, not as a greenfield project.

Inspect first. Reuse existing architecture. Preserve completed Stage A–D behavior. Implement all missing and partial Stage E behavior fully. Add the necessary tests and simulations. Run the tests and real CLI/server simulations. Fix every failure you uncover. Then update the project documentation and root context/changelog to reflect the **actual verified Stage E completion**.

Do not declare Stage E complete until the verification gate above is satisfied.
