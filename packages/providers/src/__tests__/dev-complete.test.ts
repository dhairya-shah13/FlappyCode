import { describe, it, expect } from 'vitest';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { MockOpenAIServer } from '../mock-server/server.js';
import { scenario } from '../mock/dsl.js';

const execAsync = promisify(exec);

describe('dev:complete script', () => {
  it('streams a completion to stdout', async () => {
    const server = new MockOpenAIServer([scenario.ok('Smoke test message from mock')]);
    const url = await server.start();
    const scriptPath = path.resolve(__dirname, '../../../../scripts/dev-complete.ts');

    try {
      const { stdout } = await execAsync(
        `npx tsx "${scriptPath}" --base-url "${url}" --model "gpt-test" --prompt "ping"`,
      );

      expect(stdout).toContain('FlappyCode Streaming Completion Demo');
      expect(stdout).toContain('Smoke test message from mock');
      expect(stdout).toContain('[Finished] reason=stop');
    } finally {
      await server.stop();
    }
  });
});
