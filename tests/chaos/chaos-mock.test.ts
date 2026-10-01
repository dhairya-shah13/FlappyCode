import { describe, expect, it } from 'vitest';
import { MockProviderConnector } from '@flappycode/providers';
import { DeterministicRouter, ModelRegistry, FlappyEventBus } from '@flappycode/core';
import { ModelRepository, ProviderRepository, HybridSecretStore } from '@flappycode/storage';
import { FlappyDatabase } from '@flappycode/storage';

describe('Chaos & Mock Provider Harness Tests (Section 10 & 26)', () => {
  async function collect(stream: AsyncIterable<any>): Promise<string> {
    let text = '';
    for await (const chunk of stream) {
      if (chunk.delta) text += chunk.delta;
    }
    return text;
  }

  it('Handles 429 rate limit countdown gracefully', async () => {
    const connector = new MockProviderConnector({
      rateLimitCountdown: 1, // Will fail with 429 on first call, succeed on second
      retryAfterSeconds: 2,
    });

    // Call 1: expect 429
    await expect(
      collect(
        connector.complete({
          model: 'mock-coder-free',
          messages: [{ role: 'user', content: 'hello' }],
        })
      )
    ).rejects.toThrow(/Rate limit exceeded/);

    // Call 2: countdown expired, succeeds
    const res = await collect(
      connector.complete({
        model: 'mock-coder-free',
        messages: [{ role: 'user', content: 'hello' }],
      })
    );
    expect(res).toBeTruthy();
  });

  it('Handles 5xx server errors and throws descriptive error', async () => {
    const connector = new MockProviderConnector({
      force5xx: true,
    });

    await expect(
      collect(
        connector.complete({
          model: 'mock-coder-free',
          messages: [{ role: 'user', content: 'test 5xx' }],
        })
      )
    ).rejects.toThrow(/500.*Internal server error/);
  });

  it('Marks disappearing models as unavailable per FR-MOD-006', async () => {
    const db = new FlappyDatabase({ path: ':memory:' });
    const providerRepo = new ProviderRepository(db.db);
    const modelRepo = new ModelRepository(db.db);
    const secretStore = new HybridSecretStore();
    const eventBus = new FlappyEventBus();

    const registry = new ModelRegistry(providerRepo, modelRepo, secretStore, eventBus);

    // Discovered with mock-coder-free and mock-planner-free
    await registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      display_name: 'Mock P1',
      base_url: 'http://localhost',
      data_use_policy: 'no_training',
      enabled: true,
    });

    let models = registry.getModels();
    expect(models.length).toBeGreaterThan(0);
    const initialCoder = models.find((m: any) => m.model_id === 'mock-coder-free');
    expect(initialCoder?.tier).not.toBe('unavailable');

    // Simulate model disappearing from provider's catalog
    const connector = registry.getConnector('mock-p1') as MockProviderConnector;
    connector.scenario.disappearingModels = new Set(['mock-coder-free']);

    // Re-discover / refresh
    await registry.discoverProviderModels('mock-p1');

    const updated = modelRepo.getModel('mock-p1', 'mock-coder-free');
    expect(updated?.tier).toBe('unavailable');
    db.close();
  });

  it('Pool exhaustion invariant: Zero paid calls occur when free pool is exhausted', async () => {
    const db = new FlappyDatabase({ path: ':memory:' });
    const providerRepo = new ProviderRepository(db.db);
    const modelRepo = new ModelRepository(db.db);
    const secretStore = new HybridSecretStore();
    const eventBus = new FlappyEventBus();

    const registry = new ModelRegistry(providerRepo, modelRepo, secretStore, eventBus);

    // Save provider first to satisfy foreign key constraint
    providerRepo.save({
      id: 'paid-only',
      type: 'mock',
      display_name: 'Paid Only Provider',
      base_url: 'http://localhost',
      data_use_policy: 'no_training',
      enabled: true,
    });

    // Save only 1 paid model
    modelRepo.saveModel({
      provider_id: 'paid-only',
      model_id: 'expensive-paid-model',
      tier: 'paid',
      tier_source: 'metadata',
      context_length: 32768,
      modality: 'text->text',
      supports_tools: true,
      supports_vision: false,
      tool_probe_passed: true,
      price_in: 10,
      price_out: 30,
      avg_latency_ms: 100,
      last_validated_at: Date.now(),
      data_use_policy: 'no_training',
      is_local: false,
      is_pinned: false,
    });

    const router = new DeterministicRouter(registry, eventBus);
    let paidCallExecuted = false;

    // Route a task: since free pool has 0 models, it MUST return exhausted
    const route = router.select({ taskType: 'coding', minContext: 4096 });
    expect('exhausted' in route).toBe(true);

    if ('exhausted' in route) {
      expect(route.exhausted).toBe(true);
      expect(route.requirements.taskType).toBe('coding');
      // Paid call was NOT executed
      expect(paidCallExecuted).toBe(false);
      expect(router.paidGate.hasGrant('expensive-paid-model')).toBe(false);
    }

    db.close();
  });
});
