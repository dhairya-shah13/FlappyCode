import { Model, TaskRequirements } from '@flappycode/protocol';
import { LiveModelState } from '../registry/model-registry.js';

export function scoreModel(
  model: Model,
  req: TaskRequirements,
  liveState: LiveModelState,
  coderModelId?: string
): number {
  let score = 100;

  // 1. Task affinity
  if (req.taskType === 'coding') {
    if (model.model_id.includes('coder') || model.model_id.includes('code')) {
      score += 40;
    }
    if (model.context_length >= 32768) {
      score += 20;
    }
  } else if (req.taskType === 'planning') {
    if (model.model_id.includes('planner') || model.model_id.includes('plan')) {
      score += 40;
    }
    if (model.context_length >= 32768) {
      score += 30;
    }
    if (model.model_id.includes('instruct') || model.model_id.includes('chat')) {
      score += 20;
    }
  } else if (req.taskType === 'search') {
    // Fast models preferred for search/file-finder
    if (model.avg_latency_ms < 1000) {
      score += 30;
    }
  } else if (req.taskType === 'review') {
    // Reviewer prefers different model than coder
    if (coderModelId && model.model_id === coderModelId) {
      score -= 50; // Same-model reviewer penalty per FR-ORC-007
    } else {
      score += 25;
    }
  }

  // 2. Local / privacy bonus
  if (model.is_local) {
    score += 20;
  }
  if (model.data_use_policy === 'no_training') {
    score += 15;
  }

  // 3. Latency score
  if (model.avg_latency_ms > 0) {
    const latencyPenalty = Math.min(30, Math.floor(model.avg_latency_ms / 100));
    score -= latencyPenalty;
  }

  // 4. Recent error rate penalty
  if (liveState.recentErrorRate > 0) {
    score -= Math.floor(liveState.recentErrorRate * 50);
  }

  // 5. Concurrency headroom
  if (liveState.busyCount > 0) {
    score -= liveState.busyCount * 10;
  }

  return score;
}
