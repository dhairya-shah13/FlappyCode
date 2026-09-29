# FlappyCode — Software Requirements Specification (SRS)

| | |
|---|---|
| **Document** | SRS |
| **Version** | 1.0 (draft for team review) |
| **Date** | 29 September 2026 |
| **Derived from** | `PRD.md`, *FlappyCode Spec v0.2* |
| **Related** | `SystemArchitecture.md`, `CLIDesign.md`, `TaskBreakdown.md` |

Requirement keywords follow RFC 2119: **shall** = mandatory, **should** = recommended, **may** = optional.
Each requirement has an ID, a priority (**P0** must, **P1** should, **P2** may) and a phase (**1**, **2**, **3**).

---

## 1. Introduction

### 1.1 Purpose
Specify the testable functional and non-functional requirements of FlappyCode across three phases: (1) CLI orchestration engine, (2) accounts and usage dashboard, (3) desktop application.

### 1.2 Scope
FlappyCode is an npm-installable command-line application (`npm install -g flappycode`, run with `flappycode`) that connects to multiple LLM providers, pools their free models, and runs a multi-agent coding workflow under a shared ruleset (`RULES.md`). Phase 2 adds a website and backend for Google sign-in and a code-free usage dashboard. Phase 3 adds a desktop GUI with parity.

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Provider | A hosted API or local server serving LLM completions. |
| Model Registry / Pool | Unified table of all models across connected providers. |
| Tier | `free`, `rate-limited-free`, `paid`, or `disabled`. |
| Best-fit selection | Task-aware choice of the most suitable *available* model. |
| `flappyauto` | Default orchestration mode: one pool model plans, specialist agents execute. |
| Task graph | DAG of subtasks with dependencies produced by the planner. |
| `RULES.md` | Universal ruleset every agent obeys. |
| Pool exhaustion | No free / rate-limited-free model is currently usable for a task. |

### 1.4 References
Spec v0.2 (sections cited as "Spec §x.y"), Model Context Protocol, Language Server Protocol, OAuth 2.0 (RFC 6749), Device Authorization Grant (RFC 8628).

## 2. Overall description

### 2.1 Product perspective
Layered system: interfaces → orchestration engine → agents → tools/sandbox → model registry & router → provider connectors → external LLM providers. The engine is a reusable library; CLI, server mode and (later) desktop are clients. See `SystemArchitecture.md`.

### 2.2 Operating environment
| Item | Requirement |
|---|---|
| OS | Windows 10/11, macOS 12+, Linux (glibc, x64 and arm64) |
| Runtime | Node.js ≥ 20 LTS |
| Terminal | ANSI-capable terminals incl. Windows Terminal/PowerShell, iTerm2, GNOME Terminal, over SSH; minimum 60×20 |
| Network | Outbound HTTPS to user-chosen providers; localhost for Ollama/LM Studio/llama.cpp |
| Git | Optional; git features enabled when `git` is on PATH |

### 2.3 Assumptions and dependencies
- Providers expose a model-list endpoint or a static catalog; pricing/free status may need a community override list.
- Not all providers expose remaining quota; the system must handle *unknown*.
- OS keychain access via a native module may be unavailable (headless Linux); an encrypted-file fallback shall exist.

## 3. External interface requirements

### 3.1 User interfaces
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| UI-001 | Running `flappycode` shall launch the interactive TUI defined in `CLIDesign.md`. | P0 | 1 |
| UI-002 | The TUI shall show: banner, taglines, prompt input, status bar (version, providers connected, free models available, state). | P0 | 1 |
| UI-003 | The TUI shall function over SSH and in terminals without true-colour (graceful 256/16-colour and `NO_COLOR` fallbacks). | P0 | 1 |
| UI-004 | The desktop app shall expose every capability of the CLI. | P0 | 3 |

### 3.2 Command-line interface (summary; full detail in `CLIDesign.md`)
| ID | Command | Pri | Ph |
|---|---|---|---|
| CLI-001 | `flappycode` — interactive TUI in current directory. | P0 | 1 |
| CLI-002 | `flappycode providers add|list|remove|test|refresh` | P0 | 1 |
| CLI-003 | `flappycode models [--free] [--json]` | P0 | 1 |
| CLI-004 | `flappycode run "<prompt>" [--model <id>] [--approve-plan] [--json]` | P1 | 1 |
| CLI-005 | `flappycode serve [--port]` | P1 | 1 |
| CLI-006 | `flappycode config`, `flappycode doctor`, `flappycode --version` | P0 | 1 |
| CLI-007 | `flappycode login|logout|whoami|telemetry show|telemetry off|delete-account` | P0 | 2 |

### 3.3 Provider interfaces
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| PI-001 | Connectors shall exist for: OpenAI-compatible APIs (covers OpenRouter, Groq, Together, Fireworks, Kilocode, LM Studio, llama.cpp, Azure OpenAI-style), Anthropic, Google AI Studio, Ollama (local and cloud). | P0 | 1 |
| PI-002 | Each connector shall implement: `authenticate`, `listModels`, `complete` (streaming), `getQuota` (optional), `healthCheck`. | P0 | 1 |
| PI-003 | AWS Bedrock and Azure-native connectors may be added. | P2 | 1 |
| PI-004 | Connectors shall send an honest `User-Agent: flappycode/<version>` and shall not disguise automated traffic. | P0 | 1 |

### 3.4 Software / system interfaces
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| SI-001 | Secrets shall be stored in the OS keychain; fallback is an AES-256-GCM encrypted file with a key held in the keychain or derived from a user passphrase. Plaintext key storage shall not be the default. | P0 | 1 |
| SI-002 | Config may reference env vars using `env:NAME`. | P0 | 1 |
| SI-003 | The system shall integrate with LSP servers (per language) and expose diagnostics to agents. | P1 | 1 |
| SI-004 | The system shall act as an MCP client. | P1 | 1 |
| SI-005 | The system may act as an MCP server. | P2 | 1–3 |
| SI-006 | Phase 2: web backend exposes an HTTPS JSON API (`/v1/...`) consumed by the CLI and website; auth via Google OAuth 2.0 (web) and Device Authorization Grant (CLI). | P0 | 2 |

## 4. Functional requirements

### 4.1 Provider management (FR-PRV)
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| FR-PRV-001 | The user shall be able to add an unlimited number of providers via interactive prompt or config file. | P0 | 1 |
| FR-PRV-002 | On add, the system shall validate credentials with a lightweight call and report a specific error (invalid key, network, endpoint unreachable, rate-limited). | P0 | 1 |
| FR-PRV-003 | On success, the system shall immediately run model discovery (FR-MOD-001). | P0 | 1 |
| FR-PRV-004 | The user shall be able to disable, hide or remove a provider; removing shall delete its stored secret. | P0 | 1 |
| FR-PRV-005 | Local providers (Ollama, LM Studio, llama.cpp) shall be auto-detected on default ports and offered to the user. | P1 | 1 |
| FR-PRV-006 | Each provider shall have a `data_use_policy` label (e.g., "trains on prompts": yes / no / unknown) sourced from a bundled, updatable list and shown in the model picker. | P0 | 1 |
| FR-PRV-007 | The system shall track per-provider health: last latency, rolling error rate, last success. | P1 | 1 |
| FR-PRV-008 | Per-provider concurrency and rate limits shall be configurable, with safe defaults. | P0 | 1 |

### 4.2 Model discovery, classification and registry (FR-MOD)
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| FR-MOD-001 | The system shall fetch each provider's full model list and normalise to the schema in §6.1 (id, context length, modality, tools, vision, pricing, tier). | P0 | 1 |
| FR-MOD-002 | The classifier shall assign a tier using, in precedence order: (1) user override, (2) community override list, (3) provider pricing metadata, (4) provider-specific rules; unknown defaults to `paid`-until-proven (never assume free). | P0 | 1 |
| FR-MOD-003 | The registry shall be deduplicated and queryable by tier, cost, context length, modality, tools, vision, latency. | P0 | 1 |
| FR-MOD-004 | Free and rate-limited-free models shall rank ahead of paid models by default. | P0 | 1 |
| FR-MOD-005 | The user shall be able to force-tag a model `free`, `paid` or `disabled`. Overrides persist across refreshes. | P0 | 1 |
| FR-MOD-006 | The system shall re-validate registry entries every `revalidateEveryHours` (default 6) and on demand (`providers refresh`). Disappeared models shall be marked `unavailable`, not silently deleted. | P0 | 1 |
| FR-MOD-007 | The system shall run a short **capability probe** (tool-call round trip) on models before first use by a tool-using agent and cache the result; models failing the probe shall be excluded from tool-using roles. | P1 | 1 |
| FR-MOD-008 | The status bar "free models available" count shall equal the number of enabled, healthy free/rate-limited-free models in the registry. | P0 | 1 |

### 4.3 Routing, fallback and pool exhaustion (FR-RTE)
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| FR-RTE-001 | For every subtask the router shall build a requirement profile (min context, tool use, vision, task type) and select the single best-fit available model. | P0 | 1 |
| FR-RTE-002 | The router shall not compute or persist an opaque quality grade; selection uses only declared capabilities, live availability, latency and the user's bindings. | P0 | 1 |
| FR-RTE-003 | If the chosen model is busy (concurrency cap), rate-limited, errors, or its free quota is exhausted, the router shall transparently pick the next best-fit model and continue. | P0 | 1 |
| FR-RTE-004 | A per-agent model binding shall override automatic selection. If the pinned model is unavailable, the system shall follow the agent's `fallbackPolicy` (default: ask the user). | P0 | 1 |
| FR-RTE-005 | The system shall **never** issue a request to a `paid` model unless the user has explicitly chosen that model, or has acted on a pool-exhaustion notice (FR-RTE-006). | P0 | 1 |
| FR-RTE-006 | When no free/rate-limited-free model can satisfy a task, the system shall pause the task, show a notice stating the free pool is exhausted, and offer exactly two actions: (a) recharge/add credit on a paid-capable provider, (b) connect an additional free-tier provider. Task resumes only after the user acts. | P0 | 1 |
| FR-RTE-007 | Model substitutions shall be visible in the task graph view and recorded in the task-node log. | P0 | 1 |
| FR-RTE-008 | Retries shall use exponential backoff with jitter and honour `Retry-After` headers. | P0 | 1 |
| FR-RTE-009 | No benchmark, quality or usage data shall be transmitted off the machine in Phase 1. | P0 | 1 |

### 4.4 Orchestration — `flappyauto` and agents (FR-ORC)
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| FR-ORC-001 | `flappyauto` shall be the first entry in every model picker and the default for the Planner. | P0 | 1 |
| FR-ORC-002 | `flappyauto` shall select one pool model (best-fit) to decompose the prompt into a task graph, assign each node to a specialist agent, and let the router choose each agent's model. | P0 | 1 |
| FR-ORC-003 | Task graph nodes shall carry: id, agent, description, depends_on[], status, model_used, tool_calls[]. Independent nodes shall run in parallel (bounded by provider concurrency), dependent nodes sequentially. | P0 | 1 |
| FR-ORC-004 | The user shall be able to select a single model to perform all work, bypassing `flappyauto`; the same `RULES.md`, permissions and approvals shall apply. | P0 | 1 |
| FR-ORC-005 | Specialist agents shall exist: File-Finder, Coder/Editor, Reviewer, Tester, Command-Executor (P0); Codebase-Analyst (P1); Researcher/Browser (P2). | P0/P1/P2 | 1 |
| FR-ORC-006 | Agents shall be defined declaratively (name, system prompt, allowed tools, preferred model ref, fallback policy) and loadable from files. | P0 | 1 |
| FR-ORC-007 | The Reviewer shall, when possible, use a different model than the Coder. | P1 | 1 |
| FR-ORC-008 | On Reviewer/Tester failure, feedback shall loop to the Coder up to a configurable maximum (default 3) before escalating to the user. | P0 | 1 |
| FR-ORC-009 | The task graph shall be visible live in the TUI (agent, status, model). | P0 | 1 |
| FR-ORC-010 | A run shall be cancellable at any time (Esc/Ctrl-C) without corrupting files; partial edits shall be revertible. | P0 | 1 |
| FR-ORC-011 | Planner output shall be validated against a JSON schema; invalid plans trigger one automatic repair attempt, then model fallback. | P0 | 1 |

### 4.5 Ruleset enforcement — `RULES.md` (FR-RUL)
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| FR-RUL-001 | `RULES.md` shall ship with the package and be loaded at session start; a project-root `RULES.md` may extend it, nested directory rules files shall take precedence in their scope; unresolvable conflicts shall be flagged to the user, never silently chosen. | P0 | 1 |
| FR-RUL-002 | The rules shall be injected into the system prompt of **every** agent regardless of model. | P0 | 1 |
| FR-RUL-003 | **Plan-before-execution:** before any code is written, edited or deleted, the system shall present an Implementation Plan and require explicit user approval — for every run, including small changes. This shall be enforced by the tool layer (write/delete tools are locked until a plan approval token exists for the run), not by prompt alone. | P0 | 1 |
| FR-RUL-004 | **Documentation upkeep:** after each approved change set the system shall update `Context.md` (current project state) and append a timestamped entry to `Changelog.md`; missing files shall be created. | P0 | 1 |
| FR-RUL-005 | **Stop conditions:** destructive operations, breaking API changes, irreversible migrations and rule conflicts shall always pause for approval. | P0 | 1 |
| FR-RUL-006 | **Never-do list** shall be enforced by tool-layer guards where mechanically possible: no committing detected secrets, no deleting user work outside the approved plan, no disabling security controls, no fabricated results (tool outputs are recorded verbatim). | P0 | 1 |
| FR-RUL-007 | **Clarification:** agents shall ask when instructions are ambiguous; asking shall be a first-class TUI interaction. | P0 | 1 |
| FR-RUL-008 | Category-specific rule sections (frontend, backend, mobile, CLI, library, infra, data/ML, monorepo, docs, marketing/SEO) shall be activated by repository detection, with manual override. | P1 | 1 |
| FR-RUL-009 | In headless mode plan approval requires `--approve-plan`; use is recorded in `Changelog.md` (see PRD OQ-1). | P1 | 1 |

### 4.6 Agentic coding and tools (FR-COD / FR-TOL)
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| FR-COD-001 | Multi-file edits shall be shown as a unified diff and applied only after approval. | P0 | 1 |
| FR-COD-002 | Edits shall be atomic per approval batch; a one-key undo shall restore prior state (via git stash/patch or a shadow snapshot when not in git). | P0 | 1 |
| FR-COD-003 | Test-fix loop: run tests, parse failures, patch, re-run, bounded by max iterations. | P0 | 1 |
| FR-COD-004 | Git operations: status, diff, branch create, commit with generated message, PR-description draft. Push and force operations require explicit confirmation; protected branches are never pushed to without confirmation. | P0 | 1 |
| FR-COD-005 | LSP diagnostics shall be fed to the Coder/Reviewer after edits. | P1 | 1 |
| FR-COD-006 | Codebase search: fast lexical (ripgrep-style) P0; semantic index P1. | P0/P1 | 1 |
| FR-COD-007 | Image/screenshot input for vision-capable models. | P2 | 1 |
| FR-TOL-001 | Filesystem tool scoped to the project directory by default; paths are canonicalised to prevent traversal/symlink escape. | P0 | 1 |
| FR-TOL-002 | Shell tool executes with a timeout, output cap, and cwd restricted to the project; commands are matched against allow / ask / deny lists. | P0 | 1 |
| FR-TOL-003 | Permission tiers: read-only auto; writes need diff approval; shell/git/network need per-command approval unless allow-listed; user may "always allow this command pattern for this project". | P0 | 1 |
| FR-TOL-004 | Every tool call shall be written to an audit log (tool, args, result summary, approved_by_user, timestamp). | P0 | 1 |
| FR-TOL-005 | Browser automation (headless) isolated from the main session. | P2 | 1 |
| FR-TOL-006 | MCP tools registered via config are exposed to agents subject to the same permission tiers. | P1 | 1 |
| FR-TOL-007 | Secrets (API keys) shall never be included in any prompt; a redaction filter shall scrub known secret values and common secret patterns from tool output before it reaches a model. | P0 | 1 |

### 4.7 Context and session management (FR-CTX)
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| FR-CTX-001 | Sessions store structured context (turns, retrieved files, tool outputs) locally and can be resumed (`flappycode --continue` / `/sessions`). | P0 | 1 |
| FR-CTX-002 | When nearing a model's context limit, older turns shall be summarised/compacted, not silently truncated; the user is informed. | P0 | 1 |
| FR-CTX-003 | Project memory (key/value facts) persists per project and feeds `Context.md`. | P1 | 1 |
| FR-CTX-004 | Each agent receives only the context slice it needs, to conserve free-tier tokens. | P1 | 1 |

### 4.8 Interfaces beyond the TUI (FR-INT)
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| FR-INT-001 | Headless mode `run` with `--json` line-delimited event output and meaningful exit codes. | P1 | 1 |
| FR-INT-002 | `serve` exposes a local HTTP API (OpenAPI 3) with SSE event stream, bound to `127.0.0.1` with a per-launch bearer token. | P1 | 1 |
| FR-INT-003 | The server API shall carry the same events as the in-process event bus so the desktop app needs no engine changes. | P0 | 3 |

### 4.9 Accounts and usage dashboard (Phase 2) (FR-ACC / FR-USG / FR-DSH)
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| FR-ACC-001 | Website shall support "Sign in with Google" (OAuth 2.0 / OIDC). No passwords stored. | P0 | 2 |
| FR-ACC-002 | The installation guide shall be publicly viewable; dashboard routes require an authenticated session. | P0 | 2 |
| FR-ACC-003 | `flappycode login` shall use the Device Authorization Grant: the CLI shows a code and URL, user approves in browser, CLI receives a revocable token stored in the keychain. | P0 | 2 |
| FR-ACC-004 | The user shall be able to revoke CLI tokens and delete their account and all associated data; deletion completes within 24 h. | P0 | 2 |
| FR-USG-001 | The CLI shall report **only** the fields in §6.3; the server shall reject any payload containing unknown fields. | P0 | 2 |
| FR-USG-002 | Reporting requires a logged-in, consenting user; `flappycode telemetry off` stops it immediately; the CLI works fully without login. | P0 | 2 |
| FR-USG-003 | `flappycode telemetry show` shall print the exact payloads that would be / were sent. | P0 | 2 |
| FR-USG-004 | Active time shall count only foreground interactive/agent-running minutes; idle time (> 5 min no input and no running task) is excluded. | P0 | 2 |
| FR-USG-005 | Reports shall be batched (≤ 1 per 5 min), queued offline, and retried. | P1 | 2 |
| FR-DSH-001 | Dashboard shall show Connected Providers (provider type + display name only). | P0 | 2 |
| FR-DSH-002 | Per-provider drill-down lists every model the user has access to via the CLI with a used-vs-remaining bar; when remaining is unknown, show "estimated" or "unknown". | P0 | 2 |
| FR-DSH-003 | Dashboard shall show total CLI active hours and a daily usage view (per day, per model). | P0 | 2 |
| FR-DSH-004 | The dashboard shall not display, and the backend shall not store, prompts, file contents, diffs, file paths, repo names, API keys, or endpoints. | P0 | 2 |

### 4.10 Desktop application (Phase 3) (FR-DSK)
| ID | Requirement | Pri | Ph |
|---|---|---|---|
| FR-DSK-001 | The desktop app shall embed/launch the engine via the server API (§FR-INT-002) and offer all CLI features. | P0 | 3 |
| FR-DSK-002 | GUI shall present: project picker, chat/task view, live task graph, diff review with approve/reject per hunk, permission prompts, plan approval, model picker with `flappyauto` first, provider setup, pool-exhaustion notice, settings. | P0 | 3 |
| FR-DSK-003 | OAuth sign-in and dashboard from Phase 2 shall be accessible in-app. | P0 | 3 |
| FR-DSK-004 | Installers for Windows, macOS, Linux; code-signed; auto-update with user consent. | P0 | 3 |
| FR-DSK-005 | CLI and desktop shall share config, providers, registry and sessions on the same machine. | P1 | 3 |

## 5. Non-functional requirements

### 5.1 Performance
| ID | Requirement | Pri |
|---|---|---|
| NFR-PERF-001 | Cold start to interactive prompt ≤ 1.5 s (registry served from cache). | P0 |
| NFR-PERF-002 | TUI input latency ≤ 50 ms; render loop must not block on network. | P0 |
| NFR-PERF-003 | Discovery of one provider ≤ 10 s typical; providers refresh in parallel. | P1 |
| NFR-PERF-004 | Idle memory ≤ 250 MB; ≤ 600 MB with 4 parallel agents. | P1 |
| NFR-PERF-005 | Orchestrator overhead (excluding model latency) ≤ 200 ms per node. | P1 |

### 5.2 Reliability
| ID | Requirement | Pri |
|---|---|---|
| NFR-REL-001 | Crash mid-run shall not corrupt the working tree; session state is recoverable on next start. | P0 |
| NFR-REL-002 | Any provider failure shall degrade gracefully (fallback, then notice) — never an unhandled exception. | P0 |
| NFR-REL-003 | SQLite writes use WAL and transactions; migrations are versioned and reversible. | P0 |
| NFR-REL-004 | Phase 2 backend availability target 99.5 % monthly; the CLI shall be fully functional when the backend is down. | P0 (Ph 2) |

### 5.3 Security
| ID | Requirement | Pri |
|---|---|---|
| NFR-SEC-001 | API keys live only in keychain/encrypted store or env; never logged, never in prompts, never sent to any FlappyCode server. | P0 |
| NFR-SEC-002 | Defence against prompt injection from file/web content: tool output is treated as untrusted data; it cannot alter permissions, approvals or rules; destructive actions always require human approval. | P0 |
| NFR-SEC-003 | Server mode binds to loopback with bearer token; CORS disabled by default. | P0 |
| NFR-SEC-004 | Dependencies scanned in CI (`npm audit`, lockfile pinned); npm package published with provenance. | P1 |
| NFR-SEC-005 | Phase 2: TLS 1.2+, OAuth state/PKCE, CSRF protection, secure/HTTP-only cookies, rate limiting, least-privilege DB roles. | P0 (Ph 2) |
| NFR-SEC-006 | Logs are local, redact secrets, and are size-rotated. | P0 |

### 5.4 Privacy
| ID | Requirement | Pri |
|---|---|---|
| NFR-PRV-001 | Phase 1 makes **no** network calls except to user-configured providers, the community model-override list (read-only, no identifiers) and npm update checks (disableable). | P0 |
| NFR-PRV-002 | From Phase 2, the only user-derived data leaving the machine to FlappyCode servers is the §6.3 allow-list. | P0 |
| NFR-PRV-003 | Users can view, export and delete all server-side data. | P0 (Ph 2) |

### 5.5 Usability and accessibility
| ID | Requirement | Pri |
|---|---|---|
| NFR-USA-001 | Install → first successful task in under 5 minutes for a new user with one API key. | P0 |
| NFR-USA-002 | Every error message states what happened, why, and the next action. | P0 |
| NFR-USA-003 | Honour `NO_COLOR`, `FORCE_COLOR`, reduced-motion (`FLAPPYCODE_NO_ANIM=1`), and provide an ASCII-only mode. | P1 |
| NFR-USA-004 | Never rely on colour alone (icons/text accompany status colours). | P1 |

### 5.6 Portability and compatibility
| ID | Requirement | Pri |
|---|---|---|
| NFR-POR-001 | Identical core behaviour on Windows, macOS and Linux (path handling, shell selection: PowerShell/cmd on Windows, sh/bash/zsh elsewhere). | P0 |
| NFR-POR-002 | Package installs with `npm install -g flappycode` without requiring a compiler toolchain (prebuilt native modules only). | P0 |

### 5.7 Maintainability and observability
| ID | Requirement | Pri |
|---|---|---|
| NFR-MNT-001 | Strict TypeScript; lint + format in CI; unit-test coverage ≥ 70 % on core (router, classifier, permission engine, RULES gates ≥ 90 %). | P0 |
| NFR-MNT-002 | Connectors are isolated modules with recorded-response contract tests. | P0 |
| NFR-OBS-001 | `flappycode doctor` reports environment, keychain, provider reachability, DB integrity, version. | P1 |
| NFR-OBS-002 | Debug logs (`--debug`) written locally with structured events. | P1 |

## 6. Data requirements

### 6.1 Local schema (Phase 1) — SQLite
```sql
provider(id TEXT PK, type TEXT, display_name TEXT, base_url TEXT, auth_ref TEXT,
         enabled INT, data_use_policy TEXT, max_concurrency INT, created_at INT);

model(provider_id TEXT, model_id TEXT, tier TEXT CHECK(tier IN
      ('free','rate_limited_free','paid','disabled','unavailable')),
      tier_source TEXT,              -- override|community|metadata|rule
      context_length INT, modality TEXT, supports_tools INT, supports_vision INT,
      tool_probe_passed INT, price_in REAL, price_out REAL, avg_latency_ms INT,
      last_validated_at INT, PRIMARY KEY(provider_id, model_id));

model_override(provider_id TEXT, model_id TEXT, tier TEXT, created_at INT);

agent_definition(name TEXT PK, system_prompt TEXT, allowed_tools TEXT,
                 preferred_model_ref TEXT, fallback_policy TEXT);

session(id TEXT PK, project_path TEXT, created_at INT, updated_at INT, summary TEXT);
message(id INTEGER PK, session_id TEXT, role TEXT, content TEXT, created_at INT);

task_run(id TEXT PK, session_id TEXT, prompt TEXT, plan_approved_at INT, status TEXT);
task_node(id TEXT PK, run_id TEXT, agent TEXT, description TEXT, status TEXT,
          depends_on TEXT, model_used TEXT, substitutions TEXT, started_at INT, ended_at INT);

tool_call_log(id INTEGER PK, node_id TEXT, tool TEXT, args TEXT, result_summary TEXT,
              approved_by_user INT, ts INT);

usage_local(provider_id TEXT, model_id TEXT, date TEXT, requests INT,
            tokens_in INT, tokens_out INT, active_minutes INT,
            PRIMARY KEY(provider_id, model_id, date));   -- feeds Phase 2 without any prompt data

project_memory(project_path TEXT, key TEXT, value TEXT, updated_at INT,
               PRIMARY KEY(project_path, key));
```

### 6.2 Configuration file
Location: `~/.config/flappycode/config.json` (Windows: `%APPDATA%\flappycode\config.json`); project override `./.flappycode/config.json`. Shape follows Spec §4.9 (`providers`, `modelPolicy`, `agents`), plus `permissions` (allow/ask/deny patterns), `sandbox`, `telemetry` (Phase 2). Reserved model identifiers: `flappyauto`, `auto:free-fast`, `auto:best-fit-free`.

### 6.3 Phase 2 server-side data (allow-list — anything else is rejected)
```
account(id, google_sub, email, created_at)
cli_token(id, account_id, token_hash, created_at, revoked_at, device_label)
usage_metric(account_id, provider_type, provider_alias, model_id, date,
             minutes_active, units_consumed, units_remaining, remaining_is_estimate)
session_time_log(account_id, date, cli_active_minutes)
```
`provider_alias` is the user-chosen display name (validated: ≤ 40 chars, `[A-Za-z0-9 ._-]`). Numbers are integers. There are **no free-text, path, URL or key fields**.

## 7. Error handling requirements

| Situation | Required behaviour |
|---|---|
| Invalid API key | Mark provider `auth_failed`, exclude from pool, show fix hint. |
| Provider 429 | Honour `Retry-After`; mark model cooling-down; fallback. |
| Provider 5xx / timeout | Retry ×2 with backoff; then fallback; increment error rate. |
| Model disappears mid-task | Mark `unavailable`; continue on next best-fit; log substitution. |
| Malformed model output (bad JSON / bad tool call) | One repair attempt; then substitute model. |
| Free pool exhausted | FR-RTE-006 notice; pause. |
| Context overflow | Compact (FR-CTX-002); if impossible, pick larger-context model. |
| Tool denied by user | Agent receives a "denied" result and must replan or ask. |
| Keychain unavailable | Use encrypted-file fallback; warn once. |
| Backend down (Phase 2) | Queue reports; CLI unaffected. |

## 8. Constraints
- Must be installable via npm as a single global package with `flappycode` bin entry.
- No server component in Phase 1.
- `RULES.md` semantics are fixed by the spec (§4.17) and may not be weakened by config.
- Phase 2 data model is limited to §6.3.

## 9. Verification and traceability

| Area | Method | Key checks |
|---|---|---|
| Classifier / router | Unit + property tests | Never returns `paid` unless explicitly allowed; fallback order deterministic. |
| Pool exhaustion | Integration with mock providers | 0 paid calls; notice shown; resumes after action. |
| RULES gates | Integration | Write tool denied without plan-approval token; docs updated after change. |
| Permission engine | Unit + fuzz on paths/commands | No traversal, deny-list respected. |
| Connectors | Contract tests with recorded responses | All required methods behave per PI-002. |
| TUI | Snapshot tests (ink-testing-library) + manual matrix (Windows Terminal, iTerm2, GNOME, SSH) | Layout at 60/80/120 cols. |
| Packaging | CI matrix installing tarball on win/mac/linux | `npm i -g` + `flappycode --version`. |
| Telemetry (Ph 2) | Schema validation + red-team tests | Unknown fields rejected; no prompt strings in outbound traffic (network capture test). |
| Dashboard | E2E | Numbers equal local logs ±2 %. |
| Desktop (Ph 3) | Parity checklist | Every FR marked "CLI" has a GUI counterpart. |

**Traceability:** every user story in `PRD.md` §8 maps to FR IDs — US-02 → FR-PRV/FR-MOD; US-03 → FR-ORC/FR-RUL-003; US-04 → FR-RTE-003; US-05 → FR-RTE-005/006; US-06 → FR-RTE-004; US-07 → FR-TOL-003; US-08 → FR-RUL; US-09 → FR-ORC-004; US-11–15 → FR-ACC/USG/DSH; US-16–17 → FR-DSK.
