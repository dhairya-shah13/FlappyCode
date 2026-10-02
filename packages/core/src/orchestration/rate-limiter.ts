import { ProviderConfig } from '@flappycode/protocol';

interface Bucket {
  tokens: number;
  lastRefill: number;
  rpm: number;
  /** Timestamp until which all requests are blocked (honor Retry-After). */
  blockedUntil: number;
}

export const DEFAULT_RPM = 60;

/**
 * Per-provider outbound rate limiting (FR-PRV-008): a token bucket throttling
 * requests-per-minute at the actual call path, plus a penalty hook used when a
 * provider answers 429 with Retry-After. Local providers and the mock provider
 * are intentionally unthrottled so tests and local inference are not delayed.
 */
export class ProviderRateLimiter {
  private buckets = new Map<string, Bucket>();
  /** Provider types that never need outbound throttling. */
  private static UNTHROTTLED_TYPES = new Set(['mock', 'ollama', 'lm-studio', 'llama-cpp']);

  constructor(
    private readonly defaults: { defaultRpm?: number; sleep?: (ms: number) => Promise<void> } = {}
  ) {}

  private sleep(ms: number): Promise<void> {
    return (this.defaults.sleep ?? ((m: number) => new Promise((r) => setTimeout(r, m))))(ms);
  }

  private isUnthrottled(cfg: ProviderConfig): boolean {
    return ProviderRateLimiter.UNTHROTTLED_TYPES.has(cfg.type);
  }

  private rpmFor(cfg: ProviderConfig): number {
    return cfg.rate_limit_rpm ?? this.defaults.defaultRpm ?? DEFAULT_RPM;
  }

  private bucketFor(cfg: ProviderConfig): Bucket {
    const key = cfg.id;
    let b = this.buckets.get(key);
    const rpm = this.rpmFor(cfg);
    if (!b || b.rpm !== rpm) {
      b = { tokens: rpm, lastRefill: Date.now(), rpm, blockedUntil: 0 };
      this.buckets.set(key, b);
    }
    return b;
  }

  private refill(b: Bucket): void {
    const now = Date.now();
    const elapsed = now - b.lastRefill;
    if (elapsed <= 0) return;
    const tokensToAdd = (elapsed / 60000) * b.rpm;
    b.tokens = Math.min(b.rpm, b.tokens + tokensToAdd);
    b.lastRefill = now;
  }

  /** Wait until a request slot is available for this provider. */
  public async acquire(cfg: ProviderConfig, signal?: AbortSignal): Promise<void> {
    if (this.isUnthrottled(cfg)) return;
    const b = this.bucketFor(cfg);

    // Loop: honor Retry-After block windows and token availability.
    for (;;) {
      if (signal?.aborted) {
        throw new Error('Rate-limited wait aborted by cancellation');
      }
      this.refill(b);
      const now = Date.now();
      if (b.blockedUntil > now) {
        await this.sleep(Math.min(b.blockedUntil - now, 1000));
        continue;
      }
      if (b.tokens >= 1) {
        b.tokens -= 1;
        return;
      }
      // Not enough tokens: time until next token.
      const msForToken = ((1 - b.tokens) / b.rpm) * 60000;
      await this.sleep(Math.max(10, Math.min(msForToken, 1000)));
    }
  }

  /** Apply a penalty window (e.g. Retry-After) for a provider. */
  public penalize(cfg: ProviderConfig, ms: number): void {
    if (this.isUnthrottled(cfg)) return;
    const b = this.bucketFor(cfg);
    b.blockedUntil = Math.max(b.blockedUntil, Date.now() + ms);
  }

  private inFlight = new Map<string, number>();

  /**
   * Acquire a concurrency semaphore slot for this provider.
   * Returns a release callback function that MUST be called upon request completion.
   */
  public async acquireConcurrency(cfg: ProviderConfig, signal?: AbortSignal): Promise<() => void> {
    if (this.isUnthrottled(cfg)) return () => {};
    const max = cfg.max_concurrency;
    if (!max || max <= 0) return () => {};

    while ((this.inFlight.get(cfg.id) ?? 0) >= max) {
      if (signal?.aborted) {
        throw new Error('Concurrency wait aborted by cancellation');
      }
      await this.sleep(20);
    }

    this.inFlight.set(cfg.id, (this.inFlight.get(cfg.id) ?? 0) + 1);

    let released = false;
    return () => {
      if (!released) {
        released = true;
        const current = this.inFlight.get(cfg.id) ?? 1;
        this.inFlight.set(cfg.id, Math.max(0, current - 1));
      }
    };
  }

  public getInFlight(cfg: ProviderConfig): number {
    return this.inFlight.get(cfg.id) ?? 0;
  }

  /** Test/inspection helper. */
  public snapshot(cfg: ProviderConfig): { tokens: number; blockedUntil: number; rpm: number; inFlight: number } {
    const b = this.bucketFor(cfg);
    this.refill(b);
    return {
      tokens: b.tokens,
      blockedUntil: b.blockedUntil,
      rpm: b.rpm,
      inFlight: this.getInFlight(cfg),
    };
  }
}

