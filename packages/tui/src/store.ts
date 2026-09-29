import { createStore } from 'zustand/vanilla';
import { FlappyEvent, EventBus } from '@flappycode/protocol';

export type UIStatus = 'ready' | 'working' | 'waiting_approval' | 'exhausted' | 'no_providers';

export interface UINodeState {
  nodeId: string;
  agent: string;
  model: string;
  status: string;
  message?: string;
  delta?: string;
}

export interface UIState {
  sessionId?: string;
  projectPath?: string;
  providersCount: number;
  freeModelCount: number;
  rateLimitedFreeCount: number;
  totalModelCount: number;
  status: UIStatus;
  statusDetail?: string;
  nodes: UINodeState[];
  pendingApproval: {
    requestId: string;
    kind: 'plan' | 'diff' | 'permission' | 'pool_exhausted';
    description: string;
    details?: Record<string, unknown>;
  } | null;
  logs: string[];
}

export type UIStore = ReturnType<typeof createUIStore>;

export function createUIStore(initial?: Partial<UIState>) {
  return createStore<UIState>(() => ({
    providersCount: 0,
    freeModelCount: 0,
    rateLimitedFreeCount: 0,
    totalModelCount: 0,
    status: 'no_providers',
    nodes: [],
    pendingApproval: null,
    logs: [],
    ...initial,
  }));
}

/**
 * Reduce an engine event into the UI store state.
 */
export function reduceEvent(store: UIStore, event: FlappyEvent): void {
  const state = store.getState();

  switch (event.type) {
    case 'session.started': {
      store.setState({
        sessionId: event.payload.sessionId,
        projectPath: event.payload.projectPath,
      });
      break;
    }

    case 'registry.updated': {
      const providersCount = event.payload.providersCount;
      const freeModelCount = event.payload.freeModels;
      const newStatus: UIStatus =
        providersCount === 0 ? 'no_providers' : state.status === 'no_providers' ? 'ready' : state.status;

      store.setState({
        providersCount,
        freeModelCount,
        rateLimitedFreeCount: event.payload.rateLimitedFreeModels,
        totalModelCount: event.payload.totalModels,
        status: newStatus,
      });
      break;
    }

    case 'node.started': {
      const existing = state.nodes.filter((n) => n.nodeId !== event.payload.nodeId);
      store.setState({
        status: 'working',
        nodes: [
          ...existing,
          {
            nodeId: event.payload.nodeId,
            agent: event.payload.agent,
            model: event.payload.model,
            status: 'running',
          },
        ],
      });
      break;
    }

    case 'node.updated': {
      const updated = state.nodes.map((n) => {
        if (n.nodeId === event.payload.nodeId) {
          return {
            ...n,
            status: event.payload.status,
            message: event.payload.message ?? n.message,
            delta: event.payload.delta ?? n.delta,
          };
        }
        return n;
      });
      store.setState({
        status: 'working',
        statusDetail: event.payload.message,
        nodes: updated,
      });
      break;
    }

    case 'node.finished': {
      const updated = state.nodes.map((n) => {
        if (n.nodeId === event.payload.nodeId) {
          return { ...n, status: event.payload.status };
        }
        return n;
      });
      store.setState({ nodes: updated });
      break;
    }

    case 'approval.requested': {
      store.setState({
        status: 'waiting_approval',
        pendingApproval: {
          requestId: event.payload.requestId,
          kind: event.payload.kind,
          description: event.payload.description,
          details: event.payload.details,
        },
      });
      break;
    }

    case 'pool.exhausted': {
      store.setState({
        status: 'exhausted',
        statusDetail: event.payload.message,
      });
      break;
    }

    case 'run.completed': {
      store.setState({
        status: 'ready',
        statusDetail: event.payload.summary,
      });
      break;
    }

    case 'run.failed': {
      store.setState({
        status: 'ready',
        statusDetail: `Run failed: ${event.payload.error}`,
      });
      break;
    }

    case 'log': {
      store.setState({
        logs: [...state.logs.slice(-49), event.payload.message],
      });
      break;
    }
  }
}

/**
 * Connect the UI store to an EventBus to automatically reduce emitted events.
 */
export function bindStoreToBus(store: UIStore, bus: EventBus): () => void {
  return bus.on((event) => {
    reduceEvent(store, event);
  });
}
