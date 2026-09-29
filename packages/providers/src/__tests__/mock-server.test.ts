import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MockOpenAIServer } from '../mock-server/server.js';
import { scenario } from '../mock/dsl.js';

describe('MockOpenAIServer', () => {
  let server: MockOpenAIServer;
  let baseUrl: string;

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

  it('serves GET /v1/models', async () => {
    const res = await fetch(`${baseUrl}/models`);
    expect(res.status).toBe(200);

    const json = (await res.json()) as { object: string; data: Array<{ id: string }> };
    expect(json.object).toBe('list');
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data[0].id).toBe('gpt-4o-mini');
  });

  it('serves POST /v1/chat/completions non-streaming JSON', async () => {
    server.queueActions(scenario.ok('Direct reply from server'));

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer sk-test-key-12345',
        'User-Agent': 'flappycode/0.0.0-dev',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    expect(json.choices[0].message.content).toBe('Direct reply from server');

    // Assert request capture
    expect(server.recordedRequests).toHaveLength(1);
    const req = server.recordedRequests[0];
    expect(req.headers['authorization']).toBe('Bearer sk-test-key-12345');
    expect(req.headers['user-agent']).toBe('flappycode/0.0.0-dev');
  });

  it('serves POST /v1/chat/completions SSE streaming', async () => {
    server.queueActions(scenario.ok('Streamed response words'));

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Stream please' }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const text = await res.text();
    expect(text).toContain('data: ');
    expect(text).toContain('[DONE]');
    expect(text).toContain('Streamed');
  });

  it('serves rate limit 429 with Retry-After header', async () => {
    server.queueActions(scenario.rateLimit({ retryAfterMs: 45000 }));

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
    });

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('45');
  });

  it('serves 500 server error', async () => {
    server.queueActions(scenario.http5xx(500, 'Upstream crashed'));

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
    });

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe('Upstream crashed');
  });

  it('serves 401 auth failure', async () => {
    server.queueActions(scenario.authFail('Invalid API Key provided'));

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [] }),
    });

    expect(res.status).toBe(401);
  });
});
