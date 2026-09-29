import { describe, it, expect } from 'vitest';
import { validateTaskGraph } from '../graph.js';
import { TaskGraph } from '../domain.js';

describe('validateTaskGraph', () => {
  it('passes for a valid linear DAG', () => {
    const graph: TaskGraph = {
      nodes: [
        { id: 'step-1', agent: 'file-finder', description: 'Locate files', dependsOn: [], status: 'pending' },
        { id: 'step-2', agent: 'coder', description: 'Edit code', dependsOn: ['step-1'], status: 'pending' },
        { id: 'step-3', agent: 'tester', description: 'Run tests', dependsOn: ['step-2'], status: 'pending' },
      ],
    };
    const res = validateTaskGraph(graph);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('passes for a valid diamond (converging) DAG', () => {
    const graph: TaskGraph = {
      nodes: [
        { id: 'start', agent: 'planner', description: 'Start', dependsOn: [], status: 'pending' },
        { id: 'branch-a', agent: 'coder', description: 'Do A', dependsOn: ['start'], status: 'pending' },
        { id: 'branch-b', agent: 'coder', description: 'Do B', dependsOn: ['start'], status: 'pending' },
        { id: 'merge', agent: 'reviewer', description: 'Review both', dependsOn: ['branch-a', 'branch-b'], status: 'pending' },
      ],
    };
    const res = validateTaskGraph(graph);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('fails for empty nodes', () => {
    const graph: TaskGraph = { nodes: [] };
    const res = validateTaskGraph(graph);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('at least one node');
  });

  it('fails for duplicate node IDs', () => {
    const graph: TaskGraph = {
      nodes: [
        { id: 'node-1', agent: 'coder', description: 'First', dependsOn: [], status: 'pending' },
        { id: 'node-1', agent: 'tester', description: 'Duplicate', dependsOn: [], status: 'pending' },
      ],
    };
    const res = validateTaskGraph(graph);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('Duplicate node id "node-1"');
  });

  it('fails for self dependency', () => {
    const graph: TaskGraph = {
      nodes: [
        { id: 'loop', agent: 'coder', description: 'Self loop', dependsOn: ['loop'], status: 'pending' },
      ],
    };
    const res = validateTaskGraph(graph);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('cannot depend on itself');
  });

  it('fails for non-existent dependency', () => {
    const graph: TaskGraph = {
      nodes: [
        { id: 'step-1', agent: 'coder', description: 'Task', dependsOn: ['missing-node'], status: 'pending' },
      ],
    };
    const res = validateTaskGraph(graph);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('depends on non-existent node "missing-node"');
  });

  it('detects simple direct cycle (A -> B -> A)', () => {
    const graph: TaskGraph = {
      nodes: [
        { id: 'a', agent: 'coder', description: 'A', dependsOn: ['b'], status: 'pending' },
        { id: 'b', agent: 'tester', description: 'B', dependsOn: ['a'], status: 'pending' },
      ],
    };
    const res = validateTaskGraph(graph);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('circular dependency detected');
  });

  it('detects complex indirect cycle (A -> B -> C -> D -> B)', () => {
    const graph: TaskGraph = {
      nodes: [
        { id: 'a', agent: 'planner', description: 'A', dependsOn: [], status: 'pending' },
        { id: 'b', agent: 'coder', description: 'B', dependsOn: ['a', 'd'], status: 'pending' },
        { id: 'c', agent: 'reviewer', description: 'C', dependsOn: ['b'], status: 'pending' },
        { id: 'd', agent: 'tester', description: 'D', dependsOn: ['c'], status: 'pending' },
      ],
    };
    const res = validateTaskGraph(graph);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('circular dependency detected');
  });
});
