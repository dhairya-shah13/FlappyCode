# Category Rules: Monorepo

1. Package Boundaries: Internal cross-package imports must use published or workspace-linked package specifiers, not relative path escapes (`../../`).
2. Dependency Alignment: Keep shared tooling and common devDependencies aligned across workspace packages.
3. Isolated Scopes: Package tests and lint tasks must be executable both independently and from the root coordinator.
