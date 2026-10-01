import { describe, expect, it, vi } from 'vitest';
import { FlappyEventBus } from '@flappycode/core';

describe('FlappyEventBus Unit Tests', () => {
  it('delivers typed events to registered listeners', () => {
    const bus = new FlappyEventBus();
    const handler = vi.fn();

    bus.on('run.started', handler);
    bus.emit({
      type: 'run.started',
      run_id: 'run_123',
      prompt: 'hello world',
      timestamp: Date.now(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'run.started',
        run_id: 'run_123',
      })
    );
  });

  it('unsubscribes via returned function', () => {
    const bus = new FlappyEventBus();
    const handler = vi.fn();

    const unsub = bus.on('run.started', handler);
    bus.emit({
      type: 'run.started',
      run_id: 'run_1',
      prompt: 'test',
      timestamp: Date.now(),
    });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();

    bus.emit({
      type: 'run.started',
      run_id: 'run_2',
      prompt: 'test2',
      timestamp: Date.now(),
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes via off() method', () => {
    const bus = new FlappyEventBus();
    const handler = vi.fn();

    bus.on('run.completed', handler);
    bus.emit({
      type: 'run.completed',
      run_id: 'run_1',
      duration_ms: 100,
      nodes_completed: 1,
      models_used: ['mock'],
      paid_calls: 0,
      files_changed: ['hello.cpp'],
      summary: 'done',
      timestamp: Date.now(),
    });
    expect(handler).toHaveBeenCalledTimes(1);

    bus.off('run.completed', handler);

    bus.emit({
      type: 'run.completed',
      run_id: 'run_2',
      duration_ms: 100,
      nodes_completed: 1,
      models_used: ['mock'],
      paid_calls: 0,
      files_changed: ['hello.cpp'],
      summary: 'done again',
      timestamp: Date.now(),
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes via removeListener() alias', () => {
    const bus = new FlappyEventBus();
    const handler = vi.fn();

    bus.on('run.started', handler);
    bus.removeListener('run.started', handler);

    bus.emit({
      type: 'run.started',
      run_id: 'run_1',
      prompt: 'test',
      timestamp: Date.now(),
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
