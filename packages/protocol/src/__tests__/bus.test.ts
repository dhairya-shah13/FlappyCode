import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../bus.js';
import { LogEvent } from '../events.js';

describe('EventBus', () => {
  it('delivers events to on() listeners', () => {
    const bus = new EventBus();
    const received: string[] = [];

    const unsubscribe = bus.on((event) => {
      received.push(event.type);
    });

    const logEvt: LogEvent = {
      id: 'log-1',
      ts: Date.now(),
      type: 'log',
      payload: { level: 'info', message: 'Hello world' },
    };

    bus.emit(logEvt);
    expect(received).toEqual(['log']);

    unsubscribe();
    bus.emit(logEvt);
    expect(received).toHaveLength(1);
  });

  it('delivers events to onType() listeners', () => {
    const bus = new EventBus();
    const receivedMessages: string[] = [];

    bus.onType('log', (event) => {
      receivedMessages.push(event.payload.message);
    });

    bus.emit({
      id: '1',
      ts: Date.now(),
      type: 'registry.updated',
      payload: { totalModels: 1, freeModels: 1, rateLimitedFreeModels: 0, providersCount: 1 },
    });

    bus.emit({
      id: '2',
      ts: Date.now(),
      type: 'log',
      payload: { level: 'debug', message: 'Specific message' },
    });

    expect(receivedMessages).toEqual(['Specific message']);
  });

  it('resolves once() when expected event arrives', async () => {
    const bus = new EventBus();

    const promise = bus.once('run.completed');

    bus.emit({
      id: '3',
      ts: Date.now(),
      type: 'run.completed',
      payload: { runId: 'r1', summary: 'done', durationMs: 100, paidCalls: 0 },
    });

    const result = await promise;
    expect(result.type).toBe('run.completed');
    expect(result.payload.summary).toBe('done');
  });

  it('times out in once() when event does not arrive', async () => {
    const bus = new EventBus();
    await expect(bus.once('run.completed', 50)).rejects.toThrow('Timed out waiting for event');
  });

  it('supports async iterator', async () => {
    const bus = new EventBus();
    const emitted: string[] = [];

    const consumer = (async () => {
      for await (const event of bus) {
        emitted.push(event.type);
        if (event.type === 'run.completed') {
          break;
        }
      }
    })();

    bus.emit({
      id: '1',
      ts: Date.now(),
      type: 'node.started',
      payload: { runId: 'r1', nodeId: 'n1', agent: 'coder', model: 'm1' },
    });

    bus.emit({
      id: '2',
      ts: Date.now(),
      type: 'run.completed',
      payload: { runId: 'r1', summary: 'done', durationMs: 50, paidCalls: 0 },
    });

    await consumer;
    expect(emitted).toEqual(['node.started', 'run.completed']);
  });

  it('handles errors inside handlers without throwing to emitter', () => {
    const bus = new EventBus();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.on(() => {
      throw new Error('Boom');
    });

    expect(() => {
      bus.emit({
        id: '1',
        ts: Date.now(),
        type: 'log',
        payload: { level: 'info', message: 'test' },
      });
    }).not.toThrow();

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
