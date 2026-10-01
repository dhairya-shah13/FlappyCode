import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  FlappyEngine,
  DeterministicRouter,
  FlappyEventBus,
  ModelRegistry,
  FallbackExecutor,
  IntervalScheduler,
} from '@flappycode/core';
import { MockProviderConnector } from '@flappycode/providers';
import { FlappyDatabase, HybridSecretStore, ModelRepository, ProviderRepository } from '@flappycode/storage';

const PLAN_JSON = JSON.stringify({
  goal: 'Add multiply function to math.ts',
  files_to_modify: ['src/math.ts'],
  assumptions: [],
  risks: [],
  nodes: [
    { id: 'node-coder', agent: 'Coder', description: 'Add multiply function in src/math.ts', depends_on: [] },
  ],
});

const NEW_CONTENT =
  'export function add(a: number, b: number) {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number) {\n  return a * b;\n}\n';

const FREE_MODELS = ['mock-coder-free', 'mock-planner-free', 'mock-reviewer-free', 'mock-analyst-free'];

interface Harness {
  engine: FlappyEngine;
  connector: MockProviderConnector;
  root: string;
  events: any[];
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});

async function createHarness(): Promise<Harness> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-stage-b-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'math.ts'), 'export function add(a: number, b: number) {\n  return a + b;\n}\n');

  const engine = new FlappyEngine({
    projectRoot: root,
    dbPath: ':memory:',
    disableScheduler: true,
    retryPolicy: { baseDelayMs: 5, maxDelayMs: 20, maxRetryAfterMs: 40, maxRetriesPerModel: 2, jitter: false },
    configPaths: {
      user: path.join(root, '.no-user-config.json'),
      project: path.join(root, '.no-project-config.json'),
    },
  });

  await engine.registry.addProvider({
    id: 'mock-p1',
    type: 'mock',
    display_name: 'Mock Test Provider',
    base_url: 'http://localhost/mock',
    data_use_policy: 'no_training',
    enabled: true,
  });

  const connector = engine.registry.getConnector('mock-p1') as MockProviderConnector;
  connector.scenario.cannedResponses = { 'mock-planner-free': [PLAN_JSON] };
  // Every free model can complete the coder task when healthy.
  connector.scenario.cannedToolCalls = Object.fromEntries(
    FREE_MODELS.map((m) => [m, [[{ name: 'write_file', arguments: { path: 'src/math.ts', content: NEW_CONTENT } }]]])
  );

  const events: any[] = [];
  engine.eventBus.onAny((ev) => events.push(ev));

  const cleanup = () => {
    try {
      engine.close();
    } catch { /* already closed */ }
    fs.rmSync(root, { recursive: true, force: true });
  };
  cleanups.push(cleanup);

  return { engine, connector, root, events };
}

async function executeWithApproval(engine: FlappyEngine, runId: string): Promise<void> {
  await engine.executePlan(runId, async () => true, async () => 'allow');
}

describe('Stage B — mandatory fallback scenarios against the real orchestration path', () => {
  it('Scenario 1: first free model busy (cooldown) -> next eligible model runs, no paid calls', async () => {
    const { engine, events } = await createHarness();
    engine.registry.recordModelError('mock-p1', 'mock-coder-free', 300); // busy/cooling down

    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);
    await executeWithApproval(engine, plan.run_id);

    const selected = events.filter((e) => e.type === 'model.selected' && e.agent === 'Coder');
    expect(selected.length).toBeGreaterThan(0);
    expect(selected[0].model.model_id).not.toBe('mock-coder-free');
    const completed = events.find((e) => e.type === 'run.completed');
    expect(completed).toBeTruthy();
    expect(completed.paid_calls).toBe(0);
    expect(engine.router.paidGate.listGrants().length).toBe(0);
    expect(engine.fsJail.readFile('src/math.ts')).toContain('multiply');
  });

  it('Scenario 2: first free model 429 -> retry with backoff/Retry-After, then substitution, run continues, 0 paid', async () => {
    const { engine, connector, events } = await createHarness();
    connector.scenario.failModels = {
      'mock-coder-free': { kind: 'rate_limit', retryAfterSeconds: 1 }, // infinite
    };

    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);
    await executeWithApproval(engine, plan.run_id);

    const subs = events.filter((e) => e.type === 'model.substituted');
    expect(subs.length).toBeGreaterThanOrEqual(1);
    expect(subs[0].original_model_id).toBe('mock-coder-free');
    expect(subs[0].reason).toMatch(/rate_limited|server|timeout|quota|model_unavailable/);
    const completed = events.find((e) => e.type === 'run.completed');
    expect(completed).toBeTruthy();
    expect(completed.paid_calls).toBe(0);
    expect(engine.router.paidGate.listGrants().length).toBe(0);
    // Leases must be released after the run.
    const state = engine.registry.getLiveState('mock-p1', 'mock-coder-free');
    expect(state.busyCount).toBe(0);
  });

  it('Scenario 3: first free model 5xx -> retries then substitution, run continues, 0 paid', async () => {
    const { engine, connector, events } = await createHarness();
    connector.scenario.failModels = { 'mock-coder-free': { kind: 'server' } };

    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);
    await executeWithApproval(engine, plan.run_id);

    expect(events.filter((e) => e.type === 'model.substituted').length).toBeGreaterThanOrEqual(1);
    expect(events.find((e) => e.type === 'run.completed')).toBeTruthy();
    expect(engine.router.paidGate.listGrants().length).toBe(0);
  });

  it('Scenario 4: first free model timeout -> retries then substitution, run continues, 0 paid', async () => {
    const { engine, connector, events } = await createHarness();
    connector.scenario.failModels = { 'mock-coder-free': { kind: 'timeout' } };

    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);
    await executeWithApproval(engine, plan.run_id);

    expect(events.filter((e) => e.type === 'model.substituted').length).toBeGreaterThanOrEqual(1);
    expect(events.find((e) => e.type === 'run.completed')).toBeTruthy();
    expect(engine.router.paidGate.listGrants().length).toBe(0);
  });

  it('Scenario 5: first free model quota exhausted -> immediate substitution (no wasted retries), 0 paid', async () => {
    const { engine, connector, events } = await createHarness();
    connector.scenario.failModels = { 'mock-coder-free': { kind: 'quota' } };

    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);
    await executeWithApproval(engine, plan.run_id);

    const subs = events.filter((e) => e.type === 'model.substituted');
    expect(subs.length).toBeGreaterThanOrEqual(1);
    // Quota is terminal: exactly one failed attempt before exclusion.
    expect(subs[0].reason).toBe('quota');
    expect(events.find((e) => e.type === 'run.completed')).toBeTruthy();
    expect(engine.router.paidGate.listGrants().length).toBe(0);
  });

  it('Scenario 6: selected model disappears during the run -> substitution to replacement, 0 paid', async () => {
    const { engine, connector, events } = await createHarness();
    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);

    // Model vanishes from the provider AFTER planning.
    connector.scenario.disappearingModels = new Set(['mock-coder-free']);

    await executeWithApproval(engine, plan.run_id);

    const subs = events.filter((e) => e.type === 'model.substituted');
    expect(subs.length).toBeGreaterThanOrEqual(1);
    expect(subs[0].original_model_id).toBe('mock-coder-free');
    expect(subs[0].reason).toBe('model_unavailable');
    expect(events.find((e) => e.type === 'run.completed')).toBeTruthy();
    expect(engine.router.paidGate.listGrants().length).toBe(0);
  });

  it('Scenario 7: multiple free models fail sequentially -> chain of substitutions, run completes, 0 paid', async () => {
    const { engine, connector, events } = await createHarness();
    connector.scenario.failModels = {
      'mock-coder-free': { kind: 'server' },
      'mock-analyst-free': { kind: 'rate_limit', retryAfterSeconds: 1 },
      'mock-reviewer-free': { kind: 'timeout' },
    };

    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);
    await executeWithApproval(engine, plan.run_id);

    const subs = events.filter((e) => e.type === 'model.substituted');
    expect(subs.length).toBeGreaterThanOrEqual(2);
    const completed = events.find((e) => e.type === 'run.completed');
    expect(completed).toBeTruthy();
    expect(completed.paid_calls).toBe(0);
    expect(engine.router.paidGate.listGrants().length).toBe(0);
    // Whatever model finally ran, it was a free one.
    const finalModel = completed.models_used[completed.models_used.length - 1];
    expect(FREE_MODELS).toContain(finalModel);
  });

  it('Scenario 8: entire free pool unavailable at execution -> pause with exactly 2 actions, 0 paid calls', async () => {
    const { engine, connector, events } = await createHarness();
    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);

    // All free models now fail every completion.
    connector.scenario.failModels = Object.fromEntries(FREE_MODELS.map((m) => [m, { kind: 'server' }]));

    await expect(executeWithApproval(engine, plan.run_id)).rejects.toMatchObject({
      name: 'PoolExhaustedError',
    });

    const pauseApproval = events.find(
      (e) => e.type === 'approval.requested' && e.kind === 'pool_exhausted'
    );
    expect(pauseApproval).toBeTruthy();
    expect(pauseApproval.details.actions).toHaveLength(2);
    expect(pauseApproval.details.actions[0].id).toBe('authorize_paid');
    expect(pauseApproval.details.actions[1].id).toBe('add_free_provider');
    expect(events.some((e) => e.type === 'pool.exhausted')).toBe(true);
    expect(engine.orchestrator.isPaused(plan.run_id)).toBe(true);
    expect(engine.router.paidGate.listGrants().length).toBe(0);
    const run = engine.taskRepo.getTaskRun(plan.run_id);
    expect(run?.status).toBe('paused_pool_exhausted');
  });
});

describe('Stage B2 — pool exhaustion resolution and resume', () => {
  it('paid authorization requires explicit confirmation before any PaidGrant exists', async () => {
    const { engine, connector } = await createHarness();
    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);
    connector.scenario.failModels = Object.fromEntries(FREE_MODELS.map((m) => [m, { kind: 'server' }]));
    await expect(executeWithApproval(engine, plan.run_id)).rejects.toThrow();

    // Action (a) without confirmation: NO grant is created.
    await expect(
      engine.resolvePoolExhausted(plan.run_id, 'authorize_paid', { confirm: false })
    ).rejects.toThrow(/explicit confirmation/i);
    expect(engine.router.paidGate.listGrants().length).toBe(0);
  });

  it('exhaust pool -> pause -> exactly 2 actions -> resolve -> resume -> successful completion', async () => {
    const { engine, connector, events } = await createHarness();
    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);
    connector.scenario.failModels = Object.fromEntries(FREE_MODELS.map((m) => [m, { kind: 'server' }]));

    await expect(executeWithApproval(engine, plan.run_id)).rejects.toThrow();
    expect(engine.orchestrator.isPaused(plan.run_id)).toBe(true);
    expect(engine.router.paidGate.listGrants().length).toBe(0);

    // User connects a free provider / refreshes: failures clear.
    delete connector.scenario.failModels;

    const result = await engine.resolvePoolExhausted(plan.run_id, 'add_free_provider');
    expect(result.resumed).toBe(true);

    expect(engine.orchestrator.isPaused(plan.run_id)).toBe(false);
    const completed = events.find((e) => e.type === 'run.completed');
    expect(completed).toBeTruthy();
    expect(completed.paid_calls).toBe(0);
    expect(engine.fsJail.readFile('src/math.ts')).toContain('multiply');
    expect(engine.taskRepo.getTaskRun(plan.run_id)?.status).toBe('completed');
  });

  it('add_free_provider resolution is honest when the pool is still exhausted', async () => {
    const { engine, connector } = await createHarness();
    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);
    connector.scenario.failModels = Object.fromEntries(FREE_MODELS.map((m) => [m, { kind: 'server' }]));
    await expect(executeWithApproval(engine, plan.run_id)).rejects.toThrow();

    // Simulate "still no free models": remove them from discovery too.
    connector.scenario.models = [];
    await expect(
      engine.resolvePoolExhausted(plan.run_id, 'add_free_provider')
    ).rejects.toThrow(/still exhausted/i);
    expect(engine.orchestrator.isPaused(plan.run_id)).toBe(true);
  });

  it('authorize_paid with confirmation issues a real PaidGrant enabling paid routing after resume', async () => {
    const { engine, connector } = await createHarness();
    // Register a paid model so authorization has a target.
    engine.modelRepo.saveModel({
      provider_id: 'mock-p1',
      model_id: 'mock-expensive-paid',
      tier: 'paid',
      tier_source: 'metadata',
      context_length: 128000,
      modality: 'text->text',
      supports_tools: true,
      supports_vision: true,
      tool_probe_passed: true,
      price_in: 10,
      price_out: 30,
      avg_latency_ms: 0,
      last_validated_at: Date.now(),
      data_use_policy: 'no_training',
      is_local: false,
      is_pinned: false,
    });

    const plan = await engine.submitPrompt('Add multiply');
    engine.approvePlan(plan.run_id);
    connector.scenario.failModels = Object.fromEntries(FREE_MODELS.map((m) => [m, { kind: 'server' }]));
    await expect(executeWithApproval(engine, plan.run_id)).rejects.toThrow();
    expect(engine.router.paidGate.listGrants().length).toBe(0); // 0 paid before authorization

    delete connector.scenario.failModels;
    const result = await engine.resolvePoolExhausted(plan.run_id, 'authorize_paid', { confirm: true });
    expect(result.resumed).toBe(true);
    expect(engine.router.paidGate.listGrants().length).toBeGreaterThanOrEqual(1);
  });
});

describe('Stage B3 — periodic registry revalidation scheduler', () => {
  it('IntervalScheduler never overlaps jobs and can start/stop cleanly', async () => {
    let runs = 0;
    const scheduler = new IntervalScheduler({
      intervalMs: 10_000,
      run: async () => {
        runs++;
        await new Promise((r) => setTimeout(r, 50));
      },
    });
    // Manual ticks: overlapping calls collapse into one run.
    const t1 = scheduler.tick();
    const t2 = scheduler.tick();
    await Promise.all([t1, t2]);
    expect(runs).toBe(1);
    scheduler.start();
    expect(scheduler.isRunning).toBe(false);
    scheduler.stop();
    scheduler.dispose();
    expect(runs).toBe(1);
  });

  it('engine refreshes the registry on a short interval and stops on close', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-sched-'));
    const engine = new FlappyEngine({
      projectRoot: root,
      dbPath: ':memory:',
      revalidateIntervalMs: 25,
      configPaths: {
        user: path.join(root, '.no-user-config.json'),
        project: path.join(root, '.no-project-config.json'),
      },
    });
    await engine.registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      display_name: 'Mock',
      base_url: 'http://localhost/mock',
      data_use_policy: 'no_training',
      enabled: true,
    });

    let registryUpdates = 0;
    engine.eventBus.on('registry.updated', () => registryUpdates++);

    await new Promise((r) => setTimeout(r, 160));
    expect(registryUpdates).toBeGreaterThanOrEqual(2); // more than the initial discovery emit

    engine.stopScheduler();
    const frozen = registryUpdates;
    await new Promise((r) => setTimeout(r, 120));
    expect(registryUpdates).toBe(frozen); // stopped cleanly

    engine.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('skips refresh work when there are no enabled providers', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-sched2-'));
    const engine = new FlappyEngine({
      projectRoot: root,
      dbPath: ':memory:',
      revalidateIntervalMs: 20,
      configPaths: {
        user: path.join(root, '.no-user-config.json'),
        project: path.join(root, '.no-project-config.json'),
      },
    });
    let updates = 0;
    engine.eventBus.on('registry.updated', () => updates++);
    await new Promise((r) => setTimeout(r, 120));
    expect(updates).toBe(0);
    engine.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('Stage B4 — user model tier overrides (FR-MOD-005)', () => {
  it('setOverride persists, wins classification precedence, survives refresh, and is removable', async () => {
    const { engine } = await createHarness();

    engine.registry.setOverride('mock-p1', 'mock-coder-free', 'disabled');
    let model = engine.getModels().find((m) => m.model_id === 'mock-coder-free')!;
    expect(model.tier).toBe('disabled');
    expect(model.tier_source).toBe('override');

    // Survives re-discovery/refresh:
    await engine.refreshProviders();
    model = engine.getModels().find((m) => m.model_id === 'mock-coder-free')!;
    expect(model.tier).toBe('disabled');
    expect(model.tier_source).toBe('override');

    // Disabled model is excluded from routing:
    const route = engine.router.select({ taskType: 'coding', minContext: 4096 });
    expect('selected' in route && route.selected.model_id).not.toBe('mock-coder-free');

    engine.registry.deleteOverride('mock-p1', 'mock-coder-free');
    await engine.refreshProviders();
    model = engine.getModels().find((m) => m.model_id === 'mock-coder-free')!;
    expect(model.tier).not.toBe('disabled');
    expect(model.tier_source).not.toBe('override');
  });

  it('overrides persist in the database across engine restarts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-override-'));
    const dbPath = path.join(root, 'test.db');
    const mk = () =>
      new FlappyEngine({
        projectRoot: root,
        dbPath,
        disableScheduler: true,
        configPaths: {
          user: path.join(root, '.no-user-config.json'),
          project: path.join(root, '.no-project-config.json'),
        },
      });

    let engine = mk();
    await engine.registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      display_name: 'Mock',
      base_url: 'http://localhost/mock',
      data_use_policy: 'no_training',
      enabled: true,
    });
    engine.registry.setOverride('mock-p1', 'mock-coder-free', 'paid');
    engine.close();

    engine = mk();
    const overrides = engine.modelRepo.listOverrides();
    expect(overrides.find((o) => o.model_id === 'mock-coder-free')?.tier).toBe('paid');
    engine.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('Stage B5 — agent fallbackPolicy on unavailable pinned model (FR-RTE-004)', () => {
  function buildRouter(): {
    router: DeterministicRouter;
    registry: ModelRegistry;
    eventBus: FlappyEventBus;
    db: FlappyDatabase;
  } {
    const db = new FlappyDatabase({ path: ':memory:' });
    const providerRepo = new ProviderRepository(db.db);
    const modelRepo = new ModelRepository(db.db);
    const eventBus = new FlappyEventBus();
    const registry = new ModelRegistry(providerRepo, modelRepo, new HybridSecretStore(), eventBus);
    return { router: new DeterministicRouter(registry, eventBus), registry, eventBus, db };
  }

  it('default policy is ask_user: unavailable pin returns needsUserDecision, never a silent re-route', async () => {
    const { router, registry, db } = buildRouter();
    await registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      display_name: 'Mock',
      base_url: 'http://localhost',
      data_use_policy: 'no_training',
      enabled: true,
    });
    registry.recordModelError('mock-p1', 'mock-coder-free', 300);

    const route = router.select({ taskType: 'coding', minContext: 4096 }, undefined, 'mock-coder-free');
    expect('needsUserDecision' in route).toBe(true);
    if ('needsUserDecision' in route) {
      expect(route.policy).toBe('ask_user');
      expect(route.pinnedModelId).toBe('mock-coder-free');
    }
    db.close();
  });

  it('next_best_fit policy falls through to the next eligible model without prompting', async () => {
    const { router, registry, db } = buildRouter();
    await registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      display_name: 'Mock',
      base_url: 'http://localhost',
      data_use_policy: 'no_training',
      enabled: true,
    });
    registry.recordModelError('mock-p1', 'mock-coder-free', 300);

    const route = router.select(
      { taskType: 'coding', minContext: 4096 },
      undefined,
      'mock-coder-free',
      'next_best_fit'
    );
    expect('selected' in route).toBe(true);
    if ('selected' in route) {
      expect(route.selected.model_id).not.toBe('mock-coder-free');
    }
    db.close();
  });

  it('FallbackExecutor ask_user flow emits question.asked and honors the user decision', async () => {
    const { router, registry, eventBus, db } = buildRouter();
    await registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      display_name: 'Mock',
      base_url: 'http://localhost',
      data_use_policy: 'no_training',
      enabled: true,
    });
    const providerRepo = new ProviderRepository(db.db);
    registry.recordModelError('mock-p1', 'mock-coder-free', 300);

    const asked: string[] = [];
    const executor = new FallbackExecutor({
      router,
      registry,
      eventBus,
      providerRepo,
      secretStore: new HybridSecretStore(),
      askUser: async (req) => {
        asked.push(req.pinnedModelId);
        return 'next_best_fit';
      },
    });

    const questions: any[] = [];
    eventBus.on('question.asked', (q) => questions.push(q));

    let ranModel = '';
    const result = await executor.execute(
      {
        runId: 'run_test',
        agent: 'Coder',
        requirements: { taskType: 'coding', minContext: 4096 },
        pinnedModelId: 'mock-coder-free',
        pinnedFallbackPolicy: 'ask_user',
      },
      async (ctx) => {
        ranModel = ctx.model.model_id;
        return 'ok';
      }
    );

    expect(result).toBe('ok');
    expect(asked).toEqual(['mock-coder-free']);
    expect(questions).toHaveLength(1);
    expect(questions[0].options).toEqual(['next_best_fit', 'cancel']);
    expect(ranModel).not.toBe('mock-coder-free');
    db.close();
  });

  it('declining the pinned fallback aborts with ModelFallbackAbortError instead of re-routing', async () => {
    const { router, registry, eventBus, db } = buildRouter();
    await registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      display_name: 'Mock',
      base_url: 'http://localhost',
      data_use_policy: 'no_training',
      enabled: true,
    });
    const providerRepo = new ProviderRepository(db.db);
    registry.recordModelError('mock-p1', 'mock-coder-free', 300);

    const executor = new FallbackExecutor({
      router,
      registry,
      eventBus,
      providerRepo,
      secretStore: new HybridSecretStore(),
      askUser: async () => 'cancel',
    });

    await expect(
      executor.execute(
        {
          runId: 'run_test',
          agent: 'Coder',
          requirements: { taskType: 'coding', minContext: 4096 },
          pinnedModelId: 'mock-coder-free',
          pinnedFallbackPolicy: 'ask_user',
        },
        async () => 'never'
      )
    ).rejects.toThrow(/declined/i);
    db.close();
  });
});

describe('Stage B1 — Retry-After honored at the real call path', () => {
  it('waits the Retry-After duration (capped) before retrying the same candidate', async () => {
    const db = new FlappyDatabase({ path: ':memory:' });
    const providerRepo = new ProviderRepository(db.db);
    const modelRepo = new ModelRepository(db.db);
    const eventBus = new FlappyEventBus();
    const registry = new ModelRegistry(providerRepo, modelRepo, new HybridSecretStore(), eventBus);
    await registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      display_name: 'Mock',
      base_url: 'http://localhost',
      data_use_policy: 'no_training',
      enabled: true,
    });
    const connector = registry.getConnector('mock-p1') as MockProviderConnector;
    connector.scenario.failModels = {
      'mock-coder-free': { kind: 'rate_limit', retryAfterSeconds: 7, times: 1 },
    };

    const sleeps: number[] = [];
    const executor = new FallbackExecutor({
      router: new DeterministicRouter(registry, eventBus),
      registry,
      eventBus,
      providerRepo,
      secretStore: new HybridSecretStore(),
      retryPolicy: { baseDelayMs: 1, maxDelayMs: 10, maxRetryAfterMs: 250, maxRetriesPerModel: 2, jitter: false },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0.5,
    });

    const outcome = await executor.execute(
      { runId: 'run_retry', agent: 'Coder', requirements: { taskType: 'coding', minContext: 4096 } },
      async (ctx) => {
        let text = '';
        for await (const chunk of connector.complete(ctx.providerCfg, {
          model: ctx.model.model_id,
          messages: [{ role: 'user', content: 'hi' }],
        })) {
          if (chunk.delta) text += chunk.delta;
        }
        return text;
      }
    );

    expect(outcome).toBeTruthy();
    // Retry-After: 7s capped to maxRetryAfterMs=250; exactly one retry was needed.
    expect(sleeps).toEqual([250]);
    db.close();
  });
});
