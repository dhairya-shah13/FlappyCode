import { describe, it, expect } from 'vitest';
import { createUIStore, reduceEvent } from '../store.js';

describe('UI Store & Reducer', () => {
  it('initializes with default empty state', () => {
    const store = createUIStore();
    const state = store.getState();
    expect(state.providersCount).toBe(0);
    expect(state.freeModelCount).toBe(0);
    expect(state.status).toBe('no_providers');
    expect(state.nodes).toEqual([]);
    expect(state.pendingApproval).toBeNull();
  });

  it('updates state on session.started', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '1',
      ts: 1000,
      type: 'session.started',
      payload: { sessionId: 'sess-1', projectPath: 'C:\\App' },
    });
    expect(store.getState().sessionId).toBe('sess-1');
    expect(store.getState().projectPath).toBe('C:\\App');
  });

  it('updates counts and status on registry.updated', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '2',
      ts: 2000,
      type: 'registry.updated',
      payload: {
        providersCount: 4,
        freeModels: 14,
        rateLimitedFreeModels: 5,
        totalModels: 50,
      },
    });
    expect(store.getState().providersCount).toBe(4);
    expect(store.getState().freeModelCount).toBe(14);
    expect(store.getState().status).toBe('ready');
  });

  it('tracks nodes on node.started, node.updated, and node.finished', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '3',
      ts: 3000,
      type: 'node.started',
      payload: { runId: 'r1', nodeId: 'n1', agent: 'coder', model: 'groq/llama' },
    });
    expect(store.getState().status).toBe('working');
    expect(store.getState().nodes).toHaveLength(1);
    expect(store.getState().nodes[0].status).toBe('running');

    reduceEvent(store, {
      id: '4',
      ts: 3100,
      type: 'node.updated',
      payload: { runId: 'r1', nodeId: 'n1', status: 'working', delta: 'editing auth.ts' },
    });
    expect(store.getState().nodes[0].delta).toBe('editing auth.ts');

    reduceEvent(store, {
      id: '5',
      ts: 3200,
      type: 'node.finished',
      payload: { runId: 'r1', nodeId: 'n1', status: 'completed' },
    });
    expect(store.getState().nodes[0].status).toBe('completed');
  });

  it('sets waiting_approval on approval.requested', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '6',
      ts: 4000,
      type: 'approval.requested',
      payload: {
        requestId: 'req-1',
        kind: 'plan',
        description: 'Approve plan to modify auth.ts',
      },
    });
    expect(store.getState().status).toBe('waiting_approval');
    expect(store.getState().pendingApproval?.description).toBe('Approve plan to modify auth.ts');
  });

  it('sets exhausted on pool.exhausted', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '7',
      ts: 5000,
      type: 'pool.exhausted',
      payload: { runId: 'r1', message: 'All free quotas exhausted' },
    });
    expect(store.getState().status).toBe('exhausted');
    expect(store.getState().statusDetail).toBe('All free quotas exhausted');
  });
});
