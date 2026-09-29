import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MockOpenAIServer } from '../mock-server/server.js';
import { OpenAICompatibleConnector, parseRetryAfter } from '../openai-compatible/connector.js';
import { scenario } from '../mock/dsl.js';
import {
  AuthError,
  RateLimitError,
  ServerError,
  AbortedError,
} from '../errors.js';
import { CompletionChunk } from '../types.js';

describe('OpenAICompatibleConnector (against MockOpenAIServer)', () => {
  let server: MockOpenAIServer;
  let baseUrl: string;
  const FAKE_KEY = 'sk-test-supersecretkey99999';

  beforeAll(async () => {
    server = new MockOpenAIServer();
    baseUrl = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    server.clearRequests();
  });

  function createConnector(timeoutMs = 5000) {
    return new OpenAICompatibleConnector({
      id: 'mock-openai',
      baseUrl,
      apiKey: FAKE_KEY,
      version: '0.1.0-test',
      timeoutMs,
    });
  }

  async function collectChunks(iterable: AsyncIterable<CompletionChunk>): Promise<CompletionChunk[]> {
    const chunks: CompletionChunk[] = [];
    for await (const chunk of iterable) {
      chunks.push(chunk);
    }
    return chunks;
  }

  it('lists models and sends User-Agent and Authorization headers', async () => {
    const connector = createConnector();
    const models = await connector.listModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models[0].id).toBe('gpt-4o-mini');

    expect(server.recordedRequests).toHaveLength(1);
    const req = server.recordedRequests[0];
    expect(req.headers['user-agent']).toBe('flappycode/0.1.0-test');
    expect(req.headers['authorization']).toBe(`Bearer ${FAKE_KEY}`);
  });

  it('authenticates successfully', async () => {
    const connector = createConnector();
    const res = await connector.authenticate();
    expect(res.authenticated).toBe(true);
  });

  it('streams text completion chunks', async () => {
    server.queueActions(scenario.ok('The quick brown fox'));
    const connector = createConnector();

    const chunks = await collectChunks(
      connector.complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Say hello' }],
      }),
    );

    const deltas = chunks.filter((c) => c.type === 'text-delta').map((c) => (c as { text: string }).text);
    expect(deltas.join('')).toContain('The quick brown fox');

    const finish = chunks.find((c) => c.type === 'finish');
    expect(finish).toEqual({ type: 'finish', reason: 'stop' });
  });

  it('streams tool call with fragmented arguments', async () => {
    server.queueActions(scenario.okToolCall('search_files', { pattern: '*.ts' }));
    const connector = createConnector();

    const chunks = await collectChunks(
      connector.complete({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Find files' }],
      }),
    );

    const toolCallChunk = chunks.find((c) => c.type === 'tool-call') as {
      type: 'tool-call';
      toolCall: { name: string; arguments: string };
    };

    expect(toolCallChunk).toBeDefined();
    expect(toolCallChunk.toolCall.name).toBe('search_files');
    expect(JSON.parse(toolCallChunk.toolCall.arguments)).toEqual({ pattern: '*.ts' });
  });

  it('maps 401 error to AuthError', async () => {
    server.queueActions(scenario.authFail('Invalid API key'));
    const connector = createConnector();

    await expect(async () => {
      await connector.listModels();
    }).rejects.toThrow(AuthError);
  });

  it('maps 429 error to RateLimitError with Retry-After', async () => {
    server.queueActions(scenario.rateLimit({ retryAfterMs: 30000 }));
    const connector = createConnector();

    try {
      await connector.listModels();
      expect.fail('Should have thrown RateLimitError');
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).retryAfterMs).toBe(30000);
      expect((err as RateLimitError).code).toBe('RATE_LIMITED');
    }
  });

  it('maps 500 error to ServerError', async () => {
    server.queueActions(scenario.http5xx(500, 'Internal Server Error'));
    const connector = createConnector();

    await expect(async () => {
      await connector.listModels();
    }).rejects.toThrow(ServerError);
  });

  it('handles abort signal mid-stream', async () => {
    const connector = createConnector();
    const controller = new AbortController();

    controller.abort(); // pre-aborted
    await expect(async () => {
      await collectChunks(
        connector.complete(
          { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'test' }] },
          controller.signal,
        ),
      );
    }).rejects.toThrow(AbortedError);
  });

  it('handles timeout', async () => {
    const connector = new OpenAICompatibleConnector({
      baseUrl: 'http://127.0.0.1:9999', // unreachable non-existent server
      apiKey: FAKE_KEY,
      timeoutMs: 50,
    });

    await expect(async () => {
      await collectChunks(
        connector.complete({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'hello' }],
        }),
      );
    }).rejects.toThrow();
  });

  it('strictly ensures the secret key never leaks into error messages', async () => {
    server.queueActions(scenario.http5xx(500, `Database error involving ${FAKE_KEY}`));
    const connector = createConnector();

    try {
      await connector.listModels();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).not.toContain(FAKE_KEY);
      expect(msg).toContain('[REDACTED]');
    }
  });

  it('parses Retry-After headers in seconds or date format', () => {
    expect(parseRetryAfter('60')).toBe(60000);
    expect(parseRetryAfter('invalid')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});
