---
scope: "documentation"
---

# Technical Documentation Rules

- [DOC-001] Keep documentation synchronized with the current code; update relevant docs within the same pull request or commit as code modifications.
- [DOC-002] Provide copy-pasteable, verified command snippets for installation, development setup, testing, and production builds.
- [DOC-003] Maintain an up-to-date `README.md` at the repository root outlining project purpose, quickstart guide, architecture overview, and contributing guidelines.
- [DOC-004] Maintain a chronological, human-readable `Changelog.md` adhering to Keep a Changelog standards with SemVer version sections.
- [DOC-005] Document significant design trade-offs, architecture choices, and accepted constraints as Architectural Decision Records (ADRs).
- [DOC-006] Structure documentation with clear heading hierarchy (single H1, followed by logical H2 and H3 subsections) and logical navigation tables.
- [DOC-007] Use Mermaid diagrams to visualize non-trivial workflows, state machines, component relationships, and data flows.
- [DOC-008] Document all environment variables, configuration flags, default values, and sensitive credential requirements in a dedicated configuration reference.
- [DOC-009] Write in active voice, concise technical language, and provide concrete examples for complex configuration options or APIs.
- [DOC-010] Include a dedicated troubleshooting and FAQ section covering common setup stumbling blocks, platform-specific issues, and known edge cases.
- [DOC-011] Validate that all internal markdown links and external URLs are active and resolve correctly without broken redirects.
- [DOC-012] Provide explicit deprecation warnings and migration guides for breaking changes ahead of major version releases.
- [DOC-013] Ensure code examples embedded in documentation are syntax-highlighted with accurate language identifiers.
- [DOC-014] Ensure API reference documentation documents every parameter, return type, thrown error, and authorization requirement.
- [DOC-015] Keep documentation accessible: use descriptive link text (avoid 'click here'), alt text for diagrams, and high-contrast visuals.
