# Stage D — Rules & Product Interaction — Complete Implementation Prompt

## Role

You are the implementation engineer responsible for completing **Stage D: Rules & Product Interaction** of the FlappyCode Phase 1 codebase.

The implementation plan for this stage has been approved.

Your job is **not** to create a greenfield implementation and not merely to create missing files.

Your job is to:

1. inspect the entire existing repository and documentation;
2. identify what is already implemented, partially implemented, stubbed, dead, incorrectly wired, or only covered by isolated tests;
3. completely implement every Stage D requirement;
4. finish all partial implementations;
5. repair broken integration paths;
6. integrate the features into the real CLI/TUI/engine/tool execution paths;
7. preserve all Stage A/B/C safety and reliability invariants;
8. run unit, integration, regression, and end-to-end simulations;
9. update the project documentation only after verification;
10. provide an honest engineering completion report.

The success criterion is:

> **Stage D must work as a coherent, real product capability — not merely have the required files, classes, flags, screens, or tests present.**

---

# 1. Authoritative Context

Before changing any code, read and understand:

## Repository documentation

Read **all relevant files under `docs/`**, including at minimum:

- `docs/SRS.md`
- `docs/PRD.md`
- `docs/SystemArchitecture.md`
- `docs/CLIDesign.md`
- `docs/TaskBreakdown.md`
- `docs/PHASE1_GAPS.md`
- `docs/PHASE1_IMPLEMENTATION_AUDIT.md`
- `docs/progress_tracker.md`
- every other documentation file under `docs/` that defines behavior, architecture, UX, safety, configuration, CLI, tools, or release requirements.

Also read the root-level:

- `Context.md`
- `Changelog.md`
- `RULES.md`

Do not assume the documentation status is accurate without inspecting the actual implementation.

## Existing Stage C context

Stage D must operate on the completed Stage C architecture.

Verify that the implementation you find actually exposes and uses the Stage C runtime paths needed by Stage D, including as applicable:

- engine event bus;
- real router/fallback infrastructure;
- Planner / FlappyAuto;
- specialist agents;
- PlanGate / PlanToken;
- PermissionEngine;
- FsJail;
- ShellTool;
- GitTool;
- DiffEngine / DiffReview;
- UndoEngine;
- session persistence;
- ContextManager;
- TUI event-driven screens;
- CLI command routing;
- SQLite repositories.

If a Stage D feature depends on an earlier capability that is still partial, repair only the dependency necessary to make Stage D function correctly and document the dependency.

Do not silently expand scope into unrelated Stage E/F/G capabilities.

---

# 2. Stage D Objective

Stage D is **Rules & Product Interaction**.

The documented Stage D work includes:

- GAP-018 — Full RULES bundling & conflict detection
- GAP-048 — Clarifying-question interaction
- GAP-032 — Provider diagnostics / `providers test` / health state
- GAP-040 — Local provider auto-detection
- GAP-033 — Real config system
- GAP-020 — Git tool integration
- GAP-045 — Persisted undo engine
- GAP-049 — Category-specific rule activation and manual override

The project progress tracker currently records Stage D as partially complete. Verify and close every applicable gap rather than relying on the tracker alone.

---

# 3. Non-Negotiable Implementation Rules

## 3.1 Do not fake completeness

Do not:

- create a class just to satisfy an import;
- parse a CLI option without using it;
- create a TUI screen disconnected from the actual event/request lifecycle;
- create a repository that no runtime code calls;
- hard-code health state;
- hard-code successful provider tests;
- hard-code approval;
- fabricate audit information;
- make `config` commands write files while the engine ignores those files;
- create a Git tool without wiring agents and permission handling to it;
- implement undo persistence without actually restoring from persisted state;
- mark documentation complete before runtime verification.

## 3.2 Preserve safety

Do not weaken:

- PlanGate;
- PlanToken scope;
- PermissionEngine;
- FsJail;
- SecretGuard;
- PaidGrant / paid-model protections;
- Diff approval;
- Undo safety;
- protected Git branch behavior;
- audit provenance;
- session authorization semantics.

A feature is not complete if it works by bypassing a safety layer.

## 3.3 Reuse existing abstractions

Prefer existing:

- repositories;
- protocol schemas;
- event types;
- CLI command patterns;
- TUI components;
- configuration schemas;
- connector abstractions;
- permission abstractions;
- tool interfaces;
- provider registry;
- storage layer;
- Stage C orchestration infrastructure.

Do not introduce parallel systems when an existing abstraction already represents the same responsibility.

## 3.4 Real execution path requirement

Every Stage D feature must be exercised through the actual runtime path.

A unit test of a helper function is not sufficient when the feature is required to work through:

```text
CLI/TUI
   ↓
Engine
   ↓
Orchestration / Tool / Provider / Rules subsystem
   ↓
Persistence / Events
   ↓
User-visible result
```

---

# 4. GAP-018 — Full RULES Bundling & Conflict Detection

## Requirement

The universal `RULES.md` must:

- ship with the FlappyCode package;
- load at session start;
- be extendable by project-level rules;
- support nested directory rules;
- respect nested rule precedence within scope;
- detect unresolved conflicts;
- make the effective rules available to every relevant agent;
- avoid silently dropping most of the rules because of arbitrary character truncation.

The current implementation is documented as partial because package bundling, nested rules, and conflict detection are incomplete.

## Implement

### 4.1 Bundled universal rules

Bundle the universal `rules/RULES.md` into the distributable CLI package.

Requirements:

- package installation must contain the rules asset;
- runtime must resolve the installed asset correctly;
- source-tree development mode must also work;
- project-level `RULES.md` must extend/override the universal rules according to documented precedence;
- missing project rules must not remove the universal rules.

Verify the actual contents of the built package.

### 4.2 Rules hierarchy

Implement effective rules resolution with clear precedence.

At minimum support:

```text
Bundled Universal Rules
        ↓
User/project-level rules
        ↓
Nested directory rules
        ↓
Scope-specific overrides
```

The exact precedence must follow the project documentation.

When an agent works on files under a nested directory, the effective rules must reflect the rules applicable to that path.

### 4.3 Nested rules

Support nested rule files according to the documented naming/location convention.

Example:

```text
project/
  RULES.md
  src/
    RULES.md
    feature/
      RULES.md
```

An agent operating on:

```text
src/feature/example.ts
```

must receive the effective rule set for that scope.

Do not apply nested rules globally when they are path-scoped.

### 4.4 Conflict detection

Implement real conflict detection.

Conflicts must be represented structurally, not merely as strings.

At minimum identify:

- contradictory explicit requirements;
- mutually exclusive settings;
- inherited rule versus child override conflicts that cannot be deterministically resolved;
- incompatible safety requirements.

Do not flag ordinary intentional child overrides as conflicts when the documented precedence resolves them.

Emit the appropriate event/log/state for an unresolved conflict.

A run requiring resolution must pause for the user where required by the project's StopConditions/rules semantics.

### 4.5 Rule injection into agents

Every agent that requires rules must receive the effective rules.

Do not silently do:

```text
rules.slice(0, 500)
rules.slice(0, 1200)
```

unless the documented context-management architecture explicitly handles the full rule set through chunking/summarization/pointers.

Use a correct strategy such as:

- full injection where context permits;
- structured chunking;
- summarized rules plus preserved critical constraints;
- deterministic scoped rule references.

The result must preserve the semantics of the universal rules.

### 4.6 Planner rules

Planner prompts must receive enough rule information to produce plans consistent with the rules.

Do not give Planner a tiny arbitrary prefix while withholding important safety or orchestration rules.

### Tests

Test at minimum:

- packaged CLI contains universal rules;
- project with no local `RULES.md` still receives universal rules;
- project `RULES.md` extends universal rules;
- nested `RULES.md` affects only its scope;
- nested precedence works;
- harmless overrides are not falsely reported as conflicts;
- real conflicts are detected;
- unresolved conflicts produce the required user-facing state;
- every relevant agent receives effective rules;
- planner receives effective rules;
- packaged and source-tree execution both resolve rules correctly.

---

# 5. GAP-048 — Clarifying Questions

## Requirement

Agents must be able to ask the user when a request is ambiguous.

This is a first-class product interaction.

The current implementation has event schema/design references but no complete emitter, tool, UI, or answer path.

## Implement

### 5.1 Ask tool

Create/register a real agent-facing `ask_question` tool.

The tool must support:

- question text;
- requesting agent;
- optional structured choices;
- optional free-text response;
- cancellation;
- correlation/run/node identifiers.

Only agents permitted by their tool configuration may use it.

### 5.2 Protocol

Implement the complete lifecycle:

```text
agent invokes ask_question
        ↓
question.asked
        ↓
run pauses
        ↓
TUI renders question
        ↓
user answers
        ↓
question answered event / command
        ↓
engine resolves pending request
        ↓
agent continues with answer
```

The protocol must contain enough information to correlate the response with the exact pending request.

### 5.3 TUI

Implement or complete:

```text
QuestionPromptScreen
```

It must display:

- requesting agent;
- question;
- numbered choices when provided;
- free-text input where allowed;
- current selection;
- confirmation;
- cancellation.

Ensure responsive rendering across documented terminal widths.

### 5.4 Headless behavior

Do not hang indefinitely waiting for a question in non-interactive mode.

Use the project's documented behavior.

Possible outcomes must be explicit and machine-readable.

### 5.5 Server/command handling

Do not fake success for an `answerQuestion` command.

Wire the actual pending-question state and answer routing.

### Tests

Test:

- agent can invoke `ask_question`;
- unauthorized agent cannot;
- `question.asked` is emitted;
- run pauses correctly;
- TUI renders;
- user answer reaches agent;
- multiple choice works;
- text answer works;
- cancellation works;
- session remains consistent;
- headless mode has deterministic behavior;
- no stale question can answer a different run.

---

# 6. GAP-032 — Provider Diagnostics and Health

## Requirement

Implement:

```text
flappycode providers test
```

and provider health tracking.

The documented health information includes:

- reachability/status;
- last latency;
- rolling error rate;
- last successful check.

`doctor` must report provider reachability instead of only provider count.

## Implement

### 6.1 `providers test`

Support:

```text
flappycode providers test
```

with useful output for each provider.

At minimum expose:

- provider name;
- enabled/disabled state;
- reachability;
- latency;
- failure reason where applicable;
- authentication problems;
- rate limiting;
- endpoint/network failures.

Where useful, support filtering a specific provider.

### 6.2 Health state

Persist provider health state in the registry/storage layer.

Avoid storing only transient output.

Track enough data to support:

- last check;
- last success;
- latency;
- rolling error rate;
- current availability/health status.

Use timestamps consistently.

### 6.3 Registry integration

Provider health must feed the real availability/routing logic where required.

A provider that is known unavailable must not be treated as healthy merely because a stale model list exists.

Do not make a temporary health failure permanently disable a provider unless the documentation defines that state.

### 6.4 `doctor`

Extend `flappycode doctor` with:

- provider reachability;
- failed provider reasons;
- configuration validity;
- database integrity checks where documented;
- useful remediation hints.

Do not make `doctor` simply print "OK" without actually checking.

### 6.5 Authentication dependency

Provider testing must use the real provider connector authentication/health path.

If the existing add flow prevents meaningful diagnostics because credential validation is incomplete, repair the minimal required dependency rather than bypassing it.

Specific errors should distinguish at least:

- invalid credentials;
- endpoint unreachable;
- network error;
- rate limited;
- server error;
- disabled provider.

### Tests

Use mock providers to test:

- healthy provider;
- slow provider;
- unreachable provider;
- 401/403;
- 429;
- 5xx;
- malformed response.

Verify:

- `providers test` reports each result;
- health data is persisted;
- subsequent `doctor` reflects health;
- rolling error metrics update;
- failing providers affect availability where intended;
- recovery restores healthy state.

---

# 7. GAP-040 — Local Provider Auto-Detection

## Requirement

Local providers must be detected on their default/local endpoints where supported.

The documented targets include:

- Ollama;
- LM Studio;
- llama.cpp.

## Implement

### 7.1 Detection service

Create a deterministic local-provider discovery mechanism.

Probe only appropriate local endpoints.

Use:

- timeout;
- cancellation;
- safe request handling;
- no secrets in logs.

### 7.2 First-run / onboarding

Integrate actual detection into the onboarding path.

Do not display static fake detection text.

Show detected providers only when the corresponding probe succeeds.

### 7.3 One-click connect

Where the existing UX permits it, allow selecting a detected provider and creating its configuration without forcing the user to re-enter discoverable endpoint information.

### 7.4 No false positives

Detection must distinguish:

- endpoint exists;
- endpoint responds but is not the expected provider;
- endpoint exists but model discovery fails;
- provider is healthy but has no models.

### Tests

Use local mock HTTP servers.

Test:

- Ollama detected;
- LM Studio detected;
- llama.cpp detected;
- none detected;
- endpoint times out;
- wrong endpoint;
- detection cancellation;
- onboarding reflects real state;
- detected provider can be added and discovered.

---

# 8. GAP-033 — Real Config System

## Requirement

Implement the documented configuration system:

```text
flappycode config get
flappycode config set
flappycode config edit
flappycode config path
```

Configuration file:

```text
~/.config/flappycode/config.json
```

with project-level override.

Required precedence:

```text
CLI arguments
    >
Project configuration
    >
User configuration
    >
Defaults
```

Use the existing `FlappyConfig` schema and documented fields.

Support:

- providers;
- model policy;
- agents;
- permissions;
- sandbox;
- revalidation settings;
- other documented configuration fields;
- `env:NAME` secret/environment references.

## Implement

### 8.1 Config loader

Create a real configuration loader.

Responsibilities:

- locate user config;
- locate project config;
- parse JSON;
- validate using the canonical schema;
- apply defaults;
- merge project/user configuration according to documented semantics;
- resolve environment references where appropriate;
- report precise validation errors.

### 8.2 No partial invalid config

Invalid configuration must not silently produce a partially valid runtime state.

Use clear errors and safe fallback behavior as defined by the documentation.

### 8.3 CLI

Implement:

```text
flappycode config get
flappycode config get <key>
flappycode config set <key> <value>
flappycode config edit
flappycode config path
```

Use the project's established CLI conventions.

Do not launch the normal TUI for an unknown/unimplemented config command.

### 8.4 Project configuration

Support the documented project override mechanism.

Ensure the active project configuration is actually used by:

- Engine;
- Router;
- permissions;
- agents;
- sandbox;
- providers;
- orchestration.

### 8.5 `auto:*` model identifiers

The documented config schema contains reserved identifiers such as:

```text
flappyauto
auto:free-fast
auto:best-fit-free
```

Ensure the real router interprets these consistently.

They must not be treated as arbitrary literal provider model IDs.

### 8.6 Secret handling

Configuration must support secret/environment references without:

- printing secrets;
- placing them into prompts;
- writing them to logs;
- exposing them in `config get` output.

Mask sensitive values.

### Tests

Test:

- default config;
- user config;
- project config;
- CLI override;
- precedence;
- invalid schema;
- environment reference;
- missing environment variable;
- `config get`;
- `config set`;
- `config edit`;
- `config path`;
- runtime behavior actually changes from config;
- secrets remain protected;
- `auto:*` model policies affect real routing.

---

# 9. GAP-020 — Git Tool Integration

## Requirement

Git capabilities include:

- status;
- diff;
- branch creation;
- commit with generated message;
- PR-description draft;
- push;
- protected-branch protections.

Push and force operations must require explicit confirmation.

Protected branches must never be silently pushed.

## Implement

### 9.1 Agent tool registration

Expose the Git capability through the actual agent tool system where permitted.

Do not require agents to bypass the Git abstraction with raw shell commands.

Respect:

- allowed tools;
- PermissionEngine;
- PlanGate;
- secret protection;
- project root rules.

### 9.2 Status

Return structured:

- branch;
- staged/unstaged state;
- changed files;
- ahead/behind information where supported.

### 9.3 Diff

Expose structured Git diff information for agents and review screens.

### 9.4 Branch creation

Implement safe branch creation.

Validate branch names and prevent command-injection/path-like abuse.

### 9.5 Commit

Commit flow must:

- generate a meaningful message when generation is enabled;
- allow user review/confirmation according to documented UX;
- run secret scanning before commit;
- never fabricate approval;
- record actual approval provenance.

### 9.6 Push

Push must:

- require explicit confirmation;
- distinguish ordinary push from force push;
- permanently block unsafe force patterns according to project rules;
- check protected branches;
- use PermissionEngine;
- never rely on `isUserApproved: true` hard-coded in runtime code.

### 9.7 Protected branches

Support documented protected branch behavior.

At minimum verify:

- `main`;
- `master`;

and the configurable/project-defined protected list if the project schema provides one.

### 9.8 PR description

Implement PR-description drafting from:

- branch;
- diff;
- commits;
- task context;
- tests.

Drafting must be non-destructive.

Do not create/publish a PR unless that capability is explicitly part of the existing Stage D scope.

### Tests

Use isolated temporary Git repositories.

Test:

- status;
- diff;
- branch;
- commit;
- generated commit message;
- secret-blocked commit;
- push requiring confirmation;
- force-push rejection;
- protected branch rejection;
- ordinary branch push approval;
- PR draft generation;
- agent permission restrictions.

---

# 10. GAP-045 — Persisted Undo Engine

## Requirement

Undo must survive process restart.

The documented requirement is:

- atomic edit batches;
- one-key undo;
- restore prior state;
- Git checkpoint where available;
- shadow snapshot where Git is unavailable;
- hunk-level selection in diff review where supported.

The current UndoEngine is process-local.

## Implement

### 10.1 Persistence

Persist undo metadata and required snapshot information in the existing storage system or the documented `.flappycode/undo/` mechanism.

Do not store only references to ephemeral in-memory objects.

Persist enough information to restore safely.

### 10.2 Atomic change batches

An approved change set must be treated as an atomic undo unit.

A multi-file batch must be reversible as a coherent unit.

### 10.3 Restart recovery

Required sequence:

```text
make change
→ apply
→ restart FlappyCode
→ /undo
→ original state restored
```

### 10.4 Git integration

Where the repository is under Git:

- use documented Git checkpoint/patch/stash behavior;
- do not destroy unrelated user changes;
- do not silently reset the entire working tree.

Where Git is unavailable:

- use safe shadow snapshots.

### 10.5 Hunk-level review

Complete the existing DiffReview screen so hunk-level actions work where specified.

Support documented controls such as:

```text
y = apply hunk
n = skip hunk
```

Ensure skipped hunks remain unapplied and approved hunks are correctly tracked for undo.

### 10.6 Crash/cancellation safety

Interrupted operations must not leave the undo database pointing at an invalid or missing snapshot.

Use transactions where necessary.

### Tests

Test:

- single-file change;
- multi-file atomic batch;
- restart then undo;
- Git repository;
- non-Git repository;
- partial/hunk apply;
- rejected hunk;
- interrupted apply;
- cancellation;
- corrupted/missing snapshot handling;
- undo history isolation between sessions/runs.

---

# 11. GAP-049 — Category-Specific Rule Activation

This requirement is documented as P1, but it is part of the project's Rules & Product Interaction work and should be completed unless the project owner explicitly scopes it out.

## Requirement

Support category-specific rule activation for:

- frontend;
- backend;
- mobile;
- CLI;
- library;
- infra;
- data/ML;
- monorepo;
- docs;
- marketing/SEO.

Detection must have substantive effect, and manual override must be supported.

## Implement

### Detection

Improve repository detection beyond the current limited three-category implementation.

Use deterministic evidence such as:

- package dependencies;
- directory layout;
- manifest files;
- configuration files;
- language/tool markers.

Do not rely on a single weak signal when multiple signals exist.

### Rule files

Create/organize category rules according to the documented rule structure.

Do not create rules that contradict universal safety rules.

### Activation

Detected categories must actually alter the effective rule set.

A prompt header saying:

```text
Category: backend
```

without loading backend-specific rules is not sufficient.

### Manual override

Support explicit override through configuration and/or documented CLI/TUI mechanism.

Manual override must supersede detection according to documented precedence.

### Tests

Test:

- CLI repository;
- frontend repository;
- backend repository;
- monorepo;
- mixed-category repository;
- manual override;
- conflicting detection signals;
- category rule inclusion in agent prompts;
- category rule isolation by project.

---

# 12. Cross-Cutting Safety and Integrity

Stage D must preserve the safety properties established earlier.

## 12.1 Approval provenance

Never write:

```ts
approved_by_user: true
```

unless actual user approval happened.

Approval state must be derived from the real interaction path.

## 12.2 Permission enforcement

Never allow a model to forge approval through tool arguments.

Approval must originate outside untrusted model output.

## 12.3 Secret protection

Provider diagnostics, config, Git, rules, logs, undo, and TUI must not leak:

- API keys;
- access tokens;
- credential values;
- secret environment variables.

## 12.4 Project jail

Config and Git operations must respect the project root where the architecture requires project-scoped behavior.

## 12.5 Event integrity

Events must represent actual transitions.

Do not emit success events before the corresponding operation really occurred.

---

# 13. Real Execution Integration Matrix

Verify the following runtime paths end-to-end.

| Capability | Required real path |
|---|---|
| Rules | packaged rules → loader → effective rules → PromptComposer → agent |
| Nested rules | file path → scoped rules → agent prompt |
| Rule conflicts | loader → conflict detection → event/UI → approval/block |
| Clarifying question | agent tool → event → TUI → answer → agent |
| Provider test | CLI → engine → connector healthCheck → registry → persisted state |
| Provider detection | onboarding → local probe → provider add → discovery |
| Config | CLI/file → config loader → engine/router/tools |
| Git | agent/CLI → GitTool → PermissionEngine → Git operation |
| Undo | approved diff → apply → persistent snapshot → restart → undo |
| Category rules | repository detection → category rules → effective prompt |
| Safety | every mutating feature → existing Plan/Permission/Secret/FS gates |

No Stage D item is considered complete until the corresponding runtime path is verified.

---

# 14. CLI Requirements

Ensure the CLI has deterministic behavior for:

```text
flappycode providers test
flappycode config get
flappycode config get <key>
flappycode config set <key> <value>
flappycode config edit
flappycode config path
```

Also ensure unknown commands do not silently launch the normal TUI with success.

Use documented exit codes and error formatting.

Do not change unrelated Stage E behavior unless Stage D requires it.

---

# 15. TUI Requirements

Complete and wire:

- provider diagnostic output;
- clarifying-question interaction;
- Git confirmation flows where UI is required;
- diff hunk selection;
- undo interactions;
- rule conflict indication;
- configuration interaction where documented.

All screens must be event/request driven.

Do not build static mock screens.

Verify at documented widths, including at least:

```text
60
80
120
```

and test narrower layouts where the existing design requires them.

---

# 16. Storage Requirements

Inspect the existing SQLite schema before creating new tables.

Prefer migrations over ad-hoc files.

Persist only the data needed for:

- provider health;
- config where the architecture specifies persistence;
- undo;
- question/session correlation if needed by existing session architecture;
- audit/provenance where required.

All migrations must be:

- versioned;
- tested on fresh databases;
- tested on existing databases.

Do not break existing databases.

---

# 17. Protocol Requirements

Add/update protocol schemas where needed for:

- question requests;
- question answers;
- rule conflict events;
- provider health state;
- provider test results;
- Git confirmation requests;
- undo state;
- configuration errors.

Every new event/command must have:

- schema validation;
- correlation IDs where appropriate;
- deterministic semantics;
- runtime producer/consumer wiring.

No protocol type may be dead code.

---

# 18. Testing Strategy

Create or update tests by responsibility.

Suggested structure:

```text
tests/unit/
  rules-loader.test.ts
  rules-conflict.test.ts
  question-tool.test.ts
  provider-health.test.ts
  provider-detection.test.ts
  config-loader.test.ts
  config-cli.test.ts
  git-tool.test.ts
  undo-persistence.test.ts
  category-rules.test.ts

tests/tui/
  question-prompt.test.ts
  diff-hunk-review.test.ts
  provider-diagnostics.test.ts
  rule-conflict.test.ts

tests/integration/
  stage-d-rules.test.ts
  stage-d-provider-interaction.test.ts
  stage-d-config.test.ts
  stage-d-git-undo.test.ts
  stage-d-product-interaction.test.ts
```

Names may be adapted to the repository's existing organization.

Do not create redundant test frameworks.

---

# 19. Required Stage D Integration Simulations

Implement deterministic mock-based end-to-end simulations.

## Simulation A — Universal Rules in Packaged Install

1. Build/package CLI.
2. Create temporary project with no local `RULES.md`.
3. Start run.
4. Verify universal rules are loaded from package.
5. Verify relevant agents receive them.

## Simulation B — Nested Rules + Conflict

1. Create project root rules.
2. Create nested rules.
3. Run a task against a nested file.
4. Verify nested rule precedence.
5. Introduce an unresolved conflict.
6. Verify conflict is surfaced and execution pauses/blocks as documented.

## Simulation C — Clarifying Question

1. Submit intentionally ambiguous task.
2. Agent invokes `ask_question`.
3. `question.asked` emitted.
4. TUI renders.
5. User answers.
6. Agent continues.
7. Task completes.

## Simulation D — Provider Diagnostics

1. Register healthy mock provider.
2. Register failing provider.
3. Run:
   `flappycode providers test`
4. Verify health/latency/failure reason.
5. Run:
   `flappycode doctor`
6. Verify provider reachability is reflected.

## Simulation E — Provider Auto-Detection

1. Start mock Ollama endpoint.
2. Start or simulate LM Studio endpoint.
3. Start or simulate llama.cpp endpoint.
4. Run detection.
5. Verify only reachable supported endpoints are shown.
6. Select provider.
7. Verify provider configuration and model discovery.

## Simulation F — Config Precedence

Create:

```text
default config
user config
project config
CLI override
```

Verify:

```text
CLI > project > user > defaults
```

Then verify the resulting configuration actually changes runtime behavior.

## Simulation G — Git Safety

1. Create temporary Git repository.
2. Make changes.
3. Use GitTool for status/diff/branch/commit.
4. Attempt ordinary push.
5. Verify explicit confirmation.
6. Attempt force push.
7. Verify block/required confirmation according to policy.
8. Attempt protected branch push.
9. Verify protected branch handling.
10. Generate PR description draft.

## Simulation H — Persistent Undo

1. Make approved change.
2. Apply.
3. Close/restart engine.
4. Invoke undo.
5. Verify original content restored exactly.

Repeat:

- Git repository;
- non-Git repository;
- multi-file batch;
- hunk selection.

## Simulation I — Category Rule Activation

1. Create repositories representing multiple categories.
2. Run category detection.
3. Verify category rule files are loaded.
4. Verify actual prompt behavior changes.
5. Apply manual override.
6. Verify override wins according to documented precedence.

## Simulation J — Full Product Flow

Run a representative task that requires:

```text
config
→ provider selection/diagnostic
→ rules resolution
→ agent execution
→ clarification
→ Git operation
→ diff approval
→ change application
→ persisted undo
```

Verify every component participates through its actual runtime path.

---

# 20. Regression Testing

Stage D must not regress Stage A/B/C functionality.

At minimum re-run relevant tests for:

- provider connectors;
- registry;
- routing;
- fallback;
- paid gate;
- PlanGate;
- PermissionEngine;
- FsJail;
- SecretGuard;
- Git safety;
- session persistence;
- Stage C orchestration;
- TUI task graph;
- cancellation;
- planner repair;
- single-model mode;
- feedback loop;
- context management.

If an existing test fails after implementation:

1. investigate the regression;
2. determine whether the failure indicates a real incompatibility;
3. fix the implementation;
4. do not weaken or delete a correct regression test merely to make the suite green.

---

# 21. Build and Validation Gates

Before declaring Stage D complete, run:

```bash
pnpm lint
pnpm test
pnpm build
```

Also run the Stage D simulations.

The final validation must include:

- all pre-existing tests;
- all Stage C tests;
- all new Stage D tests;
- integration tests;
- end-to-end simulations;
- package/install verification where rules/config are involved.

Do not report a command as passing unless it was actually executed.

---

# 22. Documentation Completion

Only after implementation and verification are complete, update:

## `docs/progress_tracker.md`

Change Stage D from:

```text
🔴 Partially Done
```

to the project's appropriate completed state.

Update every Stage D GAP accurately.

Do not mark anything complete without runtime evidence.

## `docs/PHASE1_GAPS.md`

For each closed Stage D gap:

- update status;
- preserve historical evidence;
- document final implementation;
- document tests;
- document remaining limitations, if any.

Do not delete historical audit information.

## `docs/PHASE1_IMPLEMENTATION_AUDIT.md`

Update only Stage D-related findings.

Do not rewrite unrelated historical observations.

## `Context.md`

Record:

- Stage D implementation;
- architecture changes;
- relevant config/rules/provider/Git/undo behavior;
- safety-impacting changes;
- test and simulation results.

The document must describe the actual final implementation.

## `Changelog.md`

Append a timestamped Stage D completion/change-set entry containing:

- date/time;
- Stage D work completed;
- GAPs addressed;
- significant architectural changes;
- safety-related changes;
- tests and simulations;
- final validation results.

Do not fabricate test results.

---

# 23. Stage D Definition of Done

Stage D is complete only when all applicable items below are true.

## Rules

- [ ] Universal `RULES.md` ships with the package.
- [ ] Project rules extend the universal rules.
- [ ] Nested rules work by scope.
- [ ] Rule conflicts are actually detected.
- [ ] Conflict state reaches the user/runtime correctly.
- [ ] Full/effective rules reach every required agent.
- [ ] Planner receives the required rules information.
- [ ] Category-specific rule activation works.
- [ ] Category rule manual override works.

## Clarifying questions

- [ ] `ask_question` is a real agent tool.
- [ ] Question events are emitted at runtime.
- [ ] TUI renders questions.
- [ ] Answers return to the correct agent/run.
- [ ] Cancellation is handled correctly.
- [ ] Headless behavior is deterministic.

## Provider diagnostics

- [ ] `flappycode providers test` works.
- [ ] Provider health is persisted.
- [ ] Latency is reported.
- [ ] Rolling error information is maintained where required.
- [ ] Last-success state is maintained.
- [ ] Specific failures are shown.
- [ ] `doctor` includes reachability.
- [ ] Provider testing affects runtime health/availability where documented.

## Provider auto-detection

- [ ] Ollama detection works.
- [ ] LM Studio detection works.
- [ ] llama.cpp detection works.
- [ ] False positives are avoided.
- [ ] Onboarding uses real detection results.
- [ ] Detected providers can be connected/discovered.

## Configuration

- [ ] Config loader exists and is used by runtime.
- [ ] User config works.
- [ ] Project config works.
- [ ] CLI precedence works.
- [ ] Schema validation works.
- [ ] `env:NAME` works.
- [ ] `config get` works.
- [ ] `config set` works.
- [ ] `config edit` works.
- [ ] `config path` works.
- [ ] Sensitive values are protected.
- [ ] `auto:*` policies work through the real router.

## Git

- [ ] GitTool is reachable through the intended agent/tool system.
- [ ] Status works.
- [ ] Diff works.
- [ ] Branch creation works.
- [ ] Commit works.
- [ ] Commit secret scanning works.
- [ ] Push requires explicit confirmation.
- [ ] Force push remains protected.
- [ ] Protected branch rules work.
- [ ] PR description draft works.
- [ ] No fabricated approval metadata exists.

## Undo

- [ ] Undo survives process restart.
- [ ] Undo survives engine restart.
- [ ] Multi-file batches restore atomically.
- [ ] Git checkpoint behavior is correct.
- [ ] Non-Git snapshots work.
- [ ] Hunk-level behavior works where required.
- [ ] Cancel/error paths remain recoverable.

## Quality

- [ ] All Stage D functionality is wired into real execution paths.
- [ ] No Stage D feature is dead code.
- [ ] No feature succeeds only because a unit test mocks away the real failure.
- [ ] Stage A/B/C regressions pass.
- [ ] Stage D unit tests pass.
- [ ] Stage D integration tests pass.
- [ ] Stage D end-to-end simulations pass.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes.
- [ ] `pnpm build` passes.
- [ ] Documentation is updated with real evidence.

---

# 24. Scope Discipline

Do not implement unrelated Stage E/F/G work simply because you discover it.

Examples of features that remain outside this Stage D scope unless a Stage D dependency makes them strictly necessary:

- full server correctness;
- full headless exit-contract work;
- real LSP;
- MCP client;
- Researcher/Browser;
- vision input;
- packaging/release pipeline;
- advanced semantic search;
- unrelated quality-gate work.

When a dependency is strictly necessary:

1. implement the minimum required dependency;
2. add regression tests;
3. document exactly why it was necessary;
4. do not silently expand the scope.

---

# 25. Final Engineering Report

After implementation, provide a concise but complete engineering report.

## Implementation summary

List:

- GAP-018;
- GAP-048;
- GAP-032;
- GAP-040;
- GAP-033;
- GAP-020;
- GAP-045;
- GAP-049.

For each:

- previous state;
- final implementation;
- important files;
- integration path;
- verification.

## Files changed

Group by:

```text
protocol
core
storage
CLI
TUI
tests
rules/assets
documentation
```

## Verification

Report exact results for:

```text
pnpm lint
pnpm test
pnpm build
```

Report every Stage D simulation.

Include the final test count actually observed.

## Stage D status

Explicitly state:

```text
Stage D COMPLETE
```

only when every required item is truly implemented and verified.

If anything remains incomplete:

- do not claim completion;
- identify the exact GAP;
- identify the exact missing behavior;
- identify why it remains;
- identify the failing verification.

---

# Final Instruction

**Implement Stage D completely.**

Treat the repository as a partially completed product.

Do not confuse:

```text
file exists
```

with:

```text
feature works
```

Do not confuse:

```text
unit test passes
```

with:

```text
real execution path works
```

Do not weaken Stage A/B/C safety to make Stage D easier.

Do not fabricate approvals, provider health, user answers, Git operations, undo results, or test results.

Finish every partial Stage D implementation and every missing Stage D capability.

Then run the complete verification suite.

Then update the documentation with evidence from the actual implementation and tests.

The final success criterion is:

> **Stage D behaves as a complete, integrated Rules & Product Interaction layer of FlappyCode, with real runtime behavior, persistent state where required, correct user interaction, preserved safety boundaries, verified CLI/TUI integration, passing regression tests, passing Stage D simulations, and documentation that accurately describes what was actually implemented.**
