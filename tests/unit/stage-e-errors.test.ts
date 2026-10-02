import { describe, expect, it } from 'vitest';
import {
  FlappyError,
  ErrorCodes,
  formatErrorForCli,
  formatErrorForJson,
  formatErrorForHttp,
} from '@flappycode/core';
import { StructuredErrorSchema } from '@flappycode/protocol';

describe('Stage E: Central Errors & Formatters (GAP-058)', () => {
  it('instantiates FlappyError with structured fields and serializes to StructuredError', () => {
    const err = new FlappyError({
      code: ErrorCodes.APPROVAL_REQUIRED,
      category: 'approval_required',
      what: 'Plan execution requires explicit approval.',
      why: 'No approval flag was passed in headless mode.',
      next: 'Pass --approve-plan or approve the plan in the TUI.',
      details: { runId: 'run-99' },
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('FlappyError');
    expect(err.code).toBe(ErrorCodes.APPROVAL_REQUIRED);
    expect(err.category).toBe('approval_required');
    expect(err.what).toBe('Plan execution requires explicit approval.');
    expect(err.why).toBe('No approval flag was passed in headless mode.');
    expect(err.next).toBe('Pass --approve-plan or approve the plan in the TUI.');
    expect(err.details).toEqual({ runId: 'run-99' });

    const structured = err.toStructured();
    expect(StructuredErrorSchema.safeParse(structured).success).toBe(true);
  });

  it('formats error for CLI with What / Why / Next structure', () => {
    const err = new FlappyError({
      code: ErrorCodes.EXECUTION_NO_CHANGES,
      category: 'execution',
      what: 'The coder agent completed without staging changes.',
      why: 'The model produced an empty diff for the given prompt.',
      next: 'Refine your prompt to clearly describe the files to create or modify.',
    });

    const cliText = formatErrorForCli(err);
    expect(cliText).toContain('✖ Error [EXECUTION_NO_CHANGES]: The coder agent completed without staging changes.');
    expect(cliText).toContain('  Why:  The model produced an empty diff for the given prompt.');
    expect(cliText).toContain('  Next: Refine your prompt to clearly describe the files to create or modify.');

    // Fallback for standard Error
    const fallbackText = formatErrorForCli(new Error('A generic system fault'));
    expect(fallbackText).toBe('✖ Error: A generic system fault');
  });

  it('formats error for JSON mode ensuring validity against StructuredErrorSchema', () => {
    const err = new FlappyError({
      code: ErrorCodes.POOL_EXHAUSTED,
      category: 'pool_exhausted',
      what: 'Free model pool is exhausted.',
      next: 'Connect an additional free provider or authorize paid models.',
    });

    const jsonError = formatErrorForJson(err);
    expect(StructuredErrorSchema.safeParse(jsonError).success).toBe(true);
    expect(jsonError.code).toBe(ErrorCodes.POOL_EXHAUSTED);
    expect(jsonError.category).toBe('pool_exhausted');

    // Standard Error fallback
    const stdErr = new Error('Unknown model foo/bar');
    const stdJson = formatErrorForJson(stdErr);
    expect(StructuredErrorSchema.safeParse(stdJson).success).toBe(true);
    expect(stdJson.category).toBe('command');
  });

  it('formats error for HTTP responses mapping categories to correct status codes', () => {
    const err400 = new FlappyError({
      code: ErrorCodes.USAGE_MISSING_PROMPT,
      category: 'usage',
      what: 'Missing prompt',
      next: 'Provide prompt',
    });
    const res400 = formatErrorForHttp(err400);
    expect(res400.status).toBe(400);
    expect(res400.body.success).toBe(false);
    expect(res400.body.error).toBe('Missing prompt');
    expect(res400.body.error_details?.code).toBe(ErrorCodes.USAGE_MISSING_PROMPT);

    const err401 = new FlappyError({
      code: 'AUTH_REQUIRED',
      category: 'auth',
      what: 'Unauthorized',
      next: 'Provide bearer token',
    });
    expect(formatErrorForHttp(err401).status).toBe(401);

    const err409 = new FlappyError({
      code: ErrorCodes.POOL_EXHAUSTED,
      category: 'pool_exhausted',
      what: 'Pool exhausted',
      next: 'Add provider',
    });
    expect(formatErrorForHttp(err409).status).toBe(409);

    const err502 = new FlappyError({
      code: ErrorCodes.NO_PROVIDERS,
      category: 'provider',
      what: 'Provider unreachable',
      next: 'Retry later',
    });
    expect(formatErrorForHttp(err502).status).toBe(502);

    const err500 = new FlappyError({
      code: ErrorCodes.INTERNAL,
      category: 'internal',
      what: 'Internal failure',
      next: 'Check logs',
    });
    expect(formatErrorForHttp(err500).status).toBe(500);
  });
});
