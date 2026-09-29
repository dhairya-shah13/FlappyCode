import { TaskGraph } from './domain.js';

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a TaskGraph for structural correctness:
 * 1. Node IDs must be non-empty and unique.
 * 2. Every dependency in dependsOn must reference an existing node ID.
 * 3. The graph must be strictly acyclic (DAG).
 */
export function validateTaskGraph(graph: TaskGraph): GraphValidationResult {
  const errors: string[] = [];

  if (!graph.nodes || graph.nodes.length === 0) {
    return {
      valid: false,
      errors: ['TaskGraph must contain at least one node.'],
    };
  }

  const nodeMap = new Map<string, (typeof graph.nodes)[number]>();
  const idCounts = new Map<string, number>();

  for (const node of graph.nodes) {
    idCounts.set(node.id, (idCounts.get(node.id) ?? 0) + 1);
    if (!nodeMap.has(node.id)) {
      nodeMap.set(node.id, node);
    }
  }

  // 1. Check duplicate IDs
  for (const [id, count] of idCounts.entries()) {
    if (count > 1) {
      errors.push(`Duplicate node id "${id}" found ${count} times.`);
    }
  }

  // 2. Check missing dependencies and self-dependencies
  for (const node of graph.nodes) {
    for (const depId of node.dependsOn) {
      if (depId === node.id) {
        errors.push(`Node "${node.id}" cannot depend on itself.`);
      } else if (!nodeMap.has(depId)) {
        errors.push(`Node "${node.id}" depends on non-existent node "${depId}".`);
      }
    }
  }

  // 3. Cycle detection using Kahn's algorithm (topological sort)
  if (errors.length === 0) {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of graph.nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const node of graph.nodes) {
      for (const depId of node.dependsOn) {
        // depId -> node.id (depId must complete before node.id can start)
        const targets = adjacency.get(depId);
        if (targets) {
          targets.push(node.id);
        }
        inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      visitedCount++;

      const neighbors = adjacency.get(current) ?? [];
      for (const neighbor of neighbors) {
        const nextDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, nextDegree);
        if (nextDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (visitedCount !== graph.nodes.length) {
      errors.push('TaskGraph contains a cycle (circular dependency detected).');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
