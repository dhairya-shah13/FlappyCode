import { z } from 'zod';

/**
 * Stable error categories used across CLI, JSON events, and HTTP responses.
 * Each category maps deterministically to an exit code (CLI) or HTTP status (server).
 */
export const ErrorCategorySchema = z.enum([
  'usage',
  'provider',
  'auth',
  'pool_exhausted',
  'approval_required',
  'cancelled',
  'execution',
  'planner',
  'command',
  'internal',
]);
export type ErrorCategory = z.infer<typeof ErrorCategorySchema>;

/**
 * Machine-readable structured error with what/why/next fields.
 * Embedded in run.failed events, HTTP error responses, and CLI formatters.
 */
export const StructuredErrorSchema = z.object({
  /** Stable error code for programmatic consumption (e.g. 'EXECUTION_NO_CHANGES'). */
  code: z.string(),
  /** Error category for routing/classification. */
  category: ErrorCategorySchema,
  /** Human-readable description of what happened. */
  what: z.string(),
  /** Human-readable explanation of why it happened, when known. */
  why: z.string().optional(),
  /** Human-readable next action / remediation steps. */
  next: z.string(),
  /** Optional safe diagnostic details (never secrets or stack traces). */
  details: z.record(z.any()).optional(),
});
export type StructuredError = z.infer<typeof StructuredErrorSchema>;
