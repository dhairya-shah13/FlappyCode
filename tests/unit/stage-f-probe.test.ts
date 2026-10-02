import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ModelRegistry } from '@flappycode/core';
import { CapabilityProbe } from '@flappycode/core';
import { DeterministicRouter } from '@flappycode/core';
import { FallbackExecutor } from '@flappycode/core';
import { FlappyEventBus } from '@flappycode/core';
import {
  FlappyDatabase,
  HybridSecretStore,
  ModelRepository,
  ProviderRepository,
} from '@flappycode/storage';
import {
  CompletionChunk,
  CompletionRequest,
  HealthInfo,
  ProviderConnector,
} from '@flappycode/providers';
import { ProviderConfig, RawModel } from '@flappycode/protocol';

class TestMockConnector implements ProviderConnector {
  public type = 'mock';
  public probeCalls = 0;
  public failProbeModels = new Set<string>();
  public transientProbeModels = new Set<string>();

  async authenticate() {
    return { success: true };
  }

  async listModels(): Promise<RawModel[]> {
    return [];
  }

  async healthCheck(): Promise<HealthInfo> {
    return { status: 'healthy', latencyMs: 5, lastChecked: Date.now() };
  }

  async *complete(
    cfg: ProviderConfig,
    req: CompletionRequest,
    _apiKey?: string
  ): AsyncIterable<CompletionChunk> {
    void cfg;
    if (req.tools && req.tools.length > 0 && req.messages[0].content.includes('test_probe_tool')) {
      this.probeCalls++;
      if (this.failProbeModels.has(req.model)) {
        // Plain text response, no tool calls
        yield { delta: 'I am a text model, I do not support tools.' };
        return;
      }
      if (this.transientProbeModels.has(req.model)) {
        throw new Error('503 Service Unavailable: High load transient error');
      }
      // Successful tool call
      yield {
        delta: '',
        tool_calls: [
          {
            index: 0,
            id: 'call_probe_1',
            type: 'function' as const,
            function: {
              name: 'test_probe_tool',
              arguments: '{"ping":"pong"}',
            },
          },
        ],
      };
      return;
    }

    // Normal completion
    yield { delta: `Completed by ${req.model}` };
  }
}

describe('GAP-015: Tool-Calling Capability Probe', () => {
  let tempDir: string;
  let db: FlappyDatabase;
  let eventBus: FlappyEventBus;
  let modelRepo: ModelRepository;
  let providerRepo: ProviderRepository;
  let secretStore: HybridSecretStore;
  let connector: TestMockConnector;
  let registry: ModelRegistry;
  let router: DeterministicRouter;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-probe-test-'));
    db = new FlappyDatabase({ path: path.join(tempDir, 'probe.db') });
    modelRepo = new ModelRepository(db.db);
    providerRepo = new ProviderRepository(db.db);
    secretStore = new HybridSecretStore(path.join(tempDir, 'secrets.enc'));
    eventBus = new FlappyEventBus();
    connector = new TestMockConnector();

    registry = new ModelRegistry(
      providerRepo,
      modelRepo,
      secretStore,
      eventBus
    );
    registry.registerConnector('mock', connector);

    providerRepo.save({
      id: 'prov-mock',
      display_name: 'Mock Provider',
      type: 'mock',
      enabled: true,
      data_use_policy: 'no_training',
    });

    router = new DeterministicRouter(registry, eventBus);
  });

  afterEach(() => {
    try {
      db?.close();
    } catch {}
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('distinguishes supported, unsupported, and transient probe outcomes', async () => {
    const probe = new CapabilityProbe();
    const cfg: ProviderConfig = {
      id: 'prov-mock',
      display_name: 'Mock',
      type: 'mock',
      enabled: true,
      data_use_policy: 'no_training',
    };

    // 1. Supported model
    const resPass = await probe.probeToolCallingWithOutcome(connector, cfg, 'model-tool-pass');
    expect(resPass.outcome).toBe('supported');
    expect(probe.getCachedResult('prov-mock', 'model-tool-pass')).toBe(true);

    // 2. Unsupported model
    connector.failProbeModels.add('model-tool-fail');
    const resFail = await probe.probeToolCallingWithOutcome(connector, cfg, 'model-tool-fail');
    expect(resFail.outcome).toBe('unsupported');
    expect(probe.getCachedResult('prov-mock', 'model-tool-fail')).toBe(false);

    // 3. Transient failure model
    connector.transientProbeModels.add('model-tool-transient');
    const resTransient = await probe.probeToolCallingWithOutcome(connector, cfg, 'model-tool-transient');
    expect(resTransient.outcome).toBe('transient');
    // Transient failure must NOT be cached as permanent false
    expect(probe.getCachedResult('prov-mock', 'model-tool-transient')).toBeUndefined();
  });

  it('modelRegistry.probeModel persists result to DB and emits model.probed event', async () => {
    modelRepo.saveModel({
      provider_id: 'prov-mock',
      model_id: 'model-a',
      tier: 'free',
      tier_source: 'metadata',
      context_length: 8000,
      modality: 'text',
      supports_tools: true,
      supports_vision: false,
      tool_probe_passed: null,
      price_in: 0,
      price_out: 0,
      avg_latency_ms: 200,
      last_validated_at: Date.now(),
      data_use_policy: 'no_training',
      is_local: false,
      is_pinned: false,
    });

    const events: any[] = [];
    eventBus.on('model.probed' as any, (e) => events.push(e));

    const result = await registry.probeModel('prov-mock', 'model-a');
    expect(result.outcome).toBe('supported');

    // DB state updated
    const saved = modelRepo.getModel('prov-mock', 'model-a');
    expect(saved?.tool_probe_passed).toBe(true);

    // Event emitted
    expect(events.length).toBe(1);
    expect(events[0].provider_id).toBe('prov-mock');
    expect(events[0].model_id).toBe('model-a');
    expect(events[0].passed).toBe(true);

    // Invalidation clears cache and DB
    registry.reprobeModel('prov-mock', 'model-a');
    const cleared = modelRepo.getModel('prov-mock', 'model-a');
    expect(cleared?.tool_probe_passed).toBeNull();
  });

  it('lazy probe occurs on first tool role selection and excludes failing model from router', async () => {
    // Register Model 1 (failing tools) and Model 2 (passing tools)
    modelRepo.saveModel({
      provider_id: 'prov-mock',
      model_id: 'tool-fail-model',
      tier: 'free',
      tier_source: 'metadata',
      context_length: 8000,
      modality: 'text',
      supports_tools: true,
      supports_vision: false,
      tool_probe_passed: null,
      price_in: 0,
      price_out: 0,
      avg_latency_ms: 100, // lower latency, will rank higher initially
      last_validated_at: Date.now(),
      data_use_policy: 'no_training',
      is_local: false,
      is_pinned: false,
    });
    modelRepo.saveModel({
      provider_id: 'prov-mock',
      model_id: 'tool-pass-model',
      tier: 'free',
      tier_source: 'metadata',
      context_length: 8000,
      modality: 'text',
      supports_tools: true,
      supports_vision: false,
      tool_probe_passed: null,
      price_in: 0,
      price_out: 0,
      avg_latency_ms: 300,
      last_validated_at: Date.now(),
      data_use_policy: 'no_training',
      is_local: false,
      is_pinned: false,
    });

    connector.failProbeModels.add('tool-fail-model');

    const executor = new FallbackExecutor({
      router,
      registry,
      eventBus,
      providerRepo,
      secretStore,
    });

    // 1. Text-only selection does NOT trigger probe
    let preflightCalled = false;
    const textRes = await executor.execute(
      {
        runId: 'run-1',
        agent: 'Reviewer',
        requirements: { taskType: 'review', minContext: 4000, tools: false },
        preFlight: undefined,
      },
      async (ctx) => `Executed by ${ctx.model.model_id}`
    );
    expect(textRes).toContain('Executed by');
    expect(connector.probeCalls).toBe(0);

    // 2. Tool-using selection triggers lazy probe
    const toolRes = await executor.execute(
      {
        runId: 'run-2',
        agent: 'Coder',
        requirements: { taskType: 'coding', minContext: 4000, tools: true },
        preFlight: async ({ model }) => {
          const probeRes = await registry.probeModel(model.provider_id, model.model_id);
          return probeRes.outcome === 'supported';
        },
      },
      async (ctx) => `Executed by ${ctx.model.model_id}`
    );

    // tool-fail-model was probed, failed, and tool-pass-model was selected!
    expect(toolRes).toBe('Executed by tool-pass-model');
    expect(connector.probeCalls).toBe(2);

    // Router now excludes tool-fail-model permanently from tool tasks
    const route = router.select({ taskType: 'coding', minContext: 4000, tools: true });
    expect('selected' in route).toBe(true);
    if ('selected' in route) {
      expect(route.selected.model_id).toBe('tool-pass-model');
    }
  });
});
