# FlappyCode — CLI / TUI Design

| | |
|---|---|
| **Document** | CLI Design |
| **Version** | 1.0 (draft for team review) |
| **Date** | 29 September 2026 |
| **Based on** | `design_mockup.png` (home screen), Spec v0.2 |
| **Related** | `PRD.md`, `SRS.md`, `SystemArchitecture.md`, `TaskBreakdown.md` |

---

## 1. Install and launch

```powershell
npm install -g flappycode
flappycode
```

Exactly like OpenCode's flow: install globally once, then type the command from any project folder. The TUI opens **in the current directory**, which becomes the project root.

First-run detection: if no provider is connected, the home screen shows an inline onboarding card (§5.2) instead of an empty prompt.

## 2. What the mockup specifies (home screen)

Reading `design_mockup.png`, the home screen has five zones on a dark navy background:

| Zone | Content in the mockup |
|---|---|
| **A. Title/prompt line** | Terminal chrome: `PS C:\FlappyCode> flappycode` (the command being run — shown by the OS shell, not by us). |
| **B. Banner** | Pixel-art wordmark **FLAPPY** (yellow) + **CODE** (cyan/blue), flanked by two pixel "flappy birds" (yellow body, white eye, orange beak, blue wing) with cyan speed-lines trailing outward. |
| **C. Taglines** | Line 1 (white, bullet separated): `Multi-Provider • Multi-Agent • Free Models • One Assistant`. Line 2 (light blue): `Your connected providers. All the free models. One powerful coding agent.` |
| **D. Input box** | Full-width, rounded cyan border, prompt glyph `>_`, placeholder `Type your coding request here...` in soft blue, blinking block/bar cursor. Box is ~3 lines tall to allow multi-line input. |
| **E. Status bar** | Bottom, separated by cyan rules: left `🐦 FlappyCode v…`; centre `Providers: 4 connected │ Free models: 14 available` (numbers in green); right `⚡ Ready!` (green). |

**Design notes / deviations we must decide:**
1. The mockup shows `v0.2` — that is the *spec* version. In the product, this shows the real semver (`v0.1.0` at Phase 1 release). (PRD OQ-6)
2. The mockup is a raster concept. Terminals can't draw arbitrary pixels, so the banner is rebuilt with **Unicode block characters / half-blocks** (§4). The exact mockup art is used only on the website/desktop.
3. A terminal cannot reliably render the wifi/bird icons in the status bar; we use single-width symbols with ASCII fallbacks (§9).

## 3. Visual system

### 3.1 Palette (sampled from the mockup; verify with a colour picker before finalising)

| Token | Hex (approx.) | Use |
|---|---|---|
| `bg` | `#020B14` | Terminal background (we don't paint it; recommended scheme) |
| `flappy-yellow` | `#FFC72C` | "FLAPPY" wordmark, `flappycode` command highlight, warnings |
| `code-cyan` | `#00B7FF` | "CODE" wordmark, borders, rules, focus |
| `text` | `#EAF2FA` | Primary text |
| `subtle` | `#7FB2FF` | Subtitle, placeholder, secondary text |
| `ok` | `#2EE59D` | Counts, "Ready", success |
| `warn` | `#FFC72C` | Attention, waiting for approval |
| `error` | `#FF5C5C` | Errors |
| `beak-orange` | `#FF7A2F` | Bird accent, "paid" tier badge |

Terminal fallbacks: true-colour → 256-colour → 16 ANSI (`yellow`, `cyan`, `green`, `red`). `NO_COLOR` → monochrome using bold/dim/underline plus text labels.

### 3.2 Typography and glyphs
Monospace only. Bullet `•`, rules `─`, box `╭╮╰╯│`, prompt `>_`, status `●` (ok) `◐` (busy) `○` (idle) `✖` (error) `⚡` (ready). ASCII fallback set in §9.

### 3.3 Motion
Cursor blink; braille spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) for running nodes; optional 2-frame "flapping" bird next to `Ready!` while agents run. All motion disabled with `FLAPPYCODE_NO_ANIM=1` or when not a TTY.

## 4. Home screen wireframe (≥ 100 columns)

```
PS C:\FlappyCode> flappycode
──────────────────────────────────────────────────────────────────────────────────────────────

───────────▄██████████████▄
───────▄████░░░░░░░░█▀────█▄
──────██░░░░░░░░░░░█▀──────█▄
─────██░░░░░░░░░░░█▀────────█▄
────██░░░░░░░░░░░░█──────────██
───██░░░░░░░░░░░░░█──────██──██
──██░░░░░░░░░░░░░░█▄─────██──██
─████████████░░░░░░██────────██
██░░░░░░░░░░░██░░░░░█████████████
██░░░░░░░░░░░██░░░░█▓▓▓▓▓▓▓▓▓▓▓▓▓█
██░░░░░░░░░░░██░░░█▓▓▓▓▓▓▓▓▓▓▓▓▓▓█
─▀███████████▒▒▒▒█▓▓▓███████████▀
────██▒▒▒▒▒▒▒▒▒▒▒▒█▓▓▓▓▓▓▓▓▓▓▓▓█
─────██▒▒▒▒▒▒▒▒▒▒▒▒██▓▓▓▓▓▓▓▓▓▓█
──────█████▒▒▒▒▒▒▒▒▒▒██████████
─────────▀███████████▀

        Multi-Provider  •  Multi-Agent  •  Free Models  •  One Assistant
      Your connected providers. All the free models. One powerful coding agent.

╭────────────────────────────────────────────────────────────────────────────────────────────╮
│ >_  Type your coding request here...▌                                                      │
│                                                                                            │
╰────────────────────────────────────────────────────────────────────────────────────────────╯





──────────────────────────────────────────────────────────────────────────────────────────────
 🐦 FlappyCode v0.1.0      Providers: 4 connected │ Free models: 14 available      ⚡ Ready!
──────────────────────────────────────────────────────────────────────────────────────────────
```

**Banner asset spec**
- Text logo (2 rows of half-blocks `▀▄█` = 5-pixel-tall glyphs rendered in 3 terminal rows) generated **at build time** from a pixel font definition file (`tui/assets/logo.pixels`) so colours per letter are exact. The 5-row block version above is the reference layout; use it as the basis for the pixel map.
- Birds: 2-row × 8-col half-block sprite each; mirrored for the right side; speed-lines drawn with `─ ╌ -`.
- Colour: letters F-L-A-P-P-Y → `flappy-yellow`; C-O-D-E → `code-cyan`.

### 4.1 Responsive layouts

| Terminal width | Banner | Taglines | Status bar |
|---|---|---|---|
| ≥ 100 cols | Full (birds + wordmark) | Both lines | Full 3-part |
| 70–99 | Wordmark only | Both lines, wrapped | Full |
| 45–69 | Single-line `FLAPPY``CODE` text (bold yellow/cyan) | Line 2 only | `v0.1.0 │ 4 prov │ 14 free │ ⚡` |
| < 45 or height < 18 | None | None | Minimal; warn "terminal too small" if < 40×12 |

The banner appears **only on the home/empty screen**. Once a task starts, it collapses into a 1-line header to maximise room for the task view.

### 4.2 Status bar states (right segment)

| State | Display |
|---|---|
| Idle, providers ok | `⚡ Ready!` (green) |
| Running | `◐ Working… 3/7 nodes` (cyan, spinner) |
| Awaiting user | `● Waiting for approval` (yellow) |
| Free pool exhausted | `✖ Free pool exhausted` (red) |
| No providers | `○ No providers — press / then "providers add"` (yellow) |
| Offline | `○ Offline` (grey) |
Centre segment counts update live from `registry.updated` events. `Providers: N connected` counts enabled + authenticated providers; `Free models: M available` = FR-MOD-008.

## 5. Screens and flows

### 5.1 Command structure

```
flappycode                       Start the interactive TUI in the current directory
flappycode run "<prompt>"        Headless: run one task (flags: --model, --approve-plan, --json, --cwd)
flappycode serve [--port 4477]   Start the local HTTP/SSE server
flappycode providers             add | list | remove | test | refresh | enable | disable
flappycode models                List the pool (--free, --provider, --json, --tier)
flappycode agents                list | show <name> | bind <agent> <model>
flappycode config                get | set | edit | path
flappycode sessions              list | resume <id> | delete <id>
flappycode doctor                Diagnose environment, keychain, providers, DB
flappycode upgrade               Update to latest version
flappycode login | logout | whoami | telemetry show|off | delete-account   (Phase 2)
flappycode --version | --help
```
Exit codes: `0` success, `1` task failed, `2` usage error, `3` needs approval (headless without `--approve-plan`), `4` free pool exhausted, `5` no providers, `130` cancelled.

### 5.2 First-run onboarding (inside the TUI, no providers)

```
╭─ Welcome to FlappyCode ─────────────────────────────────────────────────────╮
│ No providers connected yet. Connect one and I'll find its free models.      │
│                                                                              │
│  Detected on this machine:   ● Ollama (localhost:11434)  — 6 models          │
│                                                                              │
│  ▸ Connect a provider…        ↵                                              │
│    Use detected Ollama        ↵                                              │
│    Skip for now               Esc                                            │
╰──────────────────────────────────────────────────────────────────────────────╯
```
**Provider wizard** (multi-step, each step one screen): choose provider (searchable list) → paste key (masked; shows "stored in OS keychain") → validate (spinner) → discovery summary:

```
✔ OpenRouter connected
  Found 312 models  ·  38 free  ·  9 rate-limited free  ·  265 paid
  Data use: some free models may train on your prompts (see /models to filter)
  [ Add another provider ]   [ Start coding ]
```

### 5.3 Prompt input behaviour
- `Enter` submit · `Shift+Enter` (or `\` + Enter) newline · `↑/↓` history · `Ctrl+R` history search · `Tab` completes `/commands` and `@file` mentions · `Esc` clears / cancels · `Ctrl+C` once = cancel run, twice = quit · `Ctrl+L` clear screen.
- `/` opens the slash-command palette; `@` opens a fuzzy file picker; pasted images (Phase 1 P2) become attachments.

### 5.4 Slash commands
`/models` (picker) · `/agents` · `/providers` · `/plan` (re-show plan) · `/undo` (revert last change set) · `/diff` · `/sessions` · `/new` · `/status` (pool, quota estimates, cooldowns) · `/rules` (show active RULES + conflicts) · `/config` · `/help` · `/exit`.

### 5.5 Model picker (`/models`)

```
╭─ Choose model ───────────────────────────────────────  filter: ▌ ──────────────╮
│ ▸ ⚡ flappyauto            Multi-agent orchestration · picks best free model     │
│                            per task                              [DEFAULT]      │
│ ─────────────────────────────────────────────────────────────────────────────── │
│   FREE                                                                          │
│   ● openrouter/qwen3-coder:free        128k  tools   free (rate-limited)  ⚠ trains │
│   ● groq/llama-3.3-70b                 128k  tools   free (rate-limited)          │
│   ● ollama/qwen2.5-coder:14b           32k   tools   local                        │
│   ● google/gemini-flash                1M    vision  free (rate-limited)  ⚠ trains │
│   PAID (never used unless you pick or approve)                                   │
│   ○ anthropic/claude-…                 200k  tools   $$                          │
│ ↑↓ move  ↵ select  Tab: bind to agent…  f: free only  d: data-use info  Esc      │
╰────────────────────────────────────────────────────────────────────────────────╯
```
`flappyauto` is **always the first row** (FR-ORC-001). Selecting a single model shows a banner "Single-model mode — no orchestration". `Tab` on a model opens "Bind to agent…" (Planner / Coder / Reviewer / …). Model names above are illustrative.

### 5.6 Implementation Plan approval (mandatory before any write — FR-RUL-003)

```
╭─ Implementation Plan ────────────────────────────────── planner: openrouter/… ─╮
│ Goal: Fix failing test in auth.ts                                              │
│                                                                                │
│  1. File-Finder    locate auth handlers & failing test          (read-only)    │
│  2. Analyst        trace token validation flow                  (read-only)    │
│  3. Coder          patch src/auth.ts                            (writes 1 file)│
│  4. Tester         run `npm test -- auth`                       (shell: ask)   │
│  5. Reviewer       verify against intent                        (read-only)    │
│                                                                                │
│ Files that may change:  src/auth.ts                                            │
│ Assumptions: token expiry is UTC.                                              │
│                                                                                │
│  [ ↵ Approve plan ]   [ e Edit ]   [ q Ask a question ]   [ Esc Reject ]        │
╰────────────────────────────────────────────────────────────────────────────────╯
```

### 5.7 Live task graph / run view
Collapsed header (1 line) → run panel → input box stays at the bottom (queue further messages).

```
 🐦 FlappyCode · ~/projects/api · session 4f2a                     ◐ Working… 3/5
──────────────────────────────────────────────────────────────────────────────
 ✔ 1 File-Finder    groq/llama-3.3-70b                          2.1s
 ✔ 2 Analyst        google/gemini-flash                         4.8s
 ◐ 3 Coder          openrouter/qwen3-coder:free   ⟲ substituted (rate-limited → next best)
 ○ 4 Tester         ollama/qwen2.5-coder:14b      waiting on 3
 ○ 5 Reviewer       groq/llama-3.3-70b            waiting on 4
──────────────────────────────────────────────────────────────────────────────
 Coder ▸ Reading src/auth.ts … editing validateToken() …
──────────────────────────────────────────────────────────────────────────────
╭────────────────────────────────────────────────────────────────────────────╮
│ >_ Add a follow-up (queued)…                                               │
╰────────────────────────────────────────────────────────────────────────────╯
 v0.1.0 │ Providers: 4 │ Free models: 14                     ◐ Working… (Esc cancels)
```
`Tab` toggles between summary and expanded per-node logs; `↑↓` selects a node; `↵` opens its transcript.

### 5.8 Diff review (write approval)

```
╭─ Review changes ─────────────────────────────── 2 files · +18 −4 ────────────╮
│ src/auth.ts                                                                  │
│  @@ -42,7 +42,9 @@ validateToken                                              │
│   42   const now = Date.now();                                               │
│ - 43   if (token.exp < now) return false;                                    │
│ + 43   if (token.exp * 1000 < now) return false;                             │
│ …                                                                            │
│                                                                              │
│  a Apply all   y Apply hunk   n Skip hunk   e Edit   u Undo later   Esc Back │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### 5.9 Permission prompt (shell / git / network)

```
╭─ Permission needed ──────────────────────────────────────────────────────────╮
│ Tester wants to run:   npm test -- auth                                      │
│ Directory: ~/projects/api      Risk: low (matches project test script)       │
│                                                                              │
│  [ y Allow once ]  [ a Always allow "npm test *" in this project ]  [ n Deny ]│
╰──────────────────────────────────────────────────────────────────────────────╯
```
Destructive commands (e.g., `rm -rf`, `git push --force`) use a **red** frame, show explicit impact, and cannot be "always allowed".

### 5.10 Free-pool exhausted notice (Spec §2.7 / §4.15)

```
╭─ Free model pool exhausted ──────────────────────────────────────────────────╮
│ Every free model across your 4 connected providers is unavailable right now  │
│ (rate-limited or out of quota). No paid model has been used.                 │
│                                                                              │
│  Next reset (est.):  groq in 14 min · openrouter tomorrow 00:00 UTC          │
│                                                                              │
│  ▸ 1  Add credit on a paid-capable provider     (opens provider billing)     │
│    2  Connect another free-tier provider                                     │
│                                                                              │
│  Task paused — it will resume after you choose.        Esc: keep paused      │
╰──────────────────────────────────────────────────────────────────────────────╯
```
Exactly two actions; no third "just use paid" shortcut. Choosing (1) shows which paid models would be used and asks for a final confirm (this issues the `PaidGrant`).

### 5.11 Clarifying question (RULES.md: ask when ambiguous)

```
╭─ Coder needs clarification ──────────────────────────────────────────────────╮
│ "Make login faster" — which path matters most?                               │
│  ▸ 1 Server response time     2 Client bundle size     3 Other (type…)       │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### 5.12 Completion summary

```
✔ Done in 38s · 5 agents · 0 paid calls · 3 models used
  Changed: src/auth.ts (+3 −1)      Tests: 42 passed
  Updated: Context.md, Changelog.md
  /undo to revert · /diff to review · ↵ to continue
```

## 6. Non-interactive (headless) output

`flappycode run "…"` prints human-readable progress to stderr and the final summary to stdout. With `--json`, it prints newline-delimited events (same schema as `protocol` Events). Needs `--approve-plan` (exit 3 otherwise). `--model flappyauto|<id>` selects mode. Never prompts; asks that would require input fail with a clear message and exit code 3.

## 7. Messages and tone

- Short, plain, friendly; never blame the user; **what happened → why → what to do**.
- Example error: `✖ Groq rejected the API key (401). Re-enter it with: flappycode providers add groq`
- Never show raw stack traces by default; `--debug` shows them and writes a log path.
- Always state cost stance when relevant: "0 paid calls".

## 8. Phase 2 and 3 additions to the CLI

| Phase | Addition |
|---|---|
| 2 | `flappycode login` shows a device code screen: `Open https://flappycode.<domain>/device and enter code ABCD-EFGH`. After link, status bar right side shows account initial. `telemetry show` prints outbound payloads. First login shows a consent card listing exactly what is reported (active hours, per-model usage counts) and what is never sent (prompts, code, paths, keys). |
| 2 | `/usage` slash command shows a local mini-dashboard (same numbers the website shows). |
| 3 | `flappycode app` opens the desktop app on the current project; the CLI prints "Desktop app detected — sessions are shared." Parity: every screen above has a GUI counterpart. |

## 9. Accessibility and compatibility

- `NO_COLOR`, `FORCE_COLOR`, `FLAPPYCODE_ASCII=1` (ASCII fallback: borders `+-|`, bullets `*`, spinner `|/-\`, birds → `<o)`), `FLAPPYCODE_NO_ANIM=1`.
- State is never conveyed by colour alone (icon + word).
- Keyboard-only; all actions have a key; keys shown in each panel footer.
- Works in Windows Terminal, PowerShell 5/7, cmd (degraded), macOS Terminal/iTerm2, common Linux terminals, tmux, and over SSH.
- Screen-reader friendly mode (`FLAPPYCODE_PLAIN=1`): linear log output without box drawing or redraws.
- Resize handling: re-layout on `SIGWINCH`/resize events without losing input.

## 10. Implementation notes (Ink)

| Concern | Approach |
|---|---|
| Framework | Ink + `ink-text-input` (custom multi-line input), `ink-spinner`. |
| Layout | Flex boxes, width from `useStdout`; breakpoints in §4.1. |
| State | Store subscribes to engine event bus; UI is a pure function of state. |
| Banner | Pre-rendered ANSI string generated at build time from the pixel map; colours applied per letter. |
| Testing | `ink-testing-library` snapshots at 60/80/120 columns; manual matrix on Windows Terminal, iTerm2, GNOME Terminal, SSH. |
| Performance | Throttle re-renders to ~30 fps; stream model text in batches; never block on network. |

## 11. Design acceptance checklist (Phase 1)

- [ ] Home screen matches mockup zones A–E at ≥ 100 columns.
- [ ] Banner colours: FLAPPY yellow, CODE cyan; birds + speed lines present at ≥ 100 cols.
- [ ] Status bar counts update live after `providers add`/`refresh`.
- [ ] `flappyauto` is always first in the model picker.
- [ ] Plan approval screen appears before any write.
- [ ] Pool-exhausted screen offers exactly two actions.
- [ ] Layout verified at 60, 80, 120 columns.
- [ ] `NO_COLOR` and ASCII fallback verified.
- [ ] Verified on Windows Terminal (PowerShell), macOS, Linux, and over SSH.
