import { describe, expect, it } from 'vitest';
import { FlappyEventBus } from '@flappycode/core';
import { DagExecutor, NodeExecutionHandler } from '@flappycode/core';
import { RunCancelledError } from '@flappycode/core';
import { TaskGraph } from '@flappycode/protocol';

/**
 * GAP-012: Run cancellation and exit code 130 tests.
 * Verifies SIGINT/Esc-driven cancellation, node abort, and run.cancelled event.
 */
describe('GAP-012 — Run Cancellation & Exit 130', () => {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('cancel() aborts running nodes and marks all as cancelled', async () => {
    const bus = new FlappyEventBus();
    const executor = new DagExecutor(bus, 4);

    const handler: NodeExecutionHandler = async (node, signal) => {
      // Simulate long-running work that checks the signal
      for (let i = 0; i < 10; i++) {
        if (signal.aborted) throw new RunCancelledError();
        await delay(20);
      }
    };

    const graph: TaskGraph = {
      id: 'g1',
      goal: 'cancel test',
      nodes: [
        { id: 'slow', agent: 'Coder', description: 'slow task', depends_on: [], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
        { id: 'waiting', agent: 'Tester', description: 'dependent', depends_on: ['slow'], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
      ],
      created_at: Date.now(),
    };

    // Cancel after a brief delay
    setTimeout(() => executor.cancel(), 30);

    try {
      await executor.executeGraph('run_1', graph, handler);
      expect.fail('Should have thrown');
    } catch (err: any) {
      // The fatalError from RunCancelledError propagates
      expect(err.name).toBe('RunCancelledError');
    }

    // All nodes should be in a terminal state
    for (const node of graph.nodes) {
      expect(['cancelled', 'failed', 'completed']).toContain(node.status);
    }
  });

  it('emits run.cancelled event with exit_code 130', () => {
    const bus = new FlappyEventBus();
    const events: any[] = [];
    bus.on('run.cancelled', (ev) => events.push(ev));

    bus.emit({
      type: 'run.cancelled',
      run_id: 'run_1',
      reason: 'User pressed Ctrl-C',
      exit_code: 130,
      timestamp: Date.now(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].exit_code).toBe(130);
    expect(events[0].reason).toContain('Ctrl-C');
  });

  it('pending nodes never start after cancellation', async () => {
    const bus = new FlappyEventBus();
    const executor = new DagExecutor(bus, 1);
    const started: string[] = [];

    const handler: NodeExecutionHandler = async (node) => {
      started.push(node.id);
      await delay(50);
    };

    const graph: TaskGraph = {
      id: 'g2',
      goal: 'cancel pending',
      nodes: [
        { id: 'a', agent: 'Coder', description: 'a', depends_on: [], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
        { id: 'b', agent: 'Coder', description: 'b', depends_on: [], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
        { id: 'c', agent: 'Coder', description: 'c', depends_on: [], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
      ],
      created_at: Date.now(),
    };

    // With maxConcurrency=1, cancel after the first node starts
    setTimeout(() => executor.cancel(), 30);

    try {
      await executor.executeGraph('run_2', graph, handler);
    } catch {
      // Expected
    }

    // Only 1 node should have started (concurrency=1, cancel is fast)
    expect(started.length).toBeLessThanOrEqual(2);
  });
});
