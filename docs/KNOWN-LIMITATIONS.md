# ⚠️ Known Limitations & Phase 1 Scope

This document provides a transparent accounting of technical boundaries, platform considerations, and deferred capabilities in FlappyCode Phase 1.

---

## 1. Scope Boundaries (Phases 2 & 3)

FlappyCode Phase 1 is strictly scoped to the **terminal CLI, React Ink TUI, and local orchestration engine**:
- **No Hosted Accounts or Cloud Telemetry**: Phase 1 contains zero telemetry collection, no remote user accounts, and no central backend servers (FR-RTE-009, NFR-PRV-001). Centralized team dashboards, Google OAuth, and opt-in anonymous usage stats are scheduled for Phase 2.
- **No Desktop GUI Shell**: Phase 1 operates exclusively within terminal emulators. The Electron/Tauri desktop GUI shell is scheduled for Phase 3.
- **npm Publication Status**: Public npm package deployment is deferred pending internal team review and dogfooding. Pre-release binaries are installed via source checkout or local `.tgz` tarball.

---

## 2. Provider & Quota Realities

- **Dynamic Free-Tier Upstream Quotas**: Cloud providers (Groq, Google AI Studio, OpenRouter free tier) impose dynamic rate limits (e.g. 15-30 requests per minute or daily token limits). While FlappyCode pools multiple providers and gracefully substitutes alternatives upon HTTP 429 rate limits, if all connected free quotas are exhausted simultaneously, the engine enters a safe paused state.
- **Local Model Hardware Footprint**: Local inference via Ollama, LM Studio, or llama.cpp depends entirely on host CPU/GPU/VRAM. For complex coding and planning tasks, 7B to 32B models are recommended (requiring 8 GB to 32 GB of memory).
- **Vision & Multi-modal Features**: Multi-modal image analysis schemas are implemented in `@flappycode/protocol`, but full multi-modal screenshot inspection in the terminal is subject to terminal emulator image protocol support (Sixel / Kitty / iTerm graphics).

---

## 3. Platform & Environment Considerations

- **Headless Linux Keychains**: On headless Linux environments (CI runners, minimal servers, SSH containers) where D-Bus or `libsecret` is unavailable, FlappyCode automatically falls back to an encrypted credentials file (`~/.config/flappycode/secrets.enc`) using AES-256-GCM with scrypt key derivation.
- **Terminal Width Minimum**: The React Ink TUI is optimized for terminals of at least 80 columns wide. In narrower windows (≤ 60 columns), text wrapping is enabled, and ASCII fallback mode (`FLAPPYCODE_ASCII=1`) is recommended.
- **Non-TTY Environments**: When running non-interactively (pipes, CI scripts), headless mode `flappycode run` requires either `--approve-plan` or explicit piped input, otherwise exiting with code 3 (`APPROVAL_REQUIRED`) to prevent unintended execution.

---

## 4. Performance Baselines (Measured)

Target and observed performance metrics on standard development hardware:
- **Cold start to interactive prompt**: < 1.5 seconds.
- **TUI keypress input latency**: < 50 milliseconds (async render loop never blocks on network requests).
- **Idle memory footprint (RSS)**: < 250 MB.
- **Active multi-agent execution (4 parallel tasks)**: < 600 MB.
- **Orchestration graph overhead per task node**: < 200 ms.
