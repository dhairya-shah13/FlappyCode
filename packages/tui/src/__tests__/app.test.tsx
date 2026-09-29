import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { App } from '../app.js';
import { createUIStore, reduceEvent } from '../store.js';

describe('App component (ink-testing-library)', () => {
  it('renders home-ready state at 120 columns (full tier)', () => {
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

    const { lastFrame } = render(<App store={store} width={120} height={30} version="0.1.0" />);
    const frame = lastFrame();

    expect(frame).toContain('Multi-Provider • Multi-Agent • Free Models • One Assistant');
    expect(frame).toContain('Your connected providers. All the free models.');
    expect(frame).toContain('FlappyCode v0.1.0');
    expect(frame).toContain('Providers: 4 connected');
    expect(frame).toContain('Free models: 14 available');
    expect(frame).toContain('⚡ Ready!');
  });

  it('renders home-ready state at 90 columns (wordmark tier)', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '1',
      ts: 1000,
      type: 'registry.updated',
      payload: {
        providersCount: 3,
        freeModels: 8,
        rateLimitedFreeModels: 2,
        totalModels: 150,
      },
    });

    const { lastFrame } = render(<App store={store} width={90} height={30} version="0.1.0" />);
    const frame = lastFrame();

    expect(frame).toContain('Multi-Provider • Multi-Agent • Free Models • One Assistant');
    expect(frame).toContain('Your connected providers. All the free models.');
    expect(frame).toContain('3 providers');
    expect(frame).toContain('8 free models');
    expect(frame).toContain('⚡ Ready!');
  });

  it('renders compact state at 60 columns (compact tier)', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '1',
      ts: 1000,
      type: 'registry.updated',
      payload: {
        providersCount: 2,
        freeModels: 5,
        rateLimitedFreeModels: 0,
        totalModels: 50,
      },
    });

    const { lastFrame } = render(<App store={store} width={60} height={30} version="0.1.0" />);
    const frame = lastFrame();

    // At 60 columns, line 1 tagline is omitted, line 2 is retained
    expect(frame).not.toContain('Multi-Provider • Multi-Agent • Free Models • One Assistant');
    expect(frame).toContain('Your connected providers. All the free models.');
    // Compact status bar format
    expect(frame).toContain('2 prov │ 5 free');
  });

  it('renders minimal state at 40 columns (minimal tier)', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '1',
      ts: 1000,
      type: 'registry.updated',
      payload: {
        providersCount: 1,
        freeModels: 2,
        rateLimitedFreeModels: 0,
        totalModels: 10,
      },
    });

    const { lastFrame } = render(<App store={store} width={40} height={30} version="0.1.0" />);
    const frame = lastFrame();

    // Banner and taglines are omitted at minimal tier
    expect(frame).not.toContain('Multi-Provider');
    expect(frame).toContain('FlappyCode');
  });

  it('renders home-empty state when 0 providers connected', () => {
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

    const { lastFrame } = render(<App store={store} width={100} height={30} version="0.1.0" />);
    const frame = lastFrame();

    expect(frame).toContain('0 providers');
    expect(frame).toContain('○ No providers — press / then "providers add"');
    expect(frame).toContain('No provider connected. Run /providers add');
  });

  it('renders working state with collapsed header and active task nodes', () => {
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

    const { lastFrame } = render(<App store={store} width={100} height={30} version="0.1.0" />);
    const frame = lastFrame();

    // Header collapses to 1-line FLAPPYCODE v0.1.0
    expect(frame).toContain('Active Tasks:');
    expect(frame).toContain('coder');
    expect(frame).toContain('groq/llama-3.3-70b');
    expect(frame).toContain('Working… 3/7 nodes');
    // Large banner should be collapsed
    expect(frame).not.toContain('Multi-Provider • Multi-Agent');
  });

  it('renders pending approval banner when requested', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '1',
      ts: 1000,
      type: 'approval.requested',
      payload: {
        requestId: 'req-1',
        kind: 'permission',
        description: 'Allow bash execution of `npm install`?',
      },
    });

    const { lastFrame } = render(<App store={store} width={100} height={30} version="0.1.0" />);
    const frame = lastFrame();

    expect(frame).toContain('Approval Needed: permission');
    expect(frame).toContain('Allow bash execution of `npm install`?');
    expect(frame).toContain('● Waiting for approval');
  });

  it('renders free pool exhausted warning', () => {
    const store = createUIStore();
    reduceEvent(store, {
      id: '1',
      ts: 1000,
      type: 'pool.exhausted',
      payload: {
        runId: 'r1',
        message: 'All free tiers exhausted',
      },
    });

    const { lastFrame } = render(<App store={store} width={100} height={30} version="0.1.0" />);
    const frame = lastFrame();

    expect(frame).toContain('✖ Free pool exhausted');
  });
});
