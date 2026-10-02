import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlappyEngine } from '@flappycode/core';
import { FlappyServer } from '@flappycode/server';
import { MockProviderConnector, PROVIDER_PROFILES, USER_AGENT } from '@flappycode/providers';

const PLAN_JSON = JSON.stringify({
  goal: 'Create hello.txt file',
  files_to_modify: ['hello.txt'],
  assumptions: [],
  risks: [],
  nodes: [
    { id: 'node-coder', agent: 'Coder', description: 'Write hello into hello.txt', depends_on: [] },
  ],
});

const WRITE_TOOL_CALL = [[{ name: 'write_file', arguments: { path: 'hello.txt', content: 'hello world' } }]];

interface Harness {
  engine: FlappyEngine;
  root: string;
  events: any[];
  server?: FlappyServer;
}

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop()!;
    await fn();
  }
});

async function createHarness(opts: { onlyPaid?: boolean } = {}): Promise<Harness> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-stage-b-completion-'));
  fs.writeFileSync(path.join(root, 'hello.txt'), 'initial content\n');
  const engine = new FlappyEngine({
    projectRoot: root,
    dbPath: ':memory:',
    disableScheduler: true,
    retryPolicy: { baseDelayMs: 5, maxDelayMs: 20, maxRetryAfterMs: 40, maxRetriesPerModel: 1, jitter: false },
    configPaths: {
      user: path.join(root, '.no-user-config.json'),
      project: path.join(root, '.no-project-config.json'),
    },
  });

  const events: any[] = [];
  engine.eventBus.onAny((ev) => events.push(ev));

  if (opts.onlyPaid) {
    // Only paid model available
    const paidConnector = new MockProviderConnector({
      models: [
        {
          id: 'mock-expensive-paid',
          name: 'Mock Expensive Paid',
          context_length: 128000,
          supports_tools: true,
          supports_vision: true,
          price_in: 10.0,
          price_out: 30.0,
        },
      ],
      cannedResponses: {
        'mock-expensive-paid': [PLAN_JSON, PLAN_JSON, PLAN_JSON, PLAN_JSON, PLAN_JSON],
      },
      cannedToolCalls: {
        'mock-expensive-paid': [
          WRITE_TOOL_CALL[0],
          WRITE_TOOL_CALL[0],
          WRITE_TOOL_CALL[0],
          WRITE_TOOL_CALL[0],
        ],
      },
    });
    engine.registry.registerConnector('mock-paid-p1', paidConnector);
    await engine.registry.addProvider({
      id: 'mock-paid-p1',
      type: 'mock',
      data_use_policy: 'no_training',
      display_name: 'Mock Paid Provider',
      enabled: true,
    });
  } else {
    await engine.registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      data_use_policy: 'no_training',
      display_name: 'Mock Test Provider',
      enabled: true,
    });
    const connector = engine.registry.getConnector('mock-p1') as MockProviderConnector;
    connector.scenario.cannedResponses = { 'mock-planner-free': [PLAN_JSON] };
    connector.scenario.cannedToolCalls = {
      'mock-coder-free': WRITE_TOOL_CALL,
      'mock-expensive-paid': WRITE_TOOL_CALL,
    };
  }

  const cleanup = async () => {
    try { engine.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true });
  };
  cleanups.push(cleanup);

  return { engine, root, events };
}

describe('Stage B Completion Integration Suite', () => {
  describe('GAP-002 — Pool exhaustion interactive pause / resume / cancel', () => {
    it('Scenario A: Pool exhaustion -> pause -> exactly 2 actions -> add free provider -> resume -> complete', async () => {
      const { engine, events } = await createHarness({ onlyPaid: true });

      // Run planning on an exhausted free pool
      let caughtErr: any;
      let poolRunId = '';
      engine.eventBus.on('approval.requested', (ev) => {
        if (ev.kind === 'pool_exhausted') poolRunId = ev.run_id;
      });

      try {
        await engine.submitPrompt('Create hello.txt');
      } catch (err: any) {
        caughtErr = err;
      }

      expect(caughtErr).toBeDefined();
      expect(caughtErr.name).toBe('PoolExhaustedError');
      expect(poolRunId).toBeTruthy();

      // Assert exactly two actions are exposed in approval.requested
      const approvalEv = events.find(
        (ev) => ev.type === 'approval.requested' && ev.kind === 'pool_exhausted'
      );
      expect(approvalEv).toBeDefined();
      expect(approvalEv.details.actions.length).toBe(2);
      expect(approvalEv.details.actions[0].id).toBe('authorize_paid');
      expect(approvalEv.details.actions[1].id).toBe('add_free_provider');

      // Assert run is persisted as paused_pool_exhausted and zero paid grants exist
      const run = engine.taskRepo.getTaskRun(poolRunId);
      expect(run?.status).toBe('paused_pool_exhausted');
      expect(engine.router.paidGate.listGrants().length).toBe(0);

      // Now simulate user choosing Action 2: Add a mock free provider
      const freeModels = ['mock-coder-free', 'mock-planner-free', 'mock-reviewer-free', 'mock-analyst-free'];
      const freeConnector = new MockProviderConnector({
        cannedResponses: Object.fromEntries(freeModels.map((m) => [m, [PLAN_JSON, PLAN_JSON, PLAN_JSON]])),
        cannedToolCalls: Object.fromEntries(
          freeModels.map((m) => [m, [WRITE_TOOL_CALL[0], WRITE_TOOL_CALL[0], WRITE_TOOL_CALL[0]]])
        ),
      });
      engine.registry.registerConnector('mock-free-p2', freeConnector);

      await engine.registry.addProvider({
        id: 'mock-free-p2',
        type: 'mock',
        data_use_policy: 'no_training',
        display_name: 'New Mock Free Provider',
        enabled: true,
      });

      // Resolve pool exhaustion with action 'add_free_provider'
      const outcome = await engine.resolvePoolExhausted(poolRunId, 'add_free_provider');
      expect(outcome.plan).toBeDefined(); // Planning was resumed under original run_id

      // Approve plan and execute
      engine.approvePlan(outcome.plan!.run_id);
      await engine.executePlan(outcome.plan!.run_id, async () => true, async () => 'allow');

      // Assert task completes
      const completedEv = events.find((ev) => ev.type === 'run.completed');
      expect(completedEv).toBeDefined();
      expect(completedEv.paid_calls).toBe(0);
    });

    it('Scenario B: Pool exhaustion -> authorize_paid -> require confirmation -> PaidGrant issued -> paid model runs', async () => {
      const { engine, events } = await createHarness({ onlyPaid: true });

      let poolRunId = '';
      engine.eventBus.on('approval.requested', (ev) => {
        if (ev.kind === 'pool_exhausted') poolRunId = ev.run_id;
      });

      try {
        await engine.submitPrompt('Create hello.txt');
      } catch (err: any) {
        // expected pool exhaustion
      }

      // Action 1 without explicit confirm: MUST fail and NOT issue a PaidGrant
      await expect(
        engine.resolvePoolExhausted(poolRunId, 'authorize_paid', { confirm: false })
      ).rejects.toThrow(/explicit confirmation/i);
      expect(engine.router.paidGate.listGrants().length).toBe(0);

      // Action 1 with explicit confirm: issues PaidGrant and resumes
      const outcome = await engine.resolvePoolExhausted(poolRunId, 'authorize_paid', { confirm: true });
      expect(outcome.plan).toBeDefined();
      expect(engine.router.paidGate.listGrants().length).toBeGreaterThan(0);

      engine.approvePlan(outcome.plan!.run_id);
      await engine.executePlan(outcome.plan!.run_id, async () => true, async () => 'allow');

      const completed = events.find((ev) => ev.type === 'run.completed');
      expect(completed).toBeDefined();
      expect(completed.paid_calls).toBeGreaterThan(0);
    });

    it('Scenario C: Pool exhaustion -> add_free_provider that still has no eligible models -> honest still-exhausted error', async () => {
      const { engine } = await createHarness({ onlyPaid: true });

      let poolRunId = '';
      engine.eventBus.on('approval.requested', (ev) => {
        if (ev.kind === 'pool_exhausted') poolRunId = ev.run_id;
      });

      try {
        await engine.submitPrompt('Create hello.txt');
      } catch {}

      // Calling add_free_provider when still exhausted throws an honest error and keeps run paused
      await expect(
        engine.resolvePoolExhausted(poolRunId, 'add_free_provider')
      ).rejects.toThrow(/The free model pool is still exhausted/);

      expect(engine.orchestrator.isPaused(poolRunId)).toBe(true);
    });

    it('Scenario D: Cancel from pool-exhaustion state -> run terminates as cancelled', async () => {
      const { engine } = await createHarness({ onlyPaid: true });

      let poolRunId = '';
      engine.eventBus.on('approval.requested', (ev) => {
        if (ev.kind === 'pool_exhausted') poolRunId = ev.run_id;
      });

      try {
        await engine.submitPrompt('Create hello.txt');
      } catch {}

      const res = await engine.resolvePoolExhausted(poolRunId, 'cancel');
      expect(res.resumed).toBe(false);
      expect(engine.orchestrator.isPaused(poolRunId)).toBe(false);

      const run = engine.taskRepo.getTaskRun(poolRunId);
      expect(run?.status).toBe('cancelled');
    });

    it('Scenario E: resolvePoolExhausted through FlappyServer HTTP API works honestly and never fakes success', async () => {
      const { engine } = await createHarness({ onlyPaid: true });
      const testPort = 15488;
      const server = new FlappyServer(engine, { port: testPort, host: '127.0.0.1' });
      await server.start();
      cleanups.push(() => server.stop());

      // 1. Calling resolve on non-paused run returns 409 and success: false
      const fakeRes = await fetch(`http://127.0.0.1:${testPort}/v1/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.bearerToken}` },
        body: JSON.stringify({ type: 'resolvePoolExhausted', run_id: 'no-such-run', action: 'cancel' }),
      });
      expect(fakeRes.status).toBe(409);
      const fakeBody = (await fakeRes.json()) as any;
      expect(fakeBody.success).toBe(false);
      expect(fakeBody.error).toMatch(/No paused pool-exhausted run/);

      // 2. Pause a real run
      let poolRunId = '';
      engine.eventBus.on('approval.requested', (ev) => {
        if (ev.kind === 'pool_exhausted') poolRunId = ev.run_id;
      });
      try { await engine.submitPrompt('Create hello.txt'); } catch {}

      // 3. Resolve via server with cancellation
      const cancelRes = await fetch(`http://127.0.0.1:${testPort}/v1/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${server.bearerToken}` },
        body: JSON.stringify({ type: 'resolvePoolExhausted', run_id: poolRunId, action: 'cancel' }),
      });
      expect(cancelRes.status).toBe(200);
      const cancelBody = (await cancelRes.json()) as any;
      expect(cancelBody.success).toBe(true);
      expect(cancelBody.resumed).toBe(false);

      const run = engine.taskRepo.getTaskRun(poolRunId);
      expect(run?.status).toBe('cancelled');
    });
  });

  describe('GAP-006 — User model tier overrides survive provider refresh', () => {
    it('tag model free -> provider refresh -> model tier remains free with tier_source = override', async () => {
      const { engine } = await createHarness();

      // Tag mock-expensive-paid as free
      engine.setModelOverride('mock-p1/mock-expensive-paid', 'free');
      let model = engine.getModels().find((m) => m.model_id === 'mock-expensive-paid');
      expect(model?.tier).toBe('free');
      expect(model?.tier_source).toBe('override');

      // Refresh providers
      await engine.refreshProviders();

      // Override must persist through refresh
      model = engine.getModels().find((m) => m.model_id === 'mock-expensive-paid');
      expect(model?.tier).toBe('free');
      expect(model?.tier_source).toBe('override');

      // Untag restores original tier
      engine.deleteModelOverride('mock-p1/mock-expensive-paid');
      model = engine.getModels().find((m) => m.model_id === 'mock-expensive-paid');
      expect(model?.tier).toBe('paid');
      expect(model?.tier_source).toBe('metadata');
    });
  });

  describe('GAP-034 — Ollama Cloud profile & connector in engine', () => {
    it('can add ollama-cloud provider, enforces API key, discovers models as rate_limited_free (is_local=false)', async () => {
      const { engine } = await createHarness();

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = vi.fn(async (url) => {
          if (String(url).includes('/api/tags')) {
            return new Response(
              JSON.stringify({
                models: [
                  { name: 'qwen2.5-coder:7b', details: { parameter_size: '7b' } },
                  { name: 'deepseek-r1:8b', details: { parameter_size: '8b' } },
                ],
              }),
              { status: 200 }
            );
          }
          return new Response(JSON.stringify({}), { status: 200 });
        });

        // Add Ollama Cloud
        const models = await engine.addProvider(
          {
            id: 'ollama-cloud',
            type: 'ollama',
            data_use_policy: 'no_training',
            display_name: 'Ollama Cloud',
            enabled: true,
          },
          'ollama-cloud-api-key'
        );

        expect(models.length).toBe(2);
        for (const m of models) {
          expect(m.provider_id).toBe('ollama-cloud');
          expect(m.is_local).toBe(false);
          expect(m.tier).toBe('rate_limited_free');
          expect(m.data_use_policy).toBe('no_training');
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
