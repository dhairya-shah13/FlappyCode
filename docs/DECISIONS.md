# Architecture & Engineering Decisions Log (DECISIONS.md)

All architectural deviations, structural choices, and provisional decisions are logged here in chronological order with date, context, decision, and rationale.

---

### [DEC-001] 2026-09-29 — Provisional Apache-2.0 License
- **Context:** PRD Open Question OQ-5 notes that the final open-source license (Apache-2.0 vs MIT) is pending a founder decision before Phase 2.
- **Decision:** Adopt `Apache-2.0` provisionally for repository bootstrapping and early development.
- **Why:** Apache-2.0 provides explicit patent grant protections while remaining permissive and open-source compliant. It can easily be relicensed or confirmed as MIT/Apache-2.0 dual license prior to public release.

### [DEC-002] 2026-09-29 — CLI Version Display During Phase 1
- **Context:** The raster mockup in `docs/CLIDesign.md` illustrates `v0.2` (reflecting the specification version). PRD OQ-6 addresses product semver.
- **Decision:** The CLI version starts at `0.0.0-dev` during Week 1–3, moves to `0.1.0-rc.1` at Phase 1 freeze (Week 4), and dynamically reads the version from package metadata rather than hardcoding `v0.2`.
- **Why:** Conforms to SemVer best practices and prevents misleading users into believing a production release is running.

### [DEC-003] 2026-09-29 — Defer npm Publication
- **Context:** Week 1 Task A1 / A4 originally mentioned claiming npm package placeholder `0.0.1`. The project owner will claim the npm name `flappycode` after Phase 1.
- **Decision:** Do not run `npm publish`, `npm login`, or publish any placeholder during Phase 1. Implement strict publish-blocking guards (`scripts/block-publish.mjs`) to prevent accidental publishing.
- **Why:** Honour owner instruction to claim the name post-Phase 1 while ensuring local package packing and install testing (`npm pack` smoke test) still function reliably.

### [DEC-004] 2026-09-29 — Use node:sqlite Built-in Instead of better-sqlite3
- **Context:** Task A6 specification required verifying that `better-sqlite3` prebuilt binaries install on Windows without a compiler. `better-sqlite3@11.10.0` has no prebuilt binaries for Node v24 on win32-x64, causing `node-gyp` failure without Visual Studio C++ tools.
- **Decision:** Use Node.js built-in `node:sqlite` (`DatabaseSync`) for `@flappycode/storage`.
- **Why:** `node:sqlite` is built into Node.js (Node >= 22.5), requiring zero native compilation, zero prebuild downloads, and zero external binary dependencies. It provides synchronous prepared statements, transactions, pragmas, and WAL support matching `better-sqlite3` ergonomics while guaranteeing flawless cross-platform installation on Windows, macOS, and Linux.
