#!/usr/bin/env node
/**
 * FlappyCode Dev Script (M1 Demo)
 * Streams a completion from an OpenAI-compatible provider to stdout.
 * Usage:
 *   pnpm dev:complete -- --base-url <url> --key-env <ENVVAR> --model <id> --prompt "<text>"
 */

import { OpenAICompatibleConnector } from '../packages/providers/src/openai-compatible/connector.js';

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = 'true';
      }
    }
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const baseUrl = args['base-url'] ?? process.env.FLAPPYCODE_BASE_URL;
  const keyEnv = args['key-env'];
  const model = args['model'] ?? 'gpt-4o-mini';
  const prompt = args['prompt'] ?? 'Hello from FlappyCode dev:complete!';

  if (!baseUrl) {
    console.error('Error: --base-url is required (or set FLAPPYCODE_BASE_URL).');
    process.exit(1);
  }

  const apiKey = keyEnv ? process.env[keyEnv] ?? '' : process.env.FLAPPYCODE_API_KEY ?? '';

  console.log(`\n🐦 FlappyCode Streaming Completion Demo`);
  console.log(`Endpoint: ${baseUrl}`);
  console.log(`Model:    ${model}`);
  console.log(`Prompt:   "${prompt}"\n--- Response Stream ---\n`);

  const connector = new OpenAICompatibleConnector({
    baseUrl,
    apiKey,
  });

  try {
    for await (const chunk of connector.complete({
      model,
      messages: [{ role: 'user', content: prompt }],
    })) {
      if (chunk.type === 'text-delta') {
        process.stdout.write(chunk.text);
      } else if (chunk.type === 'tool-call') {
        console.log(`\n[Tool Call] ${chunk.toolCall.name}(${chunk.toolCall.arguments})`);
      } else if (chunk.type === 'usage') {
        console.log(`\n\n[Tokens] prompt=${chunk.usage.promptTokens}, completion=${chunk.usage.completionTokens}, total=${chunk.usage.totalTokens}`);
      } else if (chunk.type === 'finish') {
        console.log(`\n[Finished] reason=${chunk.reason}`);
      } else if (chunk.type === 'error') {
        console.error(`\n[Error] ${chunk.error.message}`);
      }
    }
    console.log('\n------------------------\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n✖ Stream failed: ${msg}`);
    process.exit(1);
  }
}

main();
