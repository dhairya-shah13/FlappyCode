# Rule File Specification (FORMAT.md)

Rule files govern the behavior, safety, and constraints of FlappyCode agents. They are written in Markdown with optional YAML frontmatter.

---

## Structure

```markdown
---
scope: "packages/api"
overrides:
  - "COMM-001"
---

# Scope Specific Rules

- [COMM-001] In the API package, log structured JSON payloads instead of asking interactive questions.
- [API-001] All public HTTP endpoints must validate request bodies using zod schemas.
```

## Frontmatter Fields
- `scope` *(string, optional)*: Describes the path or area where these rules apply.
- `overrides` *(array of strings, optional)*: Explicit list of rule IDs that this file intentionally replaces from parent or shipped rulesets.

## Rule Item Format
Each rule must be formatted as an unordered list item starting with a bracketed stable ID:
`- [ID-001] Imperative rule statement.`

## Core Protected Rules
Rules prefixed with `SEC-`, `PLAN-`, `NEVER-`, or `STOP-` are **non-overridable**.
Any attempt by a local or nested rule file to override these prefixes will produce a `weakens_core_rule` conflict and be rejected by `RulesLoader`.
