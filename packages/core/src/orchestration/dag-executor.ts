import { TaskGraph, TaskNode } from '@flappycode/protocol';
import { FlappyEventBus } from '../events/event-bus.js';

export type NodeExecutionHandler = (node: TaskNode, signal: AbortSignal) => Promise<void>;

/** Errors that must abort the whole graph instead of failing a single node. */
const FATAL_ERROR_NAMES = new Set(['PoolExhaustedError', 'RunCancelledError', 'ModelFallbackAbortError']);

export class DagExecutor {
  private abortController: AbortController | null = null;
  private isCancelled = false;
  /** Set when a fatal (graph-level) error occurred during this execution. */
  public fatalError: Error | null = null;

  constructor(
    private eventBus: FlappyEventBus,
    private maxConcurrency = 4
  ) {}

  public cancel(): void {
    this.isCancelled = true;
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  public async executeGraph(
    runId: string,
    graph: TaskGraph,
    handler: NodeExecutionHandler
  ): Promise<{ completed: TaskNode[]; failed: TaskNode[]; cancelled: boolean }> {
    this.isCancelled = false;
    this.fatalError = null;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const nodesMap = new Map<string, TaskNode>();
    const completed = new Set<string>();
    const failed = new Set<string>();
    const running = new Set<string>();
    const outstanding: Promise<void>[] = [];

    // Preserve already-completed nodes so a resumed/feedback re-run only
    // executes pending work (session resume + feedback loop).
    for (const n of graph.nodes) {
      const status = n.status === 'completed' ? 'completed' : 'pending';
      nodesMap.set(n.id, { ...n, status });
      if (status === 'completed') {
        completed.add(n.id);
      }
    }

    const getReadyNodes = (): TaskNode[] => {
      const ready: TaskNode[] = [];
      for (const [id, node] of nodesMap.entries()) {
        if (node.status === 'pending' && !running.has(id)) {
          const depsOk = node.depends_on.every((dep) => completed.has(dep));
          if (depsOk) {
            ready.push(node);
          }
        }
      }
      return ready;
    };

    while (
      completed.size + failed.size < nodesMap.size &&
      !this.isCancelled &&
      this.fatalError === null
    ) {
      const ready = getReadyNodes();
      if (ready.length === 0 && running.size === 0) {
        // Deadlock or dependency failed
        break;
      }

      // Exact concurrency cap: never admit more than free slots (no off-by-one).
      const slotsAvailable = Math.max(0, this.maxConcurrency - running.size);
      const toStart = ready.slice(0, Math.min(ready.length, slotsAvailable));

      const promises = toStart.map(async (node) => {
        running.add(node.id);
        node.status = 'running';
        node.started_at = Date.now();
        this.eventBus.emit({
          type: 'node.started',
          run_id: runId,
          node,
          timestamp: Date.now(),
        });

        try {
          if (this.isCancelled) {
            node.status = 'cancelled';
            node.ended_at = Date.now();
            return;
          }
          await handler(node, signal);
          if (this.isCancelled || signal.aborted) {
            node.status = 'cancelled';
            node.ended_at = Date.now();
            return;
          }
          node.status = 'completed';
          node.ended_at = Date.now();
          completed.add(node.id);
          this.eventBus.emit({
            type: 'node.finished',
            run_id: runId,
            node,
            timestamp: Date.now(),
          });
        } catch (err: any) {
          node.ended_at = Date.now();
          if (err?.name === 'RunCancelledError' || this.isCancelled) {
            node.status = 'cancelled';
            node.error = err?.message;
            // Preserve the original fatal cause (e.g. pool exhaustion) if already set.
            if (err?.name === 'RunCancelledError' && !this.fatalError) {
              this.fatalError = err;
            }
          } else if (FATAL_ERROR_NAMES.has(err?.name)) {
            node.status = 'failed';
            node.error = err.message;
            this.fatalError = err;
            // Stop in-flight siblings promptly; their work state stays consistent.
            this.abortController?.abort();
          } else {
            node.status = 'failed';
            node.error = err.message;
            failed.add(node.id);
          }
          this.eventBus.emit({
            type: 'node.finished',
            run_id: runId,
            node,
            timestamp: Date.now(),
          });
        } finally {
          running.delete(node.id);
        }
      });
      outstanding.push(...promises);

      if (promises.length > 0) {
        // Wait for at least one started node to settle, then reschedule — the
        // slot computation below keeps the cap exact (no off-by-one admission).
        await Promise.race(promises);
      } else {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    // Ensure no handlers are left dangling before returning/throwing.
    if (outstanding.length > 0) {
      await Promise.allSettled(outstanding);
    }

    // On cancellation, no node may remain in a non-terminal state.
    if (this.isCancelled) {
      for (const node of nodesMap.values()) {
        if (node.status === 'pending' || node.status === 'running') {
          node.status = 'cancelled';
          node.ended_at = Date.now();
          this.eventBus.emit({
            type: 'node.finished',
            run_id: runId,
            node,
            timestamp: Date.now(),
          });
        }
      }
    }

    const allNodes = Array.from(nodesMap.values());
    const result = {
      completed: allNodes.filter((n) => n.status === 'completed'),
      failed: allNodes.filter((n) => n.status === 'failed'),
      cancelled: this.isCancelled,
    };

    if (this.fatalError) {
      throw Object.assign(this.fatalError, { graphResult: result });
    }
    return result;
  }
}
