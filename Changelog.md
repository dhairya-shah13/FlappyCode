# FlappyCode — Changelog

All notable changes to this project are documented here with timestamps and task references.

---

### [Unreleased]

#### 2026-09-29T12:24:00+05:30 — Task P1-A5 (M0 Milestone)
- Implemented `@flappycode/protocol` with Zod schemas for Commands, Events, and Domain models.
- Added TaskGraph DAG validator with Kahn's algorithm cycle detection, duplicate ID detection, and dependency resolution checks.
- Implemented typed `EventBus` supporting subscriptions, typed handlers, one-time promises (`once`), and async iterator (`[Symbol.asyncIterator]`).
- Added 47 unit tests across domain, commands, events, graph, and bus modules.

#### 2026-09-29T12:20:00+05:30 — Task P1-A2
- Scaffolded pnpm monorepo with Turborepo, TypeScript strict composite base, ESLint, Prettier, and Vitest.
- Set up packages `@flappycode/protocol`, `@flappycode/storage`, `@flappycode/providers`, `@flappycode/core`, `@flappycode/tui`, and `flappycode` (`packages/cli`).
- Configured Node built-in `node:sqlite` per `[DEC-004]`.
- Verified `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass cleanly.

#### 2026-09-29T12:08:00+05:30 — Task P1-A1
- Initialised repository baseline with `.gitignore`, `.gitattributes` (LF line endings), and `.editorconfig`.
- Added provisional Apache-2.0 `LICENSE` file.
- Created `docs/DECISIONS.md` and `docs/BACKLOG.md`.
- Initialised `Context.md` and `Changelog.md`.
- Updated `README.md` to note "not yet published" status and dev quickstart.
