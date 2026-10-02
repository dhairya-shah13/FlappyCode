# Category Rules: CLI

1. Deterministic Exit Codes: Exit 0 for success, 1 for runtime errors, 2 for CLI argument syntax errors, 130 for SIGINT.
2. Output Streams: Write program results and primary output to stdout; write diagnostics, progress indicators, and errors to stderr.
3. Machine-Readable Flags: Support `--json` or `--quiet` for automated scripting environments.
4. Non-Interactive Grace: Never hang indefinitely waiting for stdin when running non-interactively or in a headless terminal.
