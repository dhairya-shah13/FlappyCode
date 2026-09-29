import { describe, it, expect } from 'vitest';
import { FlappyEventSchema } from '../events.js';

describe('FlappyEventSchema', () => {
  const base = { id: 'evt-1', ts: Date.now(), sessionId: 'sess-1' };

  it('validates session.started event', () => {
    const evt = {
      ...base,
      type: 'session.started',
      payload: { sessionId: 'sess-1', projectPath: 'C:\\Projects\\App' },
    };
    const parsed = FlappyEventSchema.parse(evt);
    expect(parsed.type).toBe('session.started');
  });

  it('validates plan.proposed event', () => {
    const evt = {
      ...base,
      type: 'plan.proposed',
      payload: {
        runId: 'run-1',
        prompt: 'Fix bug',
        plan: {
          nodes: [{ id: 'n1', agent: 'coder', description: 'Patch file' }],
        },
      },
    };
    const parsed = FlappyEventSchema.parse(evt);
    expect(parsed.type).toBe('plan.proposed');
  });

  it('validates model.substituted event', () => {
    const evt = {
      ...base,
      type: 'model.substituted',
      payload: {
        agent: 'coder',
        previousModelId: 'groq/llama-3.3-70b',
        newModelId: 'openrouter/qwen-2.5-coder',
        reason: 'Rate limit 429 received with Retry-After 60s',
      },
    };
    const parsed = FlappyEventSchema.parse(evt);
    expect(parsed.type).toBe('model.substituted');
  });

  it('validates approval.requested event', () => {
    const evt = {
      ...base,
      type: 'approval.requested',
      payload: {
        requestId: 'req-99',
        kind: 'pool_exhausted',
        description: 'All free models are exhausted',
      },
    };
    const parsed = FlappyEventSchema.parse(evt);
    expect(parsed.type).toBe('approval.requested');
  });

  it('validates pool.exhausted event', () => {
    const evt = {
      ...base,
      type: 'pool.exhausted',
      payload: {
        runId: 'run-1',
        message: 'No free quotas remaining across 4 providers',
        resetEstimates: { groq: '14m', openrouter: '00:00 UTC' },
      },
    };
    const parsed = FlappyEventSchema.parse(evt);
    expect(parsed.type).toBe('pool.exhausted');
  });

  it('validates provider.status event', () => {
    const evt = {
      ...base,
      type: 'provider.status',
      payload: {
        providerId: 'groq',
        status: 'rate_limited',
        message: 'Rate limit hit',
      },
    };
    const parsed = FlappyEventSchema.parse(evt);
    expect(parsed.type).toBe('provider.status');
  });

  it('validates registry.updated event', () => {
    const evt = {
      ...base,
      type: 'registry.updated',
      payload: {
        totalModels: 40,
        freeModels: 14,
        rateLimitedFreeModels: 6,
        providersCount: 4,
      },
    };
    const parsed = FlappyEventSchema.parse(evt);
    expect(parsed.type).toBe('registry.updated');
  });

  it('validates run.completed event', () => {
    const evt = {
      ...base,
      type: 'run.completed',
      payload: {
        runId: 'run-1',
        summary: 'Finished successfully',
        durationMs: 4200,
        paidCalls: 0,
      },
    };
    const parsed = FlappyEventSchema.parse(evt);
    expect(parsed.type).toBe('run.completed');
  });

  it('rejects unknown event type', () => {
    expect(() =>
      FlappyEventSchema.parse({
        ...base,
        type: 'unrecognized.event',
        payload: {},
      }),
    ).toThrow();
  });
});
