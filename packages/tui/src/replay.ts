import fs from 'node:fs';
import readline from 'node:readline';
import { EventBus, FlappyEventSchema, FlappyEvent } from '@flappycode/protocol';

export interface ReplayOptions {
  speed?: number; // 1 = real-time, 0 = immediate (no delay)
  signal?: AbortSignal;
}

/**
 * Replays events from a JSONL file onto an EventBus.
 */
export async function replay(
  bus: EventBus,
  filePath: string,
  options: ReplayOptions = {},
): Promise<FlappyEvent[]> {
  const { speed = 0, signal } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`Fixture file not found: ${filePath}`);
  }

  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const events: FlappyEvent[] = [];
  let prevTs: number | null = null;

  for await (const line of rl) {
    if (signal?.aborted) break;
    const trimmed = line.trim();
    if (!trimmed) continue;

    const raw = JSON.parse(trimmed);
    const event = FlappyEventSchema.parse(raw);
    events.push(event);

    if (speed > 0 && prevTs !== null) {
      const delta = Math.max(0, event.ts - prevTs) / speed;
      if (delta > 0) {
        await new Promise((r) => setTimeout(r, Math.min(delta, 1000)));
      }
    }
    prevTs = event.ts;

    bus.emit(event);
  }

  return events;
}
