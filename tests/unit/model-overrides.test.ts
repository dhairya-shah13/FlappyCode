import { describe, expect, it } from 'vitest';
import { FlappyEngine } from '@flappycode/core';
import { ModelClassifier } from '@flappycode/core';
import { RawModel } from '@flappycode/protocol';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('GAP-006 — User Model Tier Overrides Unit Tests', () => {
  it('ModelClassifier honors override precedence over community, metadata, and rules', () => {
    const classifier = new ModelClassifier({
      models: {
        'mock-p1/special-model': { tier: 'paid' },
      },
    });

    const raw: RawModel = {
      id: 'special-model',
      context_length: 8192,
      supports_tools: true,
      supports_vision: false,
      price_in: 0,
      price_out: 0,
    };

    // 1. Without override, community marks it paid
    const resCommunity = classifier.classify('mock-p1', raw, null, 'mock');
    expect(resCommunity.tier).toBe('paid');
    expect(resCommunity.source).toBe('community');

    // 2. With user override to free -> override wins
    const resOverrideFree = classifier.classify(
      'mock-p1',
      raw,
      { provider_id: 'mock-p1', model_id: 'special-model', tier: 'free', created_at: Date.now() },
      'mock'
    );
    expect(resOverrideFree.tier).toBe('free');
    expect(resOverrideFree.source).toBe('override');

    // 3. With user override to disabled -> override wins
    const resOverrideDisabled = classifier.classify(
      'mock-p1',
      raw,
      { provider_id: 'mock-p1', model_id: 'special-model', tier: 'disabled', created_at: Date.now() },
      'mock'
    );
    expect(resOverrideDisabled.tier).toBe('disabled');
    expect(resOverrideDisabled.source).toBe('override');
  });

  it('engine setModelOverride and deleteModelOverride validate models and persist to DB', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-tag-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    const engine = new FlappyEngine({ dbPath, disableScheduler: true });

    try {
      await engine.registry.addProvider({
        id: 'mock-p1',
        type: 'mock',
        data_use_policy: 'no_training',
        display_name: 'Mock Provider',
        enabled: true,
      });

      // Valid model tag to paid
      const taggedPaid = engine.setModelOverride('mock-p1/mock-coder-free', 'paid');
      expect(taggedPaid.tier).toBe('paid');
      expect(taggedPaid.provider_id).toBe('mock-p1');
      expect(taggedPaid.model_id).toBe('mock-coder-free');

      const modelAfterPaid = engine.getModels().find((m) => m.model_id === 'mock-coder-free');
      expect(modelAfterPaid?.tier).toBe('paid');
      expect(modelAfterPaid?.tier_source).toBe('override');

      // Tag to disabled
      engine.setModelOverride('mock-coder-free', 'disabled'); // bare model id works if unambiguous
      const modelAfterDisabled = engine.getModels().find((m) => m.model_id === 'mock-coder-free');
      expect(modelAfterDisabled?.tier).toBe('disabled');
      expect(modelAfterDisabled?.tier_source).toBe('override');

      // Tag to free
      engine.setModelOverride('mock-p1/mock-coder-free', 'free');
      const modelAfterFree = engine.getModels().find((m) => m.model_id === 'mock-coder-free');
      expect(modelAfterFree?.tier).toBe('free');
      expect(modelAfterFree?.tier_source).toBe('override');

      // Untag restores original inferred classification
      engine.deleteModelOverride('mock-p1/mock-coder-free');
      const modelAfterUntag = engine.getModels().find((m) => m.model_id === 'mock-coder-free');
      expect(modelAfterUntag?.tier).toBe('free'); // original mock rule
      expect(modelAfterUntag?.tier_source).toBe('rule');

      // Rejects unknown model
      expect(() => engine.setModelOverride('non-existent-model', 'free')).toThrow(/Unknown model/);
    } finally {
      engine.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('disabled model is never routed by the router', async () => {
    const engine = new FlappyEngine({ dbPath: ':memory:', disableScheduler: true });
    try {
      await engine.registry.addProvider({
        id: 'mock-p1',
        type: 'mock',
        data_use_policy: 'no_training',
        display_name: 'Mock Provider',
        enabled: true,
      });

      // Disable mock-coder-free
      engine.setModelOverride('mock-p1/mock-coder-free', 'disabled');

      // Router select must exclude disabled models
      const result = engine.router.select({
        taskType: 'coding',
        minContext: 4000,
        tools: true,
      });
      if ('selected' in result) {
        expect(result.selected.model_id).not.toBe('mock-coder-free');
        expect(result.rankedCandidates.some((m) => m.model_id === 'mock-coder-free')).toBe(false);
      }
    } finally {
      engine.close();
    }
  });
});
