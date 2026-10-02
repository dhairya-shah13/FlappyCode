# Category Rules: Backend

1. Input Validation: Validate all incoming payloads using strict schemas (e.g., Zod, Joi, or Pydantic) before executing business logic.
2. Error Handling: Never expose internal stack traces, DB credentials, or connection strings in HTTP error responses.
3. Database & Transactions: Use parameterized queries to prevent SQL injection. Wrap multi-table mutations in transactions.
4. Idempotency & Rate Limiting: Apply rate limiting to authentication and expensive endpoints.
5. Observability: Structured logging with correlation/request IDs. Redact all tokens and secrets in logs.
