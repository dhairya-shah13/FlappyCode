---
scope: "frontend"
---

# Frontend Engineering Rules

- [FE-001] Design for accessibility (WCAG 2.1 AA compliant) ensuring keyboard navigability, proper ARIA attributes, and semantic HTML elements.
- [FE-002] Provide explicit visual feedback for all interactive states: hover, focus-visible, active, loading, disabled, and error.
- [FE-003] Never expose private environment variables, secret tokens, or API credentials in client-side bundles.
- [FE-004] Maintain responsive layouts across all standard viewport breakpoints (mobile, tablet, desktop, ultra-wide) without horizontal overflow.
- [FE-005] Isolate component state locally; hoist state to global stores only when shared across distinct tree hierarchies.
- [FE-006] Implement boundary-level error catchers (Error Boundaries) around major UI subtrees to prevent application-wide white-screens.
- [FE-007] Optimize web performance metrics: minimize layout shifts (CLS), keep initial interaction fast (INP), and optimize hero asset loading (LCP).
- [FE-008] Use CSS modularity (CSS Modules, Scoped CSS, or design system tokens) to prevent leaky global selector collisions.
- [FE-009] Optimize and compress media assets; use modern responsive image formats (AVIF/WebP) with explicit width and height dimensions.
- [FE-010] Sanitize all dynamic HTML injections against cross-site scripting (XSS) attacks.
- [FE-011] Ensure all forms provide clear inline validation messages, preserve user inputs on validation errors, and prevent duplicate submissions.
- [FE-012] Honor the user's OS preference for reduced motion (`prefers-reduced-motion: reduce`) by disabling non-essential transitions.
- [FE-013] Support dark and light color schemes gracefully, avoiding hardcoded hex colors in favor of CSS custom properties / theme tokens.
- [FE-014] Ensure touch targets on mobile viewports meet minimum clickable sizing (at least 44x44 CSS pixels).
- [FE-015] Keep client-side bundle sizes lean by leveraging tree-shaking, dynamic imports, and lazy-loading for heavy downstream views.
