# 🚀 FlappyCode Quickstart Guide

Get up and running with FlappyCode in **under 5 minutes** (NFR-USA-001).

---

## 1. Prerequisites

- **Node.js**: `≥ 20.0.0 LTS`
- **pnpm**: `≥ 9.0.0`
- **Git**: Installed and in PATH

---

## 2. Installation

> [!NOTE]
> FlappyCode Phase 1 is a pre-release candidate undergoing internal team verification. It is installed from source or local tarball.

```bash
# Clone the repository
git clone https://github.com/dhairya-shah13/FlappyCode.git
cd FlappyCode

# Install dependencies and build packages
pnpm install
pnpm build

# Link globally for terminal access
pnpm --filter @flappycode/cli link --global
```

Verify your installation:
```bash
flappycode --version
flappycode doctor
```

---

## 3. First Run & Adding a Provider

FlappyCode aggregates free model tiers across multiple AI providers and local servers.

### Connect Local Ollama (Zero Cost & 100% Offline)
If you have [Ollama](https://ollama.ai) installed locally:
```bash
# Verify Ollama is running
ollama serve

# Add Ollama to FlappyCode
flappycode providers add
# Select "ollama", endpoint defaults to http://127.0.0.1:11434
```

### Connect Cloud Providers with Free Tiers
You can connect cloud providers like Groq, Google AI Studio, or OpenRouter:
```bash
flappycode providers add
# Choose: groq (free rate-limited Llama 3 models)
# Enter your Groq API key (stored securely in OS Keychain)
```

Verify connected providers and discovered free models:
```bash
flappycode providers list
flappycode models --free
```

---

## 4. Run Your First Coding Task

Navigate to any project directory:
```bash
cd ~/my-project
flappycode
```

### In Interactive TUI Mode:
1. Type your request at the prompt:
   ```
   Create a TypeScript utility function in src/math.ts that calculates Fibonacci numbers with memoization
   ```
2. **Step 1 — Plan Approval Gate (`RULES.md`)**:
   FlappyCode's `flappyauto` planner generates a structured Implementation Plan. Review the proposed steps and target files (`src/math.ts`), then press `y` or `Enter` to approve.
3. **Step 2 — Agent Execution**:
   Specialist agents execute tasks in parallel (File-Finder, Coder, Reviewer).
4. **Step 3 — Diff Review Gate**:
   Inspect the exact line diff proposed for `src/math.ts`. Press `y` (or `a` to approve all) to write the change to disk.
5. **Step 4 — Undo**:
   Need to revert? Simply type `/undo` in the TUI or run:
   ```bash
   flappycode sessions list
   ```
   FlappyCode's atomic undo engine restores previous file snapshots cleanly.

### Headless / Scripted Mode:
For CI or automated scripts:
```bash
flappycode run "Create a greeting function in hello.ts" --approve-plan --cwd .
```

---

## 5. Helpful Commands & Shortcuts

| Action | Command / Shortcut |
|---|---|
| Open Model Picker | `/models` |
| View Active Providers | `/providers` |
| Revert Last File Edits | `/undo` |
| Inspect Active Rules | `/rules` |
| System Health Diagnostics | `flappycode doctor` |
