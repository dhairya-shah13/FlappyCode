import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { EventBus } from '@flappycode/protocol';
import { replay } from '../replay.js';
import { createUIStore, bindStoreToBus } from '../store.js';

describe('replay', () => {
  const fixturesDir = path.resolve(__dirname, '../../../../fixtures');

  it('replays home-ready.jsonl and brings store to ready state', async () => {
    const bus = new EventBus();
    const store = createUIStore();
    bindStoreToBus(store, bus);

    const fixturePath = path.join(fixturesDir, 'home-ready.jsonl');
    const events = await replay(bus, fixturePath);

    expect(events.length).toBeGreaterThan(0);
    expect(store.getState().status).toBe('ready');
    expect(store.getState().providersCount).toBe(4);
    expect(store.getState().freeModelCount).toBe(14);
  });

  it('replays home-empty.jsonl with 0 providers', async () => {
    const bus = new EventBus();
    const store = createUIStore();
    bindStoreToBus(store, bus);

    const fixturePath = path.join(fixturesDir, 'home-empty.jsonl');
    const events = await replay(bus, fixturePath);

    expect(events.length).toBeGreaterThan(0);
    expect(store.getState().status).toBe('no_providers');
    expect(store.getState().providersCount).toBe(0);
  });

  it('replays home-working.jsonl with active task nodes', async () => {
    const bus = new EventBus();
    const store = createUIStore();
    bindStoreToBus(store, bus);

    const fixturePath = path.join(fixturesDir, 'home-working.jsonl');
    const events = await replay(bus, fixturePath);

    expect(events.length).toBeGreaterThan(0);
    expect(store.getState().status).toBe('working');
    expect(store.getState().nodes.length).toBeGreaterThanOrEqual(1);
  });
});
