import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../app.js';
import { createUIStore, reduceEvent } from '../store.js';

describe('App component (ink-testing-library)', () => {
  it('renders home-ready state with connected providers and free models', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '1',
      ts: 1000,
      type: 'registry.updated',
      payload: {
        providersCount: 4,
        freeModels: 14,
        rateLimitedFreeModels: 9,
        totalModels: 320,
      },
    });

    const { lastFrame } = render(<App store={store} version="0.1.0" />);
    const frame = lastFrame();

    expect(frame).toContain('FLAPPY');
    expect(frame).toContain('CODE');
    expect(frame).toContain('Multi-Provider • Multi-Agent • Free Models • One Assistant');
    expect(frame).toContain('Providers: 4 connected');
    expect(frame).toContain('Free models: 14 available');
    expect(frame).toContain('⚡ Ready!');
  });

  it('renders home-empty state when 0 providers', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '1',
      ts: 1000,
      type: 'registry.updated',
      payload: {
        providersCount: 0,
        freeModels: 0,
        rateLimitedFreeModels: 0,
        totalModels: 0,
      },
    });

    const { lastFrame } = render(<App store={store} version="0.1.0" />);
    const frame = lastFrame();

    expect(frame).toContain('Providers: 0 connected');
    expect(frame).toContain('○ No providers connected');
  });

  it('renders working state with active nodes', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '1',
      ts: 1000,
      type: 'registry.updated',
      payload: {
        providersCount: 4,
        freeModels: 14,
        rateLimitedFreeModels: 9,
        totalModels: 320,
      },
    });
    reduceEvent(store, {
      id: '2',
      ts: 2000,
      type: 'node.started',
      payload: {
        runId: 'r1',
        nodeId: 'n1',
        agent: 'coder',
        model: 'groq/llama-3.3-70b',
      },
    });
    reduceEvent(store, {
      id: '3',
      ts: 2100,
      type: 'node.updated',
      payload: {
        runId: 'r1',
        nodeId: 'n1',
        status: 'working',
        delta: 'auth.ts',
        message: 'Working… 3/7 nodes',
      },
    });

    const { lastFrame } = render(<App store={store} version="0.1.0" />);
    const frame = lastFrame();

    expect(frame).toContain('Active Tasks:');
    expect(frame).toContain('coder');
    expect(frame).toContain('groq/llama-3.3-70b');
    expect(frame).toContain('Working… 3/7 nodes');
  });
});
