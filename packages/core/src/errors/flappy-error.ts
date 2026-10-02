import type { ErrorCategory, StructuredError } from '@flappycode/protocol';

/**
 * Central error class for all FlappyCode user-facing errors.
 *
 * Every FlappyError carries structured what/why/next fields so that
 * CLI, JSON event, and HTTP formatters can render consistent output
 * without parsing raw message strings.
 */
export interface FlappyErrorOptions {
  code: string;
  category: ErrorCategory;
  what: string;
  why?: string;
  next: string;
  details?: Record<string, any>;
  cause?: Error;
}

export class FlappyError extends Error {
  public readonly code: string;
  public readonly category: ErrorCategory;
  public readonly what: string;
  public readonly why?: string;
  public readonly next: string;
  public readonly details?: Record<string, any>;

  constructor(opts: FlappyErrorOptions) {
    super(opts.what);
    this.name = 'FlappyError';
    this.code = opts.code;
    this.category = opts.category;
    this.what = opts.what;
    this.why = opts.why;
    this.next = opts.next;
    this.details = opts.details;
    if (opts.cause) this.cause = opts.cause;
  }

  /** Serialize into the protocol StructuredError shape. */
  public toStructured(): StructuredError {
    return {
      code: this.code,
      category: this.category,
      what: this.what,
      why: this.why,
      next: this.next,
      details: this.details,
    };
  }
}

// ---------------------------------------------------------------------------
// Error catalogue — stable codes used across Stage E
// ---------------------------------------------------------------------------

export const ErrorCodes = {
  // GAP-024 — exit-code related
  USAGE_MISSING_PROMPT: 'USAGE_MISSING_PROMPT',
  USAGE_UNKNOWN_COMMAND: 'USAGE_UNKNOWN_COMMAND',
  USAGE_INVALID_OPTION: 'USAGE_INVALID_OPTION',
  // GAP-051 — run lifecycle
  NO_PROVIDERS: 'NO_PROVIDERS',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  POOL_EXHAUSTED: 'POOL_EXHAUSTED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  EXECUTION_NO_CHANGES: 'EXECUTION_NO_CHANGES',
  PLANNER_FAILED: 'PLANNER_FAILED',
  FEEDBACK_ESCALATED: 'FEEDBACK_ESCALATED',
  DIFF_REJECTED: 'DIFF_REJECTED',
  CANCELLED: 'CANCELLED',
  // GAP-052 — server commands
  COMMAND_UNSUPPORTED: 'COMMAND_UNSUPPORTED',
  COMMAND_INVALID: 'COMMAND_INVALID',
  RUN_NOT_FOUND: 'RUN_NOT_FOUND',
  INVALID_STATE: 'INVALID_STATE',
  // Catch-all
  INTERNAL: 'INTERNAL',
} as const;

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * Produce a human-readable CLI error string with What / Why / Next labels.
 * Raw Error instances receive a safe fallback format.
 */
export function formatErrorForCli(err: Error | FlappyError): string {
  if (err instanceof FlappyError) {
    const lines: string[] = [];
    lines.push(`✖ Error [${err.code}]: ${err.what}`);
    if (err.why) lines.push(`  Why:  ${err.why}`);
    lines.push(`  Next: ${err.next}`);
    return lines.join('\n');
  }
  // Safe fallback for generic errors — never expose raw stack trace
  return `✖ Error: ${err.message}`;
}

/**
 * Produce a StructuredError object for embedding in run.failed events
 * or JSON API responses. Generic Error instances get a safe internal wrapper.
 */
export function formatErrorForJson(err: Error | FlappyError): StructuredError {
  if (err instanceof FlappyError) {
    return err.toStructured();
  }
  const msg = err.message || 'An unexpected error occurred.';
  const lower = msg.toLowerCase();

  if (err.name === 'ZodError' || lower.includes('validation') || lower.includes('invalid') || lower.includes('required')) {
    return {
      code: ErrorCodes.COMMAND_INVALID,
      category: 'command',
      what: msg,
      next: 'Ensure the request payload matches the expected schema.',
    };
  }

  if (lower.includes('pool-exhausted') || lower.includes('pool is exhausted') || lower.includes('exhausted')) {
    return {
      code: ErrorCodes.POOL_EXHAUSTED,
      category: 'pool_exhausted',
      what: msg,
      next: 'Connect an additional free provider or authorize paid models.',
    };
  }

  if (lower.includes('unknown model') || lower.includes('not supported') || lower.includes('ambiguous') || lower.includes('not found')) {
    return {
      code: ErrorCodes.COMMAND_INVALID,
      category: 'command',
      what: msg,
      next: 'Verify model identifiers and command arguments.',
    };
  }

  if (lower.includes('unauthorized') || lower.includes('token')) {
    return {
      code: 'AUTH_REQUIRED',
      category: 'auth',
      what: msg,
      next: 'Provide a valid Authorization Bearer token header.',
    };
  }

  return {
    code: ErrorCodes.INTERNAL,
    category: 'internal',
    what: msg,
    next: 'Check the debug log with --debug for diagnostic details.',
  };
}

/**
 * Map an error to an HTTP status code and structured JSON response body.
 */
export function formatErrorForHttp(err: Error | FlappyError): {
  status: number;
  body: { success: false; error: string; error_details?: StructuredError };
} {
  const structured = formatErrorForJson(err);

  const statusMap: Record<string, number> = {
    usage: 400,
    command: 400,
    auth: 401,
    approval_required: 409,
    pool_exhausted: 409,
    cancelled: 409,
    execution: 500,
    planner: 500,
    provider: 502,
    internal: 500,
  };

  const status = statusMap[structured.category] ?? 500;
  return {
    status,
    body: {
      success: false,
      error: structured.what,
      error_details: structured,
    },
  };
}
