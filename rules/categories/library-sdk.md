---
scope: "library-sdk"
---

# Library & SDK Development Rules

- [LIB-001] Strictly adhere to Semantic Versioning (SemVer 2.0.0): increment MAJOR for breaking API changes, MINOR for backwards-compatible features, and PATCH for bug fixes.
- [LIB-002] Guarantee zero side-effects upon module import; do not run network calls, open sockets, or modify global prototypes on require/import.
- [LIB-003] Export explicit TypeScript type declarations (`d.ts`) with high fidelity and compile under `strict: true`.
- [LIB-004] Configure package exports to support tree-shaking and dual ESM/CommonJS modules where appropriate without leaking internal file structures.
- [LIB-005] Keep external runtime dependencies to an absolute minimum to avoid dependency bloat and transitive vulnerability risks.
- [LIB-006] Never introduce breaking public API changes in a minor or patch release; provide a formal deprecation warning cycle spanning at least one minor release.
- [LIB-007] Define a typed, structured hierarchy of custom Error classes to enable callers to catch specific failure modes programmatically.
- [LIB-008] Provide JSDoc/TSDoc comments with concise descriptions, parameter documentation, and usage examples for all exported public functions and classes.
- [LIB-009] Never mutate input arguments or global state; prefer pure, predictable functional utilities unless object mutation is explicitly intended and documented.
- [LIB-010] Declare peer dependencies with explicit, non-overlapping semantic ranges to avoid package manager dependency resolution conflicts.
- [LIB-011] Ensure cross-runtime compatibility across standard target environments (Node.js LTS, modern browsers, Edge runtimes) without hidden host assumptions.
- [LIB-012] Validate all arguments at the public API entry points with informative error messages before invoking deep internal logic.
- [LIB-013] Provide automated contract tests and end-to-end integration tests verifying public API exports against real-world consumer patterns.
- [LIB-014] Ensure clean teardown mechanics (e.g. `client.close()`, `client.destroy()`) for any library resource holding active timers or socket handles.
- [LIB-015] Ship clean distribution bundles stripped of test suites, benchmark scripts, development configs, and internal documentation.
