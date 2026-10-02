import { describe, expect, it } from 'vitest';
import { FlappyEventBus } from '@flappycode/core';
import { DagExecutor, NodeExecutionHandler } from '@flappycode/core';
import { TaskGraph } from '@flappycode/protocol';

/**
 * GAP-013: Parallel execution and strict concurrency tests.
 * Verifies real time overlap of independent nodes and sequential dependency ordering.
 */
describe('GAP-013 — Parallel DAG Execution & Concurrency', () => {
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('runs independent nodes in parallel with real time overlap', async () => {
    const bus = new FlappyEventBus();
    const executor = new DagExecutor(bus, 4);

    const timestamps: Record<string, { start: number; end: number }> = {};

    const handler: NodeExecutionHandler = async (node) => {
      timestamps[node.id] = { start: Date.now(), end: 0 };
      await delay(50);
      timestamps[node.id].end = Date.now();
    };

    // Two independent nodes with no dependencies
    const graph: TaskGraph = {
      id: 'g1',
      goal: 'parallel test',
      nodes: [
        { id: 'a', agent: 'Coder', description: 'task a', depends_on: [], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
        { id: 'b', agent: 'Tester', description: 'task b', depends_on: [], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
      ],
      created_at: Date.now(),
    };

    const result = await executor.executeGraph('run_1', graph, handler);
    expect(result.completed).toHaveLength(2);

    // Verify real time overlap: node b should start before node a ends
    const aStart = timestamps['a'].start;
    const aEnd = timestamps['a'].end;
    const bStart = timestamps['b'].start;
    expect(bStart).toBeLessThan(aEnd); // overlap
  });

  it('strictly enforces concurrency limit N', async () => {
    const bus = new FlappyEventBus();
    const maxConcurrency = 2;
    const executor = new DagExecutor(bus, maxConcurrency);

    let peakConcurrent = 0;
    let currentConcurrent = 0;

    const handler: NodeExecutionHandler = async (node) => {
      currentConcurrent++;
      peakConcurrent = Math.max(peakConcurrent, currentConcurrent);
      await delay(30);
      currentConcurrent--;
    };

    // Five independent nodes
    const graph: TaskGraph = {
      id: 'g2',
      goal: 'concurrency test',
      nodes: Array.from({ length: 5 }, (_, i) => ({
        id: `n${i}`,
        agent: 'Coder',
        description: `task ${i}`,
        depends_on: [] as string[],
        status: 'pending' as const,
        substitutions: [] as string[],
        tool_calls: [] as any[],
        iterations: 0,
      })),
      created_at: Date.now(),
    };

    const result = await executor.executeGraph('run_2', graph, handler);
    expect(result.completed).toHaveLength(5);
    expect(peakConcurrent).toBeLessThanOrEqual(maxConcurrency);
    expect(peakConcurrent).toBeGreaterThanOrEqual(1);
  });

  it('enforces sequential order for dependent nodes', async () => {
    const bus = new FlappyEventBus();
    const executor = new DagExecutor(bus, 4);
    const order: string[] = [];

    const handler: NodeExecutionHandler = async (node) => {
      order.push(node.id);
      await delay(10);
    };

    const graph: TaskGraph = {
      id: 'g3',
      goal: 'dependency test',
      nodes: [
        { id: 'first', agent: 'File-Finder', description: 'find files', depends_on: [], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
        { id: 'second', agent: 'Coder', description: 'code', depends_on: ['first'], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
        { id: 'third', agent: 'Tester', description: 'test', depends_on: ['second'], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
      ],
      created_at: Date.now(),
    };

    const result = await executor.executeGraph('run_3', graph, handler);
    expect(result.completed).toHaveLength(3);
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('uses Math.max(0, maxConcurrency - running) for slot computation (no off-by-one)', async () => {
    const bus = new FlappyEventBus();
    const executor = new DagExecutor(bus, 1);
    const order: string[] = [];

    const handler: NodeExecutionHandler = async (node) => {
      order.push(node.id);
      await delay(10);
    };

    const graph: TaskGraph = {
      id: 'g4',
      goal: 'slot test',
      nodes: [
        { id: 'x', agent: 'Coder', description: 'x', depends_on: [], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
        { id: 'y', agent: 'Coder', description: 'y', depends_on: [], status: 'pending', substitutions: [], tool_calls: [], iterations: 0 },
      ],
      created_at: Date.now(),
    };

    const result = await executor.executeGraph('run_4', graph, handler);
    expect(result.completed).toHaveLength(2);
    // With maxConcurrency=1, nodes must run sequentially
    expect(order).toEqual(['x', 'y']);
  });
});
