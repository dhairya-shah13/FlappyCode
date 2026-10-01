import { describe, expect, it } from 'vitest';
import {
  classifyProviderError,
  computeBackoffMs,
  parseRetryAfterMs,
  DEFAULT_RETRY_POLICY,
} from '@flappycode/core';

describe('Provider error classification (FR-RTE-003/008)', () => {
  it('classifies 429 / rate-limit / Retry-After messages as rate_limited', () => {
    expect(classifyProviderError(new Error('Mock 429: Rate limit exceeded. Retry-After: 2'))).toBe('rate_limited');
    expect(classifyProviderError(new Error('HTTP 429 Too Many Requests'))).toBe('rate_limited');
    expect(classifyProviderError({ status: 429, message: 'slow down' })).toBe('rate_limited');
  });

  it('classifies quota exhaustion distinctly from generic rate limits', () => {
    expect(classifyProviderError(new Error('Mock 429: Free quota exhausted for this account'))).toBe('quota');
    expect(classifyProviderError(new Error('quota exceeded for month'))).toBe('quota');
  });

  it('classifies 5xx and network failures as server (retryable)', () => {
    expect(classifyProviderError(new Error('Mock 500: Internal server error on provider backend'))).toBe('server');
    expect(classifyProviderError(new Error('HTTP 503 Service Unavailable'))).toBe('server');
    expect(classifyProviderError(new Error('fetch failed'))).toBe('server');
    expect(classifyProviderError(new Error('ECONNRESET'))).toBe('server');
    expect(classifyProviderError({ status: 502, message: 'bad gateway' })).toBe('server');
  });

  it('classifies timeouts', () => {
    expect(classifyProviderError(new Error('Mock request timed out after 10000ms'))).toBe('timeout');
    expect(classifyProviderError(new Error('connect ETIMEDOUT'))).toBe('timeout');
  });

  it('classifies disappeared models as model_unavailable (terminal, not retryable)', () => {
    expect(classifyProviderError(new Error("Mock 404: Model 'x' not found on provider"))).toBe('model_unavailable');
    expect(classifyProviderError(new Error('unknown model abc'))).toBe('model_unavailable');
    expect(classifyProviderError({ status: 404, message: 'nope' })).toBe('model_unavailable');
  });

  it('classifies auth failures distinctly', () => {
    expect(classifyProviderError(new Error('Invalid API key or unauthorized (401/403)'))).toBe('auth');
    expect(classifyProviderError({ status: 401, message: 'unauthorized' })).toBe('auth');
  });

  it('falls back to unknown for unrecognized errors', () => {
    expect(classifyProviderError(new Error('something exploded'))).toBe('unknown');
  });
});

describe('Retry-After parsing (FR-RTE-008)', () => {
  it('parses delta-seconds form', () => {
    expect(parseRetryAfterMs(new Error('429 slow down. Retry-After: 2'))).toBe(2000);
    expect(parseRetryAfterMs(new Error('Retry-After: 0.5'))).toBe(500);
  });

  it('parses HTTP-date form relative to now', () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfterMs(new Error(`Retry-After: ${future}`));
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThan(3000);
    expect(ms!).toBeLessThanOrEqual(5200);
  });

  it('returns null when absent', () => {
    expect(parseRetryAfterMs(new Error('no header here'))).toBeNull();
  });
});

describe('Backoff computation (FR-RTE-008)', () => {
  const policy = { ...DEFAULT_RETRY_POLICY, baseDelayMs: 100, maxDelayMs: 1000, maxRetryAfterMs: 3000, jitter: false };

  it('grows exponentially and caps at maxDelayMs', () => {
    expect(computeBackoffMs(policy, 0, null, () => 0.5)).toBe(100);
    expect(computeBackoffMs(policy, 1, null, () => 0.5)).toBe(200);
    expect(computeBackoffMs(policy, 2, null, () => 0.5)).toBe(400);
    expect(computeBackoffMs(policy, 10, null, () => 0.5)).toBe(1000); // capped
  });

  it('honors Retry-After but caps it at maxRetryAfterMs (no hangs)', () => {
    expect(computeBackoffMs(policy, 0, 2000, () => 0.5)).toBe(2000);
    expect(computeBackoffMs(policy, 0, 60_000, () => 0.5)).toBe(3000); // capped
  });

  it('applies jitter within 50%–150% of the exponential base', () => {
    const jittery = { ...policy, jitter: true };
    expect(computeBackoffMs(jittery, 2, null, () => 0)).toBe(200); // 50% of 400
    expect(computeBackoffMs(jittery, 2, null, () => 0.5)).toBe(400); // 100%
    expect(computeBackoffMs(jittery, 2, null, () => 1)).toBe(600); // 150%
  });
});
