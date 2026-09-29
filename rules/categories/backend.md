---
scope: "backend"
---

# Backend Engineering Rules

- [BE-001] Validate and sanitize all incoming network request payloads using strict runtime schemas before passing data to business logic.
- [BE-002] Enforce least-privilege role-based authentication and authorization on all private endpoints and internal RPC interfaces.
- [BE-003] Never output internal database traces, raw stack frames, or unredacted system environment variables in API error responses.
- [BE-004] Design mutations (POST, PUT, DELETE) to be idempotent or guarded by unique idempotency keys where duplicate requests cause side-effects.
- [BE-005] Emit structured JSON logs with correlation IDs (request_id, trace_id) for every inbound transaction and outbound integration.
- [BE-006] Implement rate limiting and load shedding on public endpoints to protect services against denial-of-service degradation.
- [BE-007] Set explicit timeouts and connection pool limits on all external HTTP, database, and cache socket connections.
- [BE-008] Use database transactions with appropriate isolation levels for operations modifying multiple relational entities.
- [BE-009] Ensure all database queries utilize proper indexes for WHERE clauses, foreign key joins, and ORDER BY sort paths.
- [BE-010] Handle OS process termination signals (SIGINT, SIGTERM) with graceful shutdown: drain open requests and close connections cleanly.
- [BE-011] Store passwords and sensitive user tokens using salted, slow cryptographic hashes (Argon2id or bcrypt).
- [BE-012] Provide dedicated health check endpoints (`/healthz/live` and `/healthz/ready`) reflecting true container and dependency status.
- [BE-013] Secure all public HTTP transport with mandatory HTTPS, HSTS, and standard defensive security headers (CSP, CORS, X-Content-Type).
- [BE-014] Ensure asynchronous background jobs are durable, retryable with exponential backoff, and equipped with dead-letter queue routing.
- [BE-015] Separate database schema migrations from application code execution to allow zero-downtime rollbacks and canary deployments.
