import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GoogleConnector, USER_AGENT } from '@flappycode/providers';
import { ProviderConfig } from '@flappycode/protocol';
import { startContractFixtureServer, RecordedContractServer } from './fixture-server.js';

describe('GAP-060: Google Gemini Connector Contract Tests', () => {
  let fixture: RecordedContractServer;
  let connector: GoogleConnector;

  beforeEach(async () => {
    fixture = await startContractFixtureServer();
    connector = new GoogleConnector();
  });

  afterEach(async () => {
    await fixture.close();
  });

  const getCfg = (pathSuffix = ''): ProviderConfig => ({
    id: 'google',
    display_name: 'Google Gemini Test',
    type: 'google',
    base_url: `${fixture.baseUrl}${pathSuffix}`,
    enabled: true,
    data_use_policy: 'no_training',
  });

  it('authenticates and validates honest User-Agent header', async () => {
    const auth = await connector.authenticate(getCfg(), 'ai-contract-key');
    expect(auth.success).toBe(true);

    const req = fixture.receivedRequests.find((r) => r.url.includes('/models'));
    expect(req).toBeDefined();
    expect(req?.headers['user-agent']).toBe(USER_AGENT);
    expect(req?.url).toContain('key=ai-contract-key');
  });

  it('discovers Google Gemini models and parses context limits', async () => {
    const models = await connector.listModels(getCfg(), 'ai-contract-key');
    expect(models.length).toBeGreaterThan(0);
    const gemini = models.find((m) => m.id.includes('gemini'));
    expect(gemini).toBeDefined();
    expect(gemini?.context_length).toBe(1048576);
  });

  it('completes streaming text with chunk delta and usage metadata', async () => {
    const chunks: string[] = [];
    let finishReason: string | null | undefined;
    let tokensIn = 0;
    let tokensOut = 0;

    const stream = connector.complete(
      getCfg(),
      {
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'Hello Gemini' }],
      },
      'ai-contract-key'
    );

    for await (const chunk of stream) {
      if (chunk.delta) chunks.push(chunk.delta);
      if (chunk.finish_reason) finishReason = chunk.finish_reason;
      if (chunk.usage) {
        tokensIn = chunk.usage.tokens_in;
        tokensOut = chunk.usage.tokens_out;
      }
    }

    expect(chunks.join('')).toContain('Hello from Google Gemini contract!');
    expect(finishReason?.toLowerCase()).toBe('stop');
    expect(tokensIn).toBe(12);
    expect(tokensOut).toBe(7);
  });

  it('normalizes functionCall parts from Gemini SSE into standard tool_calls', async () => {
    const toolCalls: any[] = [];
    const stream = connector.complete(
      getCfg(),
      {
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'Search Gemini' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'search_tool',
              description: 'Search documentation',
              parameters: { type: 'object' },
            },
          },
        ],
      },
      'ai-contract-key'
    );

    for await (const chunk of stream) {
      if (chunk.tool_calls) {
        toolCalls.push(...chunk.tool_calls);
      }
    }

    expect(toolCalls.length).toBeGreaterThan(0);
    expect(toolCalls[0].function?.name).toBe('search_tool');
    expect(toolCalls[0].function?.arguments).toBe('{"query":"google"}');
  });

  it('handles 400/403, 429, and 500 error responses correctly', async () => {
    const auth400 = await connector.authenticate(getCfg('/error-400'), 'bad-key');
    expect(auth400.success).toBe(false);
    expect(auth400.category).toBe('auth');

    const auth429 = await connector.authenticate(getCfg('/error-429'), 'key');
    expect(auth429.success).toBe(false);
    expect(auth429.category).toBe('rate_limited');

    const auth500 = await connector.authenticate(getCfg('/error-500'), 'key');
    expect(auth500.success).toBe(false);
  });
});
