---
scope: "cli"
---

# Command Line Interface (CLI) Rules

- [CLI-001] Adhere strictly to POSIX standard exit codes: exit 0 on success, exit 1 for general failures, exit 2 for invalid arguments/syntax.
- [CLI-002] Separate stream output strictly: write primary programmatic data to `stdout`, and reserve `stderr` exclusively for warnings, error diagnostics, and status logs.
- [CLI-003] Always provide comprehensive `--help` and `--version` flags on the root command and all subcommands.
- [CLI-004] Support non-interactive and automated environments by providing `--yes`, `--force`, or `--non-interactive` flags to bypass interactive prompts.
- [CLI-005] Format output predictably when `stdout` is not a TTY (e.g. piped or redirected): disable ANSI color codes, strip spinners, and support `--json`.
- [CLI-006] Respect standard environment variables: honor `NO_COLOR` (disabling all styling), `FORCE_COLOR`, and `DEBUG`.
- [CLI-007] Handle process interrupt signals (`SIGINT`, `SIGTERM`) cleanly: restore terminal cursor visibility, clear raw input modes, and clean up temp files.
- [CLI-008] Maintain instant CLI startup time (< 200ms) by avoiding eager imports of heavy runtime dependencies until subcommands are invoked.
- [CLI-009] Ensure every error message reports three distinct parts: the error condition, the likely cause, and a concrete suggested remediation command.
- [CLI-010] Resolve configuration parameters using deterministic precedence: CLI flag > environment variable > local config file > global config file > default value.
- [CLI-011] Use platform-agnostic path handling (`node:path` methods) to guarantee seamless operation across Windows, macOS, and Linux without shell slash assumptions.
- [CLI-012] Provide human-readable progress indicators or spinners for long-running operations (> 1 second), updating on a single terminal line without spamming logs.
- [CLI-013] Provide quiet (`-q`, `--quiet`) and verbose/debug (`-v`, `--verbose`) logging flags across all non-trivial command executions.
- [CLI-014] Never prompt for secret credentials or passwords with echoed characters; always use masked or hidden terminal input readers.
- [CLI-015] Paginate long output lists or provide concise default summaries with explicit `--all` or limit options.
