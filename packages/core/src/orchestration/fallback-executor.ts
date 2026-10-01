import { Model, ProviderConfig, TaskRequirements } from '@flappycode/protocol';
import { ProviderConnector } from '@flappycode/providers';
import { ModelRegistry } from '../registry/model-registry.js';
import { DeterministicRouter } from '../router/router.js';
import { FlappyEventBus } from '../events/event-bus.js';
import { ProviderRepository, SecretStore } from '@flappycode/storage';
import { ProviderRateLimiter } from './rate-limiter.js';

/**
 * Error classification for provider/model failures (FR-RTE-003 / FR-RTE-008).
 * - rate_limited: HTTP 429 / "Retry-After" -> retry same candidate honoring Retry-After
 * - server: HTTP 5xx / network transport failures -> retry with exponential backoff
 * - timeout: request timed out -> retry with exponential backoff
 * - quota: free quota exhausted -> do NOT retry; exclude candidate (long cooldown)
 * - model_unavailable: model disappeared / 404 -> do NOT retry; exclude candidate
 * - auth: 401/403 -> do NOT retry; exclude candidate
 * - busy: provider concurrency cap -> do NOT retry; exclude candidate immediately
 * - unknown: anything else -> exclude candidate (treated as terminal for this candidate)
 */
export type ProviderErrorKind =
  | 'rate_limited'
  | 'server'
  | 'timeout'
  | 'quota'
  | 'model_unavailable'
  | 'auth'
  | 'busy'
  | 'unknown';

const RETRYABLE_KINDS: ReadonlySet<ProviderErrorKind> = new Set(['rate_limited', 'server', 'timeout']);

export function classifyProviderError(err: unknown): ProviderErrorKind {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  const anyErr = err as any;
  const status: number | undefined =
    typeof anyErr?.status === 'number'
      ? anyErr.status
      : typeof anyErr?.statusCode === 'number'
        ? anyErr.statusCode
        : undefined;

  // Quota exhaustion is terminal (exclude candidate), even when the provider
  // reports it with a 429 status — check before the generic 429 branch.
  if (lower.includes('quota') && (lower.includes('exhaust') || lower.includes('exceeded') || lower.includes('insufficient'))) {
    return 'quota';
  }
  if (
    status === 429 ||
    /\b429\b/.test(msg) ||
    lower.includes('rate limit') ||
    lower.includes('ratelimit') ||
    lower.includes('retry-after')
  ) {
    return 'rate_limited';
  }
  if (
    status === 404 ||
    /\b404\b/.test(msg) ||
    lower.includes('model not found') ||
    lower.includes("model '") && lower.includes('not found') ||
    lower.includes('unknown model') ||
    lower.includes('does not exist') ||
    lower.includes('no such model')
  ) {
    return 'model_unavailable';
  }
  if (status === 401 || status === 403 || /\b40[13]\b/.test(msg) || lower.includes('unauthorized') || lower.includes('invalid api key') || lower.includes('invalid x-api-key')) {
    return 'auth';
  }
  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    lower.includes('etimedout') ||
    lower.includes('aborted')
  ) {
    return 'timeout';
  }
  if (
    status !== undefined && status >= 500 ||
    /\b5\d\d\b/.test(msg) ||
    lower.includes('internal server error') ||
    lower.includes('econnreset') ||
    lower.includes('econnrefused') ||
    lower.includes('fetch failed') ||
    lower.includes('network') ||
    lower.includes('enotfound') ||
    lower.includes('socket hang up')
  ) {
    return 'server';
  }
  if (lower.includes('busy') || lower.includes('concurrency')) {
    return 'busy';
  }
  return 'unknown';
}

export function parseRetryAfterMs(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const secondsMatch = msg.match(/retry-after\s*:\s*(\d+(?:\.\d+)?)/i);
  if (secondsMatch) {
    return Math.round(parseFloat(secondsMatch[1]) * 1000);
  }
  const dateMatch = msg.match(/retry-after\s*:\s*(.+)$/i);
  if (dateMatch) {
    const when = Date.parse(dateMatch[1].trim());
    if (!Number.isNaN(when)) {
      return Math.max(0, when - Date.now());
    }
  }
  return null;
}

export interface RetryPolicy {
  /** Extra attempts for the SAME candidate before abandoning it (SRS §7: 5xx -> retry x2). */
  maxRetriesPerModel: number;
  /** Base backoff delay in ms (doubles each retry). */
  baseDelayMs: number;
  /** Hard cap for computed exponential backoff. */
  maxDelayMs: number;
  /** Hard cap for honored Retry-After values so a hostile/stale header cannot hang a run. */
  maxRetryAfterMs: number;
  /** Multiplicative jitter (0.5–1.5x) applied to backoff delays. */
  jitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetriesPerModel: 2,
  baseDelayMs: 150,
  maxDelayMs: 4000,
  maxRetryAfterMs: 8000,
  jitter: true,
};

/** Cooldown (seconds) applied to a candidate after a terminal failure, by error kind. */
const FAILURE_COOLDOWN_SECONDS: Record<ProviderErrorKind, number> = {
  rate_limited: 30,
  server: 15,
  timeout: 15,
  quota: 300,
  model_unavailable: 600,
  auth: 300,
  busy: 1,
  unknown: 60,
};

export interface FallbackAttemptContext {
  model: Model;
  providerCfg: ProviderConfig;
  connector: ProviderConnector;
  apiKey?: string;
}

export interface FallbackExecuteOptions {
  runId: string;
  nodeId?: string;
  agent: string;
  requirements: TaskRequirements;
  /** Pinned model for this agent (from binding), if any. */
  pinnedModelId?: string;
  /** Pinned-model fallback policy (FR-RTE-004). Defaults to ask_user. */
  pinnedFallbackPolicy?: 'ask_user' | 'next_best_fit' | 'abort';
  /** Coder model id (for Reviewer same-model penalty). */
  coderModelId?: string;
  signal?: AbortSignal;
  /** Invoked on every real substitution; used to persist into the task node. */
  onSubstitution?: (from: string, to: string, reason: string) => void;
  /** Invoked once per model actually used by this execution (counting/telemetry). */
  onModelUsed?: (model: Model, isPinned: boolean) => void;
  /**
   * Pre-flight check run once per candidate before the first attempt (e.g.
   * lazy tool-calling capability probe, FR-MOD-007). Returning false excludes
   * this candidate without consuming a completion attempt.
   */
  preFlight?: (ctx: FallbackAttemptContext) => Promise<boolean>;
}

export class PoolExhaustedError extends Error {
  public readonly code = 'POOL_EXHAUSTED';
  constructor(
    message: string,
    public readonly requirements: TaskRequirements
  ) {
    super(message);
    this.name = 'PoolExhaustedError';
  }
}

export class ModelFallbackAbortError extends Error {
  public readonly code = 'PINNED_MODEL_ABORT';
  constructor(message: string) {
    super(message);
    this.name = 'ModelFallbackAbortError';
  }
}

export class RunCancelledError extends Error {
  public readonly code = 'RUN_CANCELLED';
  constructor(message = 'Run was cancelled.') {
    super(message);
    this.name = 'RunCancelledError';
  }
}

export interface FallbackExecutorOptions {
  router: DeterministicRouter;
  registry: ModelRegistry;
  eventBus: FlappyEventBus;
  providerRepo: ProviderRepository;
  secretStore: SecretStore;
  retryPolicy?: Partial<RetryPolicy>;
  rateLimiter?: ProviderRateLimiter;
  /** Injectable sleep for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable RNG for deterministic jitter tests. */
  random?: () => number;
  /**
   * Ask the user what to do when a pinned model is unavailable under the
   * `ask_user` fallbackPolicy (FR-RTE-004). Returns the chosen option.
   */
  askUser?: (question: {
    runId: string;
    nodeId?: string;
    agent: string;
    pinnedModelId: string;
    message: string;
  }) => Promise<'next_best_fit' | 'cancel'>;
}

/** Compute the backoff delay (ms) for retry `attempt` (0-based). Exported for tests. */
export function computeBackoffMs(
  policy: RetryPolicy,
  attempt: number,
  retryAfterMs: number | null,
  random: () => number
): number {
  if (retryAfterMs !== null) {
    const capped = Math.min(Math.max(0, retryAfterMs), policy.maxRetryAfterMs);
    return capped;
  }
  const exp = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);
  if (!policy.jitter) return exp;
  // Full-ish jitter: 50%–150% of the exponential base.
  return Math.round(exp * (0.5 + random()));
}

export class FallbackExecutor {
  private readonly policy: RetryPolicy;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly opts: FallbackExecutorOptions) {
    this.policy = { ...DEFAULT_RETRY_POLICY, ...(opts.retryPolicy ?? {}) };
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.random = opts.random ?? Math.random;
  }

  /**
   * Execute `attemptFn` against the best eligible model, retrying transient
   * failures with exponential backoff + jitter (honoring Retry-After), then
   * substituting the next best free/rate-limited-free candidate until the pool
   * is genuinely exhausted. Paid models are never selected without a grant
   * (enforced inside the router).
   */
  public async execute<T>(
    options: FallbackExecuteOptions,
    attemptFn: (ctx: FallbackAttemptContext & { attempt: number }) => Promise<T>
  ): Promise<T> {
    const excluded: string[] = [];
    const usedIds = new Set<string>();
    let originalModelId: string | undefined;
    let lastClassification: ProviderErrorKind = 'unknown';
    let lastErrorMessage = '';
    // After an explicit ask_user decision we stop passing the pinned id so the
    // router does not re-prompt on every subsequent candidate selection.
    let pinnedModelId = options.pinnedModelId;

    // Safety bound: never spin forever even if candidates keep failing.
    const hardIterationCap = 64;
    for (let iteration = 0; iteration < hardIterationCap; iteration++) {
      this.throwIfAborted(options.signal);

      const route = this.opts.router.select(
        {
          ...options.requirements,
          excludeModelIds: [...(options.requirements.excludeModelIds ?? []), ...excluded],
        },
        options.coderModelId,
        pinnedModelId,
        options.pinnedFallbackPolicy ?? 'ask_user'
      );

      if ('needsUserDecision' in route) {
        if (route.policy === 'abort') {
          throw new ModelFallbackAbortError(route.message);
        }
        // FR-RTE-004: pinned model unavailable + ask_user policy -> explicit decision.
        // The question is always announced on the bus (schema-compliant), even when
        // no interactive handler is installed (then the answer defaults to cancel).
        this.opts.eventBus.emit({
          type: 'question.asked',
          question_id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          run_id: options.runId,
          agent: options.agent,
          question: route.message,
          options: ['next_best_fit', 'cancel'],
          timestamp: Date.now(),
        });
        const answer = this.opts.askUser
          ? await this.opts.askUser({
              runId: options.runId,
              nodeId: options.nodeId,
              agent: options.agent,
              pinnedModelId: route.pinnedModelId,
              message: route.message,
            })
          : 'cancel';
        if (answer === 'cancel') {
          throw new ModelFallbackAbortError(
            `Pinned model '${route.pinnedModelId}' is unavailable for agent ${options.agent} and the fallback policy is ask_user. The user declined to continue with another model.`
          );
        }
        // Explicit consent obtained: continue with next_best_fit semantics.
        excluded.push(route.pinnedModelId);
        pinnedModelId = undefined;
        continue;
      }

      if ('exhausted' in route) {
        throw new PoolExhaustedError(route.message, options.requirements);
      }

      const selected = route.selected;
      if (!usedIds.has(selected.model_id)) {
        usedIds.add(selected.model_id);
        options.onModelUsed?.(selected, 'isPinned' in route ? route.isPinned : false);
      }
      if (originalModelId === undefined) {
        originalModelId = selected.model_id;
      } else if (selected.model_id !== originalModelId) {
        // GAP-003: every actual substitution is emitted and persisted.
        this.opts.eventBus.emit({
          type: 'model.substituted',
          run_id: options.runId,
          node_id: options.nodeId ?? 'node-0',
          agent: options.agent,
          original_model_id: originalModelId,
          substituted_model_id: selected.model_id,
          reason: lastClassification,
          timestamp: Date.now(),
        });
        options.onSubstitution?.(originalModelId, selected.model_id, lastClassification);
        originalModelId = selected.model_id;
      }

      const outcome = await this.runCandidate(options, selected, attemptFn);
      if (outcome.ok) {
        return outcome.value;
      }
      lastClassification = outcome.kind;
      lastErrorMessage = outcome.errorMessage;
      excluded.push(outcome.excludeModelId);
    }

    throw new PoolExhaustedError(
      `All eligible free models failed for agent ${options.agent}. Last error: ${lastErrorMessage}`,
      options.requirements
    );
  }

  private async runCandidate<T>(
    options: FallbackExecuteOptions,
    model: Model,
    attemptFn: (ctx: FallbackAttemptContext & { attempt: number }) => Promise<T>
  ): Promise<{ ok: true; value: T } | { ok: false; kind: ProviderErrorKind; errorMessage: string; excludeModelId: string }> {
    const providerCfg = this.opts.providerRepo.get(model.provider_id);
    if (!providerCfg) {
      this.opts.registry.recordModelError(model.provider_id, model.model_id, FAILURE_COOLDOWN_SECONDS.model_unavailable);
      return {
        ok: false,
        kind: 'model_unavailable',
        errorMessage: `Provider '${model.provider_id}' not found for model '${model.model_id}'`,
        excludeModelId: model.model_id,
      };
    }

    let connector: ProviderConnector;
    let apiKey: string | undefined;
    try {
      connector = this.opts.registry.getConnector(providerCfg.type);
      apiKey = (await this.opts.secretStore.resolveSecretRef(providerCfg.api_key_ref)) || undefined;
    } catch (err: any) {
      this.opts.registry.recordModelError(model.provider_id, model.model_id, FAILURE_COOLDOWN_SECONDS.auth);
      return { ok: false, kind: 'auth', errorMessage: err.message, excludeModelId: model.model_id };
    }

    // Pre-flight (e.g. capability probe): exclude candidates that fail before spending retries.
    if (options.preFlight) {
      let ok = false;
      try {
        ok = await options.preFlight({ model, providerCfg, connector, apiKey });
      } catch {
        ok = false;
      }
      if (!ok) {
        this.opts.registry.recordModelError(model.provider_id, model.model_id, FAILURE_COOLDOWN_SECONDS.busy);
        return {
 ok: false, kind: 'model_unavailable', errorMessage: `Pre-flight capability check failed for model '${model.model_id}'`, excludeModelId: model.model_id };
      }
    }

    // Real outbound throttling (FR-PRV-008): wait for a rate-limit token.
    if (this.opts.rateLimiter) {
      await this.opts.rateLimiter.acquire(providerCfg, options.signal);
    }

    this.throwIfAborted(options.signal);
    this.opts.registry.acquireLease(model.provider_id, model.model_id);
    try {
      let lastErr: unknown = null;
      let kind: ProviderErrorKind = 'unknown';

      for (let attempt = 0; attempt <= this.policy.maxRetriesPerModel; attempt++) {
        this.throwIfAborted(options.signal);
        try {
          const value = await attemptFn({ model, providerCfg, connector, apiKey, attempt });
          this.opts.registry.recordModelSuccess(model.provider_id, model.model_id);
          return { ok: true, value };
        } catch (err) {
          if (options.signal?.aborted) {
            throw new RunCancelledError();
          }
          lastErr = err;
          kind = classifyProviderError(err);
          const retryable = RETRYABLE_KINDS.has(kind);
          const hasRetriesLeft = attempt < this.policy.maxRetriesPerModel;
          if (retryable && hasRetriesLeft) {
            const retryAfterMs = parseRetryAfterMs(err);
            const delay = computeBackoffMs(this.policy, attempt, retryAfterMs, this.random);
            if (this.opts.rateLimiter && kind === 'rate_limited') {
              this.opts.rateLimiter.penalize(providerCfg, delay);
            }
            if (delay > 0) {
              await this.sleep(delay);
            }
            continue;
          }
          break;
        }
      }

      // Candidate exhausted -> record failure state and let caller exclude it.
      const finalKind = classifyProviderError(lastErr);
      const cooldown = FAILURE_COOLDOWN_SECONDS[finalKind];
      this.opts.registry.recordModelError(model.provider_id, model.model_id, cooldown);
      return {
        ok: false,
        kind: finalKind,
        errorMessage: lastErr instanceof Error ? lastErr.message : String(lastErr),
        excludeModelId: model.model_id,
      };
    } finally {
      this.opts.registry.releaseLease(model.provider_id, model.model_id);
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new RunCancelledError();
    }
  }
}
