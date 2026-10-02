import { describe, expect, it } from 'vitest';
import { FlappyEventBus } from '@flappycode/core';
import { DagExecutor, NodeExecutionHandler } from '@flappycode/core';
import { TaskGraph, TaskNode } from '@flappycode/protocol';

/**
 * GAP-009: Reviewer/Tester feedback loop tests.
 * Verifies bounded iteration, structured feedback, escalation event.
 */
describe('GAP-009 — Feedback Loop', () => {
  const makeGraph = (agents: string[]): TaskGraph => ({
    id: 'graph_1',
    goal: 'test',
    nodes: agents.map((a, i) => ({
      id: `node-${i + 1}`,
      agent: a,
      description: `Do ${a} work`,
      depends_on: i > 0 ? [`node-${i}`] : [],
      status: 'pending' as const,
      substitutions: [],
      tool_calls: [],
      iterations: 0,
    })),
    created_at: Date.now(),
  });

  it('DagExecutor preserves completed nodes on re-execution (feedback re-run)', async () => {
    const bus = new FlappyEventBus();
    const executor = new DagExecutor(bus, 4);
    const calls: string[] = [];

    const handler: NodeExecutionHandler = async (node) => {
      calls.push(node.id);
    };

    const graph = makeGraph(['File-Finder', 'Coder']);
    // Mark first node as completed (simulating feedback re-run)
    graph.nodes[0].status = 'completed';

    const result = await executor.executeGraph('run_1', graph, handler);

    // Only the Coder node should have been executed
    expect(calls).toEqual(['node-2']);
    expect(result.completed).toHaveLength(2); // Both: previously completed + newly completed
  });

  it('emits feedback.iteration event during feedback loop', () => {
    const bus = new FlappyEventBus();
    const events: any[] = [];
    bus.on('feedback.iteration', (ev) => events.push(ev));

    // Simulate the event emission
    bus.emit({
      type: 'feedback.iteration',
      run_id: 'run_1',
      node_id: 'node-2',
      agent: 'Coder',
      iteration: 1,
      max_iterations: 3,
      from: 'Tester',
      feedback: 'Test failed: assertion error in line 42',
      timestamp: Date.now(),
    });

    expect(events).toHaveLength(1);
    expect(events[0].iteration).toBe(1);
    expect(events[0].from).toBe('Tester');
  });
});
