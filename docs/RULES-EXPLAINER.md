# 🛡️ Agent Governance & RULES.md Explainer

FlappyCode's core design philosophy is that **agents must be strictly governed by software gates, not just prompt instructions**. Large Language Models can hallucinate, stray off course, or attempt destructive operations. FlappyCode enforces governance through deterministic TypeScript gates that intercept every tool call and file operation.

---

## 1. What is `RULES.md`?

`RULES.md` is a declarative, human-readable specification at your project root (or loaded from default templates) that establishes:
1. **Behavioral constraints**: What agents are permitted or forbidden to do.
2. **Approval boundaries**: Which actions require human sign-off.
3. **Documentation obligations**: Requirements to update architectural records (`Context.md`) and changelogs (`Changelog.md`).
4. **Architectural style**: Project conventions, naming standards, and coding patterns.

When FlappyCode launches, `RulesLoader` parses `RULES.md` and compiles it into system prompts and code-level validator hooks.

---

## 2. The Plan Gate (`PlanGate` & `PlanToken`)

Under FlappyCode rules:
> **No agent may write files, delete files, or execute shell commands without an approved Implementation Plan.**

### How the Plan Gate Works:
1. When a task begins, the `flappyauto` planner generates a `PlanProposal` detailing:
   - Specific files that will be read or modified.
   - Ordered steps of execution.
   - Verification procedures.
2. The user is prompted in the TUI (or passed `--approve-plan` in headless mode) to review and accept the plan.
3. Upon approval, `PlanGate` issues a cryptographically secure `PlanToken` tied to that run.
4. Any tool call (`fs_write`, `fs_delete`, `execute_command`) must pass through `PlanGate`:
   - If an agent tries to modify a file outside the approved plan scope, `PlanGate` intercepts and blocks the call with `PlanGate Blocked: Path is outside approved plan scope`.
   - Silent scope creep is impossible.

---

## 3. Visual Diff Approval Gate

Even after a plan is approved, **no file changes are written directly to disk**:
1. When an agent calls `write_file`, the content is staged into an isolated memory buffer.
2. A unified diff (`git`-compatible diff) is computed against the working tree.
3. The interactive TUI presents the diff for per-hunk or whole-file review:
   - `a`: Approve all changes.
   - `y`: Approve this specific hunk.
   - `n`: Reject this hunk.
   - `e`: Open in editor.
4. Only approved hunks are committed to disk via `FsJail`.
5. Every approved diff is logged in the `undo` repository for immediate rollback via `/undo`.

---

## 4. Stop Conditions (`StopConditions`)

To prevent runaway costs or corrupted codebases, FlappyCode incorporates automated circuit breakers:
- **Maximum Step Count**: Prevents infinite agent loops.
- **Destructive Command Interception**: Intercepts shell commands matching dangerous patterns (`rm -rf /`, `mkfs`, `dd`, `git reset --hard HEAD~10`, `drop database`).
- **Secret Canary Interception**: Scans outgoing prompts and generated files for credentials (`sk-...`, `ghp_...`, private keys). If detected, `SecretGuard` immediately redacts or halts execution.
- **Reviewer-Coder Feedback Bounding**: The Reviewer/Tester-to-Coder loop is capped at 3 iterations. If a solution is not converging, FlappyCode halts and escalates to the user.

---

## 5. Category Rules & Specialized Profiles

FlappyCode bundles 10 domain-specific rule profiles in `assets/category-rules/`:
- `general`
- `web-frontend`
- `web-backend`
- `mobile-app`
- `cli-tools`
- `systems-lowlevel`
- `machine-learning`
- `data-pipelines`
- `security-critical`
- `devops-infra`

Configured in `flappycode.json`:
```json
{
  "category": "web-frontend"
}
```

---

## 6. Nested Overrides & Conflict Resolution

Projects can customize governance rules hierarchically:
1. **User Global Rules**: `~/.config/flappycode/rules/`
2. **Project Root Rules**: `<projectRoot>/RULES.md` and `.flappycode/rules/`
3. **Subdirectory Rules**: `<projectRoot>/packages/auth/RULES.md`

### Precedence:
Subdirectory rules take precedence for operations inside that subdirectory, provided they do not weaken global security gates. If conflicting rules are detected between parent and child directories, `RulesLoader` flags the conflict and prompts the user for clarification.
