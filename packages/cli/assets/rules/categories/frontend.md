# Category Rules: Frontend

1. Accessibility & Semantics: Use standard HTML5 landmark elements (`<main>`, `<nav>`, `<header>`, `<article>`). Ensure keyboard navigation and ARIA attributes where appropriate.
2. State Management: Keep component state local where possible; avoid unnecessary global store pollution.
3. Performance: Lazy-load non-critical routes and large components. Minimize layout shifts (CLS).
4. Responsive Design: Mobile-first responsive layouts with CSS grid/flexbox. Do not use hardcoded pixel widths for fluid layouts.
5. Security: Sanitize all untrusted input; never inject raw HTML without explicit escaping to avoid XSS vulnerabilities.
