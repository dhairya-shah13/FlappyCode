# Category Rules: Library

1. Semantic Versioning: Preserve strict public API backward compatibility within major versions.
2. Minimal Dependencies: Avoid introducing heavy runtime dependencies for trivial utilities.
3. Dual Module & Types: Provide type definitions (`.d.ts`) and support standard module resolution (ESM / CJS).
4. No Side Effects: Importing the library must not produce global side effects or mutate standard prototypes.
