# 📖 FlappyCode CLI Reference

Complete reference for all FlappyCode commands, flags, subcommands, and exit codes.

---

## 1. Exit Codes

FlappyCode returns deterministic exit codes for programmatic use in scripts and CI pipelines:

| Exit Code | Meaning | Description |
|---|---|---|
| `0` | **Success** | Command or task completed successfully. |
| `1` | **Error / Failure** | General error, entity not found, or command failed. |
| `2` | **Usage Error** | Invalid flags, unknown subcommands, or missing required arguments. |
| `3` | **Approval Required** | Implementation plan or diff review required user approval (e.g. non-interactive run without `--approve-plan`). |
| `4` | **Pool Exhausted** | All connected free provider quotas are exhausted and no paid grant was authorized. |
| `5` | **Security / Precondition Violation** | Action violated `FsJail` boundaries or no providers are configured. |
| `130` | **Cancelled** | Process was interrupted by user signal (`SIGINT` / Ctrl+C). |

---

## 2. Interactive TUI

```bash
flappycode
```
Launches the full interactive terminal user interface (Ink TUI) in the current directory.
- `Enter`: Submit prompt.
- `Shift+Enter`: Multi-line prompt input.
- `/`: Slash command menu (`/models`, `/providers`, `/plan`, `/diff`, `/undo`, `/rules`, `/sessions`, `/status`, `/exit`).
- `@`: Fuzzy file path mention picker.
- `Ctrl+C`: Cancel current running task / exit.

---

## 3. Headless Task Execution (`run`)

```bash
flappycode run <prompt> [options]
```

Executes a single coding task in non-interactive / headless mode.

### Options
- `--approve-plan`: Automatically approve the generated implementation plan. Required in non-TTY environments unless interactive approval is piped.
- `--model <modelRef>`: Force execution with a specific model reference (e.g., `groq/llama-3.3-70b` or `free`).
- `--json`: Output events as raw newline-delimited JSON (NDJSON) stream to stdout.
- `--cwd <path>`: Working directory for project execution (defaults to `.`).
- `--debug`: Enable verbose debug logging to local `flappycode.log`.

---

## 4. Provider Management (`providers`)

```bash
flappycode providers <subcommand> [args]
```

### Subcommands
- `providers add`: Interactive wizard to connect a new provider (Ollama, Groq, Google, OpenRouter, etc.).
- `providers list`: Display all registered providers, their connectivity status, and data-use policies.
- `providers test <providerId>`: Test reachability and API credentials for a specific provider.
- `providers refresh [providerId]`: Query endpoints and refresh discovered model inventories.
- `providers enable <providerId>`: Enable a previously disabled provider.
- `providers disable <providerId>`: Disable a provider without deleting stored credentials.
- `providers remove <providerId>`: Delete a provider and remove stored API keys from OS Keychain.

---

## 5. Model Catalog (`models`)

```bash
flappycode models [options]
```

### Options
- `--free`: Filter catalog to show only free or rate-limited free models.
- `--provider <id>`: Filter models by a specific provider ID.
- `--tier <tier>`: Filter by model tier (`free`, `rate_limited_free`, `paid`, `disabled`).
- `--json`: Output model catalog as structured JSON.

### Model Tagging Subcommands
- `models tag <modelRef> <tag>`: Attach a custom user tag to a model (e.g., `fast`, `smart`).
- `models untag <modelRef> <tag>`: Remove a custom tag from a model.

---

## 6. Agent Management (`agents`)

```bash
flappycode agents <subcommand> [args]
```

### Subcommands
- `agents list [--json]`: List all specialist agents (built-in and custom `.flappycode/agents/`), their model bindings, and tool permissions.
- `agents show <agentName> [--json]`: Display full agent definition including system prompt, allowed tools, preferred model, and fallback policy.
- `agents bind <agentName> <modelRef>`: Pin a specific model to an agent (overrides auto-selection).
- `agents bind <agentName> --unbind`: Remove model binding and restore automatic task routing.

---

## 7. Configuration (`config`)

```bash
flappycode config <subcommand> [args]
```

### Subcommands
- `config get [key]`: Print effective configuration or a specific setting.
- `config set <key> <value>`: Update a setting in project or user configuration.
- `config edit`: Open the configuration file in your default editor (`$EDITOR`).
- `config path`: Display file paths for active user and project configuration files.

---

## 8. Session & State Management (`sessions`)

```bash
flappycode sessions <subcommand> [args]
```

### Subcommands
- `sessions list`: View past sessions, task counts, and timestamps.
- `sessions resume <sessionId>`: Reconnect to a previous session and restore context.
- `sessions delete <sessionId>`: Delete a past session and its associated task records.

---

## 9. System Diagnostics (`doctor`)

```bash
flappycode doctor
```
Runs a comprehensive environment and diagnostic check:
- Node.js runtime version check (`≥ 20`).
- SQLite storage connectivity, WAL journal mode, and schema integrity.
- OS Keychain credential store availability.
- Provider reachability and free model pool count.
- Git binary installation and protected branches.
- Configuration file syntax and custom agent definitions.

---

## 10. Upgrade (`upgrade`)

```bash
flappycode upgrade [options]
```
Checks for updates against the package registry.

### Options
- `--check`: Check if a newer version is available without installing.
- `--registry <url>`: Override registry URL (used for internal mirrors and testing).

---

## 11. Local Server (`serve`)

```bash
flappycode serve [--port <number>]
```
Starts a local HTTP and Server-Sent Events (SSE) daemon bound strictly to `127.0.0.1` with bearer token authentication for IDE extensions and headless integration.
