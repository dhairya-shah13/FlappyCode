import { describe, expect, it } from 'vitest';
import { scoreModel } from '@flappycode/core';
import { Model, TaskRequirements } from '@flappycode/protocol';

describe('Deterministic Router & Scoring Unit Tests (FR-ROU-001, FR-ROU-002)', () => {
  const dummyState = { busyCount: 0, cooldownUntil: 0, recentErrorRate: 0 };

  it('Scores coding models higher for coding tasks', () => {
    const coderModel: Model = {
      provider_id: 'p1',
      model_id: 'qwen-2.5-coder-32b',
      tier: 'free',
      tier_source: 'rule',
      context_length: 32768,
      modality: 'text->text',
      supports_tools: true,
      supports_vision: false,
      tool_probe_passed: true,
      price_in: 0,
      price_out: 0,
      avg_latency_ms: 500,
      last_validated_at: Date.now(),
      data_use_policy: 'no_training',
      is_local: false,
      is_pinned: false,
    };

    const generalModel: Model = {
      ...coderModel,
      model_id: 'generic-chat-model',
    };

    const req: TaskRequirements = { taskType: 'coding', minContext: 8192 };
    const scoreCoder = scoreModel(coderModel, req, dummyState);
    const scoreGeneral = scoreModel(generalModel, req, dummyState);

    expect(scoreCoder).toBeGreaterThan(scoreGeneral);
  });

  it('Enforces same-model reviewer penalty (FR-ORC-007)', () => {
    const modelA: Model = {
      provider_id: 'p1',
      model_id: 'model-a',
      tier: 'free',
      tier_source: 'rule',
      context_length: 16384,
      modality: 'text->text',
      supports_tools: true,
      supports_vision: false,
      tool_probe_passed: true,
      price_in: 0,
      price_out: 0,
      avg_latency_ms: 400,
      last_validated_at: Date.now(),
      data_use_policy: 'no_training',
      is_local: false,
      is_pinned: false,
    };

    const modelB: Model = {
      ...modelA,
      model_id: 'model-b',
    };

    const req: TaskRequirements = { taskType: 'review' };

    // When model-a was the coder, model-a gets -50 penalty for reviewing
    const scoreSame = scoreModel(modelA, req, dummyState, 'model-a');
    const scoreDiff = scoreModel(modelB, req, dummyState, 'model-a');

    expect(scoreDiff).toBeGreaterThan(scoreSame);
  });

  it('Rewards local models and zero-training data policies', () => {
    const localModel: Model = {
      provider_id: 'ollama',
      model_id: 'llama-3.1:8b',
      tier: 'free',
      tier_source: 'rule',
      context_length: 16384,
      modality: 'text->text',
      supports_tools: true,
      supports_vision: false,
      tool_probe_passed: true,
      price_in: 0,
      price_out: 0,
      avg_latency_ms: 100,
      last_validated_at: Date.now(),
      data_use_policy: 'no_training',
      is_local: true,
      is_pinned: false,
    };

    const cloudTrainingModel: Model = {
      ...localModel,
      provider_id: 'cloud',
      is_local: false,
      data_use_policy: 'trains_on_prompts',
    };

    const req: TaskRequirements = { taskType: 'general' };
    const scoreLocal = scoreModel(localModel, req, dummyState);
    const scoreCloud = scoreModel(cloudTrainingModel, req, dummyState);

    expect(scoreLocal).toBeGreaterThan(scoreCloud);
  });
});
