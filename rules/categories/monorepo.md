---
scope: "monorepo"
---

# Monorepo Architecture Rules

- [MONO-001] Maintain strict package boundary isolation: internal package code must only access external packages via public package exports.
- [MONO-002] Prohibit circular dependencies between packages in the monorepo; model the dependency graph as a Directed Acyclic Graph (DAG).
- [MONO-003] Reference internal packages using package manager workspace protocols (`workspace:*` or `workspace:^`) rather than relative file paths.
- [MONO-004] Centralize base configuration files (`tsconfig.base.json`, `.prettierrc`, ESLint config) at the repository root and extend them in subpackages.
- [MONO-005] Hoist shared build tools, linters, and test runners to root `devDependencies` to eliminate duplicate tool installations.
- [MONO-006] Configure task pipeline orchestrators (e.g. Turborepo, Nx) with precise cache inputs and outputs to enable reliable incremental builds.
- [MONO-007] Ensure every package can be independently built, typechecked, and tested via standardized npm script targets (`build`, `test`, `lint`, `typecheck`).
- [MONO-008] Maintain a single, consistent package manager lockfile at the workspace root; never commit nested lockfiles in subpackage directories.
- [MONO-009] Scope internal package names consistently using a unified npm organization prefix (e.g. `@flappycode/*`).
- [MONO-010] Ensure changes spanning multiple packages maintain atomic commits and passing CI checks at every commit.
- [MONO-011] Keep package-level `package.json` manifests clean and explicit, declaring all direct runtime and peer dependencies accurately.
- [MONO-012] Isolate package build artifacts to local `dist/` or `build/` directories and ensure they are excluded from version control via `.gitignore`.
- [MONO-013] Run CI change-detection filters to only build and test packages affected by a changeset, while guaranteeing full suite runs on main branch merges.
- [MONO-014] Prevent accidental npm publishing of private workspace packages by setting `"private": true` unless explicitly intended for public release.
- [MONO-015] Document package ownership, purpose, and relationship to the wider workspace architecture in each package's local `README.md`.
