import { Model, TaskRequirements } from '@flappycode/protocol';
import { ModelRegistry } from '../registry/model-registry.js';
import { PaidGate } from './paid-gate.js';
import { scoreModel } from './scoring.js';
import { FlappyEventBus } from '../events/event-bus.js';

export interface RouteSelection {
  selected: Model;
  rankedCandidates: Model[];
  isPinned: boolean;
  score: number;
}

export interface PoolExhaustedResult {
  exhausted: true;
  requirements: TaskRequirements;
  message: string;
}

/**
 * Returned when a pinned model is unavailable and the agent's fallbackPolicy
 * requires an explicit user decision before any re-routing (FR-RTE-004).
 */
export interface PinnedUnavailableResult {
  needsUserDecision: true;
  pinnedModelId: string;
  policy: 'ask_user' | 'abort';
  message: string;
}

export type RoutingResult = RouteSelection | PoolExhaustedResult | PinnedUnavailableResult;

export class DeterministicRouter {
  public paidGate = new PaidGate();

  constructor(
    private registry: ModelRegistry,
    private eventBus: FlappyEventBus
  ) {}

  public select(
    req: TaskRequirements,
    coderModelId?: string,
    pinnedModelId?: string,
    pinnedFallbackPolicy: 'ask_user' | 'next_best_fit' | 'abort' = 'ask_user'
  ): RoutingResult {
    const isAutoPolicy = !pinnedModelId || pinnedModelId === 'flappyauto' || pinnedModelId.startsWith('auto:');

    // 0. Pinned agent binding wins if provided (and not an auto policy)
    if (!isAutoPolicy && pinnedModelId) {
      const candidates = this.registry.getModels();
      const pinned = candidates.find((m) => m.model_id === pinnedModelId);
      if (pinned && this.registry.isAvailable(pinned)) {
        // If pinned model is paid, auto-issue PaidGrant for user_pinned
        if (pinned.tier === 'paid') {
          this.paidGate.issueGrant(pinned.provider_id, pinned.model_id, 'user_pinned');
        }
        return {
          selected: pinned,
          rankedCandidates: [pinned],
          isPinned: true,
          score: 9999,
        };
      }


      // GAP-044 / FR-RTE-004: pinned model unavailable -> follow fallbackPolicy.
      // Default is ask_user: never silently re-route away from an explicit pin.
      if (pinnedFallbackPolicy === 'ask_user' || pinnedFallbackPolicy === 'abort') {
        const missing = !pinned;
        return {
          needsUserDecision: true,
          pinnedModelId,
          policy: pinnedFallbackPolicy,
          message: missing
            ? `Pinned model '${pinnedModelId}' is no longer registered in the model catalog.`
            : `Pinned model '${pinnedModelId}' is currently unavailable (cooling down, rate-limited, or provider offline).`,
        };
      }
      // 'next_best_fit': fall through to normal candidate selection below.
    }

    // 1. Candidate filter (hard requirements)
    const allModels = this.registry.getModels();
    const candidates = allModels.filter((m) => {
      // Paid gate enforcement: Paid models are strictly excluded unless PaidGrant exists
      if (m.tier === 'paid') {
        if (!this.paidGate.hasGrant(m.model_id)) {
          return false;
        }
      } else if (m.tier !== 'free' && m.tier !== 'rate_limited_free') {
        return false;
      }

      // Hard capability constraints
      if (req.minContext && m.context_length < req.minContext) {
        return false;
      }
      if (req.tools) {
        if (!m.supports_tools || m.tool_probe_passed === false) {
          return false;
        }
      }
      if (req.vision && !m.supports_vision) {
        return false;
      }
      if (req.excludeModelIds && req.excludeModelIds.includes(m.model_id)) {
        return false;
      }

      // Live availability constraint
      return this.registry.isAvailable(m);
    });

    // 2. Check for free pool exhaustion
    if (candidates.length === 0) {
      const message =
        'Every free model across your connected providers is currently unavailable (rate-limited, cooling down, or out of quota).';
      this.eventBus.emit({
        type: 'pool.exhausted',
        run_id: 'active',
        task_requirements: req as any,
        message,
        timestamp: Date.now(),
      });
      return {
        exhausted: true,
        requirements: req,
        message,
      };
    }

    // 3. Score and rank candidates
    const isFreeFast = pinnedModelId === 'auto:free-fast';
    const scored = candidates.map((m) => {
      const liveState = this.registry.getLiveState(m.provider_id, m.model_id);
      let score = scoreModel(m, req, liveState, coderModelId);
      if (isFreeFast) {
        const latencyBonus = Math.max(0, 2000 - (m.avg_latency_ms || 200));
        score += latencyBonus * 2;
      }
      return { model: m, score };
    });


    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    return {
      selected: best.model,
      rankedCandidates: scored.map((s) => s.model),
      isPinned: false,
      score: best.score,
    };
  }
}
