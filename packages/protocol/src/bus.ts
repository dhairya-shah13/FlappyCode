import { FlappyEvent } from './events.js';

export type EventHandler = (event: FlappyEvent) => void;
export type TypedEventHandler<T extends FlappyEvent['type']> = (
  event: Extract<FlappyEvent, { type: T }>,
) => void;

/**
 * Lightweight, in-process, typed EventBus.
 * Supports pub/sub, single-event await (once), and AsyncIterable consumption.
 */
export class EventBus {
  private handlers = new Set<EventHandler>();
  private typeHandlers = new Map<string, Set<EventHandler>>();
  private closed = false;

  /**
   * Emit an event to all registered listeners.
   */
  emit(event: FlappyEvent): void {
    if (this.closed) return;

    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error('Error in EventBus handler:', err);
      }
    }

    const typedSet = this.typeHandlers.get(event.type);
    if (typedSet) {
      for (const handler of typedSet) {
        try {
          handler(event);
        } catch (err) {
          console.error(`Error in EventBus handler for ${event.type}:`, err);
        }
      }
    }
  }

  /**
   * Subscribe to all events. Returns an unsubscribe function.
   */
  on(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Subscribe to a specific event type. Returns an unsubscribe function.
   */
  onType<T extends FlappyEvent['type']>(type: T, handler: TypedEventHandler<T>): () => void {
    let set = this.typeHandlers.get(type);
    if (!set) {
      set = new Set();
      this.typeHandlers.set(type, set);
    }
    const rawHandler = handler as EventHandler;
    set.add(rawHandler);
    return () => {
      set?.delete(rawHandler);
      if (set?.size === 0) {
        this.typeHandlers.delete(type);
      }
    };
  }

  /**
   * Wait for the next event of a given type.
   */
  once<T extends FlappyEvent['type']>(
    type: T,
    timeoutMs?: number,
  ): Promise<Extract<FlappyEvent, { type: T }>> {
    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;

      const unsubscribe = this.onType(type, (event) => {
        if (timer) clearTimeout(timer);
        unsubscribe();
        resolve(event);
      });

      if (timeoutMs !== undefined && timeoutMs > 0) {
        timer = setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timed out waiting for event "${type}" after ${timeoutMs}ms`));
        }, timeoutMs);
      }
    });
  }

  /**
   * Async iterator yielding events as they are emitted.
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<FlappyEvent> {
    const queue: FlappyEvent[] = [];
    let notify: (() => void) | null = null;

    const unsubscribe = this.on((event) => {
      queue.push(event);
      if (notify) {
        notify();
        notify = null;
      }
    });

    try {
      while (!this.closed) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
        }
        while (queue.length > 0) {
          yield queue.shift()!;
        }
      }
    } finally {
      unsubscribe();
    }
  }

  /**
   * Close the bus and stop dispatching.
   */
  close(): void {
    this.closed = true;
    this.handlers.clear();
    this.typeHandlers.clear();
  }
}
