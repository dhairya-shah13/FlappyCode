# FlappyCode — Product Requirements Document (PRD)

| | |
|---|---|
| **Document** | PRD |
| **Product** | FlappyCode |
| **Version** | 1.0 (draft for team review) |
| **Date** | 29 September 2026 |
| **Source of truth** | *FlappyCode Product & Technical Specification v0.2* |
| **Related docs** | `SRS.md`, `SystemArchitecture.md`, `CLIDesign.md`, `TaskBreakdown.md` |

---

## 1. Purpose of this document

This PRD defines **what** FlappyCode is, **who** it is for, **why** it exists and **how we will know it succeeded**, across all three build phases. It deliberately does not prescribe implementation (see `SystemArchitecture.md`) or list testable requirements at line level (see `SRS.md`).

## 2. Product summary

FlappyCode is an **agentic coding assistant** that runs in the terminal and sits one layer above LLM providers. A developer connects any number of provider accounts (Ollama Cloud, OpenRouter, Kilocode, Groq, Together AI, Anthropic, OpenAI, Google AI Studio, local Ollama / LM Studio, …). FlappyCode then:

1. **Discovers** every model each provider exposes.
2. **Classifies** each as `free`, `rate-limited-free` or `paid`, and pools all free ones into one catalog.
3. **Orchestrates** a team of specialist agents (planner, file-finder, coder, reviewer, tester, command-executor, codebase-analyst, researcher), each bindable to a different model.
4. **Governs** every agent with one shared ruleset, `RULES.md`.

**One-line pitch:** *Your connected providers. All the free models. One powerful coding agent.*

**Distribution:** an npm package, installed and launched the same way as OpenCode:

```bash
npm install -g flappycode
flappycode
```

## 3. Problem statement

| Today's option | Pain |
|---|---|
| Single-vendor, ad-supported free coding tools | Vendor-curated model list, opaque session limits, prompts used for ads, no control over which provider's free tier is used. |
| Provider-agnostic open tools | Full control, but the user must already pay for or hold access to a capable model. Nothing hunts for or pools free inventory. |

No existing coding agent treats *"aggregate every free model across every provider I connect"* as a first-class feature. That is the gap.

## 4. Vision, goals and non-goals

### 4.1 Vision
The more providers a user connects, the larger their free-model budget becomes — and the agent uses it intelligently, safely and transparently.

### 4.2 Product goals

| # | Goal | Phase |
|---|---|---|
| G1 | Turn any set of connected providers into one pooled, ranked model catalog with free models first. | 1 |
| G2 | Complete real coding tasks end-to-end with a multi-agent graph, with `flappyauto` as the zero-config default. | 1 |
| G3 | Never spend the user's money silently; degrade across free models, then ask. | 1 |
| G4 | Keep every agent safe and predictable via a universal `RULES.md` (plan-before-execute, approvals, docs upkeep). | 1 |
| G5 | Give a signed-in user visibility into their own usage (providers, per-model quota, active hours) without collecting prompts or code. | 2 |
| G6 | Support a university-scale user base reliably. | 2 |
| G7 | Give non-technical users a desktop app with full feature parity, ready for public launch. | 3 |

### 4.3 Non-goals (all phases unless stated)
- Not a model vendor or reseller; FlappyCode has no financial relationship with any single provider.
- No ads, and no paid routing influence.
- No collection of prompts, code, diffs, project paths or API keys — ever.
- No silent paid-model calls — ever.
- No website/account/telemetry in Phase 1.
- Not an IDE replacement. IDE extensions, plugin marketplace, team features and session sharing are **post-Phase 3**.

## 5. Rollout strategy and audiences

| Phase | Audience | Purpose | Target date |
|---|---|---|---|
| **1 — Core engine (CLI)** | The founding team ("dogfooding") | Prove the engine, the pool and `flappyauto` work on our own real projects. | Feature-complete **before 25 Oct 2026** |
| **Test window** | Founding team | Test-only period for Phase 1 — bug bash, no new features. | **25 Oct – 1 Nov 2026** |
| **2 — Accounts & dashboard** | The entire university | Scale, real diversity of providers/machines, usage visibility. | After 1 Nov; dates TBD at Phase 1 retro |
| **3 — Desktop app** | General public | Non-technical users, public launch. | Dates TBD |

**Implications for design (decided now, so later phases don't force rewrites):**
- The engine is a **library with an event stream**; the CLI is only one client of it. The Phase 3 desktop app reuses it unchanged (see `SystemArchitecture.md`).
- Phase 1 stores everything locally in a schema that can later be *reported on* (per-model, per-day counters) without ever storing prompts in the reporting path.
- Phase 1 has **no telemetry code path at all**. Phase 2 adds it as a separate, opt-in, allow-listed module.

## 6. Personas

| Persona | Needs | Primary phase |
|---|---|---|
| **Multi-Account Optimizer** | Uses free tiers on 4–5 platforms; wants one agent that draws on whichever quota is available. | 1 |
| **Cost-Conscious Indie Dev** | Agentic help with no subscription. | 1–3 |
| **Power User / Tinkerer** | Per-agent model binding, custom agents, local + cloud mix, MCP/plugins. | 1 |
| **Privacy-Conscious Team** | Local-first, no prompt collection, trusted providers only. | 1–3 |
| **University Student / Researcher** *(added for Phase 2)* | Several free/student accounts, wants to see how much quota is left, works on mixed hardware (Windows/macOS/Linux, sometimes low-spec). | 2 |
| **Non-Technical Builder** *(added for Phase 3)* | Wants a GUI, not a terminal. | 3 |

## 7. Scope by phase

Priority: **P0** must ship in the phase · **P1** should ship if capacity allows · **P2** may slip to the next phase.

### 7.1 Phase 1 — CLI orchestration engine

| Epic | Capability | Priority |
|---|---|---|
| E1 Providers | Connect unlimited providers (API key/endpoint); OpenAI-compatible, Anthropic, Google, Ollama, LM Studio, llama.cpp connectors. | P0 |
| E1 | Auto-discovery + free/rate-limited-free/paid classification, unified registry, manual overrides, periodic re-validation. | P0 |
| E1 | Provider health/latency status. | P1 |
| E2 Routing | Task-aware best-fit selection, in-use/quota fallback, **pool-exhaustion notice** (recharge or add a free provider; never silent paid). | P0 |
| E3 Orchestration | `flappyauto` default planner; task graph; parallel/sequential executor; per-agent model binding. | P0 |
| E3 | Specialist agents: File-Finder, Coder/Editor, Reviewer, Tester, Command-Executor. | P0 |
| E3 | Codebase-Analyst (semantic search/Q&A). | P1 |
| E3 | Researcher/Browser agent (docs lookup, headless browser). | P2 |
| E4 Coding | Multi-file edit with diff preview; command execution loop; test-fix loop; git-aware ops. | P0 |
| E4 | LSP diagnostics feedback. | P1 |
| E4 | Vision/screenshot input. | P2 |
| E5 Governance | `RULES.md` loaded/enforced for every agent; mandatory Implementation Plan approval; `Context.md` + `Changelog.md` upkeep. | P0 |
| E6 Safety | Tiered permission prompts, allow/deny list, secrets in OS keychain, per-provider data-use labels. | P0 |
| E7 Interface | TUI per `CLIDesign.md`; `flappycode` launches it; npm global install. | P0 |
| E7 | Headless `flappycode run "…"`. | P1 |
| E7 | `flappycode serve` (HTTP/OpenAPI, prerequisite for Phase 3). | P1 |
| E8 Extensibility | MCP client. | P1 |
| E8 | Plugin system, agent-definition files (declarative agents). | P1 (declarative agents P0 internally) |

### 7.2 Phase 2 — Accounts & usage dashboard (university rollout)

| Epic | Capability | Priority |
|---|---|---|
| E9 Website | Public installation guide (signed-out visible). | P0 |
| E10 Identity | Google OAuth sign-in on website; `flappycode login` device-code linking of CLI to account. | P0 |
| E11 Metering | CLI reports active-hours and per-model usage counters only; opt-in; allow-listed payload. | P0 |
| E12 Dashboard | Connected Providers; per-provider model drill-down with used-vs-remaining bars; total CLI hours; daily usage view. | P0 |
| E13 Trust | Published privacy statement + "what we send" viewer in CLI (`flappycode telemetry show`); data deletion. | P0 |
| E14 Scale | Load-tested for the university's user count; support docs; admin-safe operational dashboards (no user content exists to expose). | P1 |

### 7.3 Phase 3 — Desktop app & public launch

| Epic | Capability | Priority |
|---|---|---|
| E15 Shell | Desktop app wrapping the same engine; session management. | P0 |
| E16 UX | GUI for multi-agent workflow, diff review, approvals, model picker, provider setup. | P0 |
| E17 Parity | Everything in Phase 1 + 2 available in the app, including OAuth + dashboard. | P0 |
| E18 Release | Signed installers (Windows/macOS/Linux), auto-update, public website launch. | P0 |

## 8. Key user stories and acceptance criteria

### Phase 1
| ID | Story | Acceptance criteria |
|---|---|---|
| US-01 | As a developer, I install FlappyCode with one npm command and start it with `flappycode`. | `npm i -g flappycode` succeeds on Windows/macOS/Linux with Node ≥ 20; typing `flappycode` shows the home screen within 1.5 s. |
| US-02 | As a user, I add a provider and instantly see its free models. | After entering a key, discovery completes and the status bar count updates; failures show a specific reason. |
| US-03 | As a user, I type a request and `flappyauto` handles the rest. | Plan is shown and needs my approval; agents run; a diff is shown; nothing is written before approval. |
| US-04 | As a user, I want it to keep working when one free model is rate-limited. | Router silently switches to the next best-fit model; the task graph view shows the substitution. |
| US-05 | As a user, I am told when every free model is exhausted, and nothing paid is called. | Notice appears with exactly two actions (add credit / connect another free provider); zero paid requests occur before I act. |
| US-06 | As a power user, I pin a specific model to the Coder agent. | Pinned binding overrides auto selection until removed. |
| US-07 | As a cautious user, I control what agents may do. | Writes need diff approval; shell/git/network need per-command approval unless allow-listed. |
| US-08 | As a team lead, I want agents to follow our rules. | `RULES.md` is loaded every session; `Context.md` and `Changelog.md` are updated after each change set. |
| US-09 | As a user, I can pick one model to do everything, bypassing `flappyauto`. | Model picker lists `flappyauto` first, then pool models; choosing a single model runs a single-agent loop with the same rules. |

### Phase 2
| ID | Story | Acceptance criteria |
|---|---|---|
| US-10 | As a signed-out visitor, I can read the install guide. | Guide reachable without login. |
| US-11 | As a student, I sign in with Google and see my connected providers. | Providers listed from CLI reports only; no keys/endpoints shown. |
| US-12 | I can see per-model used vs remaining quota. | Bar per model; providers with no quota API show "estimated" with a tooltip on method. |
| US-13 | I can see total CLI hours and daily usage. | Values match local session logs within ±2 %. |
| US-14 | I can prove nothing sensitive leaves my machine. | `flappycode telemetry show` prints the exact outbound payloads; schema contains no free-text fields. |
| US-15 | I can leave. | "Delete my data" removes all account data server-side within 24 h. |

### Phase 3
| ID | Story | Acceptance criteria |
|---|---|---|
| US-16 | As a non-technical user, I install a desktop app and complete a coding task without touching a terminal. | Onboarding → connect provider → task → diff approval, all in GUI. |
| US-17 | As an existing CLI user, I see identical behaviour in the app. | Parity checklist (`TaskBreakdown.md`, Phase 3) 100 % green. |

## 9. Success metrics

| Phase | Metric | Target |
|---|---|---|
| 1 | Team members using FlappyCode daily on real work by 1 Nov | ≥ 80 % of team |
| 1 | End-to-end task success on an internal benchmark of ≥ 20 tasks (bug fix, feature, refactor, test-gen) | ≥ 60 % completed without manual fix-up (baseline; raised in Phase 2) |
| 1 | Tasks completed with **zero paid calls** when ≥ 1 free model was available | 100 % |
| 1 | Time from install to first successful task | < 5 min |
| 1 | Crash-free sessions | ≥ 98 % |
| 2 | University activation (signed in **and** ran a task) | ≥ 30 % of invited users in first month |
| 2 | Weekly active users retained after 4 weeks | ≥ 40 % |
| 2 | Privacy incidents (prompt/code found server-side) | **0** |
| 2 | Dashboard data accuracy vs local logs | ±2 % |
| 3 | Desktop task success rate vs CLI | within 5 % |
| 3 | Public-launch install-to-first-task completion | ≥ 70 % |

*(Targets are proposals for the team to confirm.)*

## 10. Assumptions and constraints

- **Timeline:** Phase 1 in ~26 days (29 Sep → 24 Oct), test window 25 Oct → 1 Nov. This is tight for the full spec scope, hence the P0/P1/P2 tiering above — **P0 is the commitment**.
- **Team size** is not stated; estimates in `TaskBreakdown.md` assume 3–4 engineers. Revisit if smaller.
- **Platforms:** Windows, macOS, Linux. The mockup shows PowerShell, so Windows is a first-class target, not an afterthought.
- **Runtime:** Node.js ≥ 20 LTS (see `SystemArchitecture.md` ADR-001).
- **Provider terms:** free tiers are typically for individual use; FlappyCode must respect rate limits and show each provider's terms.
- **Provider APIs change** without notice; connectors must be isolated and re-validated on a schedule.

## 11. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Phase 1 scope is larger than 26 days allows | Miss 25 Oct | Strict P0/P1/P2 tiering; feature freeze 21 Oct; P2 items deferred by default. |
| Free models are weak at tool calling | Poor task success | Capability-aware router; tool-call self-test at discovery; reviewer on a different model; fall back to next model. |
| Free-tier volatility / quotas not exposed by API | Wrong "remaining" numbers | Local usage counters + "estimated" labelling; revalidate every 6 h. |
| Provider ToS violations from automated traffic | Account bans | Honest user-agent, respect rate limits, show ToS, per-provider concurrency caps. |
| Mandatory plan approval feels slow | User friction | Fast, compact plan UI; "approve & don't ask again for this plan" only within the run; see open question OQ-1. |
| Sandbox on Windows is weak | Security gap | Phase 1 uses allow/deny lists + approval gates + project-dir scoping; optional Docker; be honest in docs. |
| Phase 2 accidentally collects sensitive data | Trust loss (university-wide) | Allow-list schema, no free-text fields, server-side schema validation rejects unknown fields, client-side `telemetry show`, open-source client. |
| University-scale load / support | Downtime | Load test; stateless backend; runbook. |

## 12. Open questions (need a founder decision)

| ID | Question | Recommendation |
|---|---|---|
| OQ-1 | `RULES.md` says plan approval has **no exceptions**, but headless/CI mode (`flappycode run`) cannot prompt. | Require an explicit `--approve-plan` flag in headless mode; it is logged in `Changelog.md`. Keeps the rule intact (a human still opted in). |
| OQ-2 | Should Phase 2 sign-in be restricted to the university's Google Workspace domain? | Allow any Google account but display a domain badge; restrict later if needed. Decide before Phase 2 start. |
| OQ-3 | Is usage reporting opt-in or automatic after login? | Opt-in at `flappycode login` with clear consent screen; default ON in the prompt, easily reversible. |
| OQ-4 | Desktop shell: Electron or Tauri? | Electron for time-to-market since the engine is TypeScript (ADR-006). |
| OQ-5 | Open-source licence and repo visibility timing. | Decide before Phase 2 (university users will ask). Apache-2.0 or MIT recommended. |
| OQ-6 | Version number displayed in the TUI. The mockup shows `v0.2` (the *spec* version). | Product uses semver starting `0.1.0`; the mockup's `v0.2` is treated as illustrative. |
| OQ-7 | Which providers are day-one? | Recommended Phase 1 set: OpenRouter, Ollama (local + cloud), LM Studio, Groq, Google AI Studio, Anthropic, OpenAI, Kilocode, Together AI. Verify each provider's discovery endpoint and free-tier terms before build. |

## 13. Release criteria (definition of "done" per phase)

**Phase 1 (gate: 24 Oct, verified 25 Oct–1 Nov):** all P0 items complete; installs cleanly via npm on Windows + macOS + Linux; no known data-loss or security bug; `RULES.md` enforcement tests green; pool-exhaustion never triggers a paid call in tests; docs (README, quickstart) complete.

**Phase 2:** all P0 items; privacy review signed off; load test passed; university support channel and install guide live.

**Phase 3:** parity checklist 100 %; signed installers; auto-update tested; public site + docs live.
