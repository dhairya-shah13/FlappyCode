import { EventEmitter } from 'node:events';
import { FlappyEvent } from '@flappycode/protocol';

export type EventListener = (event: FlappyEvent) => void;

export class FlappyEventBus {
  private emitter = new EventEmitter();
  private history: FlappyEvent[] = [];
  private maxHistory = 1000;

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  public emit(event: FlappyEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);
  }

  public on<T extends FlappyEvent['type']>(
    type: T,
    listener: (event: Extract<FlappyEvent, { type: T }>) => void
  ): () => void {
    this.emitter.on(type, listener as any);
    return () => this.emitter.off(type, listener as any);
  }

  public onAny(listener: EventListener): () => void {
    this.emitter.on('*', listener);
    return () => this.emitter.off('*', listener);
  }

  public off<T extends FlappyEvent['type']>(
    type: T,
    listener: (event: Extract<FlappyEvent, { type: T }>) => void
  ): void {
    this.emitter.off(type, listener as any);
  }

  public removeListener<T extends FlappyEvent['type']>(
    type: T,
    listener: (event: Extract<FlappyEvent, { type: T }>) => void
  ): void {
    this.emitter.removeListener(type, listener as any);
  }

  public getHistory(): FlappyEvent[] {
    return [...this.history];
  }

  public clear(): void {
    this.history = [];
    this.emitter.removeAllListeners();
  }
}
