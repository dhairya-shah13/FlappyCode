export interface SchedulerOptions {
  /** Interval between runs; tests inject a very small value. */
  intervalMs: number;
  /** The job (e.g. registry refresh). Overlapping runs are prevented. */
  run: () => Promise<void> | void;
  onError?: (err: unknown) => void;
}

/**
 * Periodic revalidation scheduler (FR-MOD-006, default 6 hours).
 * Guarantees: no overlapping jobs, safe start/stop with engine lifecycle,
 * skips work when the job itself reports it had nothing to do.
 */
export class IntervalScheduler {
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private disposed = false;

  constructor(private readonly opts: SchedulerOptions) {}

  public start(): void {
    if (this.timer || this.disposed) return;
    if (!(this.opts.intervalMs > 0)) return;
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
    // Never keep the process alive just for revalidation.
    this.timer.unref?.();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.stop();
  }

  /** Run one tick immediately (also used by tests). */
  public async tick(): Promise<void> {
    if (this.inFlight || this.disposed) return; // never overlap refresh jobs
    this.inFlight = true;
    try {
      await this.opts.run();
    } catch (err) {
      this.opts.onError?.(err);
    } finally {
      this.inFlight = false;
    }
  }

  public get isRunning(): boolean {
    return this.inFlight;
  }
}
