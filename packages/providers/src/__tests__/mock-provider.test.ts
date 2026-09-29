import { describe, it, expect } from 'vitest';
import { MockProvider } from '../mock/provider.js';
import { scenario } from '../mock/dsl.js';
import { CompletionRequest, CompletionChunk } from '../types.js';
import {
  AuthError,
  RateLimitError,
  ServerError,
  TimeoutError,
  MalformedResponseError,
} from '../errors.js';

describe('MockProvider', () => {
  const sampleReq: CompletionRequest = {
    model: 'mock-model-free',
    messages: [{ role: 'user', content: 'Hello' }],
  };

  async function collectChunks(iterable: AsyncIterable<CompletionChunk>): Promise<CompletionChunk[]> {
    const chunks: CompletionChunk[] = [];
    for await (const chunk of iterable) {
      chunks.push(chunk);
    }
    return chunks;
  }

  it('handles ok scenario streaming text and usage', async () => {
    const provider = new MockProvider('test-mock', [scenario.ok('Hello world from mock')]);

    const chunks = await collectChunks(provider.complete(sampleReq));
    const textDeltas = chunks.filter((c) => c.type === 'text-delta').map((c) => (c as { text: string }).text);
    expect(textDeltas.join('')).toBe('Hello world from mock');

    const finish = chunks.find((c) => c.type === 'finish');
    expect(finish).toEqual({ type: 'finish', reason: 'stop' });

    expect(provider.recordedCalls).toHaveLength(1);
    expect(provider.recordedCalls[0].request.model).toBe('mock-model-free');
  });

  it('handles okToolCall scenario', async () => {
    const provider = new MockProvider('test-mock', [
      scenario.okToolCall('file_search', { query: 'test.ts' }),
    ]);

    const chunks = await collectChunks(provider.complete(sampleReq));
    const toolCallChunk = chunks.find((c) => c.type === 'tool-call') as {
      type: 'tool-call';
      toolCall: { name: string; arguments: string };
    };

    expect(toolCallChunk).toBeDefined();
    expect(toolCallChunk.toolCall.name).toBe('file_search');
    expect(JSON.parse(toolCallChunk.toolCall.arguments)).toEqual({ query: 'test.ts' });

    const finish = chunks.find((c) => c.type === 'finish');
    expect(finish).toEqual({ type: 'finish', reason: 'tool-calls' });
  });

  it('handles rateLimit scenario throwing RateLimitError', async () => {
    const provider = new MockProvider('test-mock', [scenario.rateLimit({ retryAfterMs: 45000 })]);

    await expect(async () => {
      await collectChunks(provider.complete(sampleReq));
    }).rejects.toThrow(RateLimitError);
  });

  it('handles http5xx scenario throwing ServerError', async () => {
    const provider = new MockProvider('test-mock', [scenario.http5xx(502, 'Bad Gateway')]);

    await expect(async () => {
      await collectChunks(provider.complete(sampleReq));
    }).rejects.toThrow(ServerError);
  });

  it('handles malformedJson scenario', async () => {
    const provider = new MockProvider('test-mock', [scenario.malformedJson()]);

    await expect(async () => {
      await collectChunks(provider.complete(sampleReq));
    }).rejects.toThrow(MalformedResponseError);
  });

  it('handles malformedToolCall scenario', async () => {
    const provider = new MockProvider('test-mock', [scenario.malformedToolCall('write_file')]);

    const chunks = await collectChunks(provider.complete(sampleReq));
    const toolCall = chunks.find((c) => c.type === 'tool-call') as {
      type: 'tool-call';
      toolCall: { name: string; arguments: string };
    };
    expect(toolCall.toolCall.name).toBe('write_file');
    expect(() => JSON.parse(toolCall.toolCall.arguments)).toThrow();
  });

  it('handles timeout scenario', async () => {
    const provider = new MockProvider('test-mock', [scenario.timeout(3000)]);

    await expect(async () => {
      await collectChunks(provider.complete(sampleReq));
    }).rejects.toThrow(TimeoutError);
  });

  it('handles vanishModel scenario', async () => {
    const provider = new MockProvider('test-mock', [scenario.vanishModel('mock-model-free')]);

    const models = await provider.listModels();
    expect(models.find((m) => m.id === 'mock-model-free')).toBeUndefined();
  });

  it('handles authFail scenario during authenticate', async () => {
    const provider = new MockProvider('test-mock', [scenario.authFail('Key expired')]);

    await expect(
      provider.authenticate({
        id: 'test-mock',
        type: 'mock',
        displayName: 'Mock',
        enabled: true,
        maxConcurrency: 2,
        dataUsePolicy: 'unknown',
      }),
    ).rejects.toThrow(AuthError);
  });

  it('returns quota and health information', async () => {
    const provider = new MockProvider('test-mock');
    const quota = await provider.getQuota();
    expect(quota).not.toBe('unknown');

    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThan(0);
  });
});
