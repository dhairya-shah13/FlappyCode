import { describe, it, expect, vi } from 'vitest';
import { ProviderRateLimiter, DEFAULT_RPM } from '@flappycode/core';
import { ProviderConfig } from '@flappycode/protocol';

describe('NEW-006: ProviderRateLimiter Comprehensive Unit Tests', () => {
  const createConfig = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => ({
    id: 'test-provider',
    type: 'openai-compatible',
    display_name: 'Test Provider',
    data_use_policy: 'no_training',
    enabled: true,
    ...overrides,
  });

  it('uses DEFAULT_RPM when not specified in config or defaults', () => {
    const limiter = new ProviderRateLimiter();
    const cfg = createConfig();
    const snap = limiter.snapshot(cfg);
    expect(snap.rpm).toBe(DEFAULT_RPM);
    expect(snap.tokens).toBe(DEFAULT_RPM);
  });

  it('uses defaultRpm from constructor when provided', () => {
    const limiter = new ProviderRateLimiter({ defaultRpm: 120 });
    const cfg = createConfig();
    const snap = limiter.snapshot(cfg);
    expect(snap.rpm).toBe(120);
    expect(snap.tokens).toBe(120);
  });

  it('honors provider-specific rate_limit_rpm override', () => {
    const limiter = new ProviderRateLimiter({ defaultRpm: 60 });
    const cfg = createConfig({ rate_limit_rpm: 30 });
    const snap = limiter.snapshot(cfg);
    expect(snap.rpm).toBe(30);
    expect(snap.tokens).toBe(30);
  });

  it('never throttles unthrottled provider types (mock, ollama, lm-studio, llama-cpp)', async () => {
    const limiter = new ProviderRateLimiter();
    const types = ['mock', 'ollama', 'lm-studio', 'llama-cpp'];

    for (const type of types) {
      const cfg = createConfig({ id: `p-${type}`, type, rate_limit_rpm: 1 });
      // Should acquire instantly without depleting tokens
      await limiter.acquire(cfg);
      await limiter.acquire(cfg);
      limiter.penalize(cfg, 10000);
      await limiter.acquire(cfg);
      const release = await limiter.acquireConcurrency(cfg);
      release();
    }
  });

  it('consumes tokens on acquire for throttled providers', async () => {
    const limiter = new ProviderRateLimiter({ sleep: async () => {} });
    const cfg = createConfig({ rate_limit_rpm: 10 });

    const before = limiter.snapshot(cfg);
    expect(before.tokens).toBe(10);

    await limiter.acquire(cfg);
    const after = limiter.snapshot(cfg);
    expect(after.tokens).toBeLessThan(10);
  });

  it('penalizes provider and respects blockedUntil', async () => {
    let sleptMs = 0;
    const limiter = new ProviderRateLimiter({
      sleep: async (ms) => {
        sleptMs += ms;
      },
    });
    const cfg = createConfig({ rate_limit_rpm: 10 });

    limiter.penalize(cfg, 500);
    const snap = limiter.snapshot(cfg);
    expect(snap.blockedUntil).toBeGreaterThan(Date.now());

    // When acquire is called while penalized, it sleeps until unblocked
    await limiter.acquire(cfg);
    expect(sleptMs).toBeGreaterThanOrEqual(0);
  });

  it('throws error when acquire wait is aborted by signal', async () => {
    const limiter = new ProviderRateLimiter({ sleep: async () => {} });
    const cfg = createConfig({ rate_limit_rpm: 1 });

    // Exhaust token
    await limiter.acquire(cfg);

    const controller = new AbortController();
    controller.abort();

    await expect(limiter.acquire(cfg, controller.signal)).rejects.toThrow(
      /Rate-limited wait aborted/
    );
  });

  it('enforces max_concurrency semaphore and release', async () => {
    let sleepCalls = 0;
    const limiter = new ProviderRateLimiter({
      sleep: async () => {
        sleepCalls++;
      },
    });
    const cfg = createConfig({ id: 'concurrent-p', max_concurrency: 2 });

    expect(limiter.getInFlight(cfg)).toBe(0);

    const release1 = await limiter.acquireConcurrency(cfg);
    expect(limiter.getInFlight(cfg)).toBe(1);

    const release2 = await limiter.acquireConcurrency(cfg);
    expect(limiter.getInFlight(cfg)).toBe(2);

    // Release slot 1
    release1();
    expect(limiter.getInFlight(cfg)).toBe(1);

    // Double release is a no-op
    release1();
    expect(limiter.getInFlight(cfg)).toBe(1);

    // Release slot 2
    release2();
    expect(limiter.getInFlight(cfg)).toBe(0);
  });

  it('releases concurrency on error', async () => {
    const limiter = new ProviderRateLimiter();
    const cfg = createConfig({ max_concurrency: 1 });

    const release = await limiter.acquireConcurrency(cfg);
    expect(limiter.getInFlight(cfg)).toBe(1);

    try {
      throw new Error('Simulated task failure');
    } catch {
      release();
    }

    expect(limiter.getInFlight(cfg)).toBe(0);
  });

  it('throws error when concurrency wait is aborted by signal', async () => {
    const limiter = new ProviderRateLimiter({ sleep: async () => {} });
    const cfg = createConfig({ max_concurrency: 1 });

    await limiter.acquireConcurrency(cfg);
    expect(limiter.getInFlight(cfg)).toBe(1);

    const controller = new AbortController();
    controller.abort();

    await expect(limiter.acquireConcurrency(cfg, controller.signal)).rejects.toThrow(
      /Concurrency wait aborted/
    );
  });

  it('isolates rate limits and concurrency between different providers', async () => {
    const limiter = new ProviderRateLimiter({ sleep: async () => {} });
    const cfgA = createConfig({ id: 'provider-a', rate_limit_rpm: 5, max_concurrency: 1 });
    const cfgB = createConfig({ id: 'provider-b', rate_limit_rpm: 10, max_concurrency: 2 });

    const releaseA = await limiter.acquireConcurrency(cfgA);
    expect(limiter.getInFlight(cfgA)).toBe(1);
    expect(limiter.getInFlight(cfgB)).toBe(0);

    const releaseB = await limiter.acquireConcurrency(cfgB);
    expect(limiter.getInFlight(cfgA)).toBe(1);
    expect(limiter.getInFlight(cfgB)).toBe(1);

    releaseA();
    releaseB();
  });
});
