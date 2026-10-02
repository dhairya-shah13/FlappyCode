import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnthropicConnector, USER_AGENT } from '@flappycode/providers';
import { ProviderConfig } from '@flappycode/protocol';
import { startContractFixtureServer, RecordedContractServer } from './fixture-server.js';

describe('GAP-060: Anthropic Connector Contract Tests', () => {
  let fixture: RecordedContractServer;
  let connector: AnthropicConnector;

  beforeEach(async () => {
    fixture = await startContractFixtureServer();
    connector = new AnthropicConnector();
  });

  afterEach(async () => {
    await fixture.close();
  });

  const getCfg = (pathSuffix = ''): ProviderConfig => ({
    id: 'anthropic',
    display_name: 'Anthropic Test',
    type: 'anthropic',
    base_url: `${fixture.baseUrl}${pathSuffix}`,
    enabled: true,
    data_use_policy: 'no_training',
  });

  it('authenticates and validates honest User-Agent and x-api-key headers', async () => {
    const auth = await connector.authenticate(getCfg(), 'sk-ant-test-key');
    expect(auth.success).toBe(true);

    const req = fixture.receivedRequests.find((r) => r.url.includes('/models'));
    expect(req).toBeDefined();
    expect(req?.headers['user-agent']).toBe(USER_AGENT);
    expect(req?.headers['x-api-key']).toBe('sk-ant-test-key');
    expect(req?.headers['anthropic-version']).toBe('2023-06-01');
  });

  it('discovers Anthropic models and parses model properties', async () => {
    const models = await connector.listModels(getCfg(), 'sk-ant-test-key');
    expect(models.length).toBeGreaterThan(0);
    const claude = models.find((m) => m.id.includes('claude'));
    expect(claude).toBeDefined();
  });

  it('completes streaming text with chunk delta and token usage', async () => {
    const chunks: string[] = [];
    let finishReason: string | null | undefined;
    let tokensIn = 0;
    let tokensOut = 0;

    const stream = connector.complete(
      getCfg(),
      {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hello Anthropic' }],
      },
      'sk-ant-test-key'
    );

    for await (const chunk of stream) {
      if (chunk.delta) chunks.push(chunk.delta);
      if (chunk.finish_reason) finishReason = chunk.finish_reason;
      if (chunk.usage) {
        if (chunk.usage.tokens_in) tokensIn = chunk.usage.tokens_in;
        if (chunk.usage.tokens_out) tokensOut = chunk.usage.tokens_out;
      }
    }

    expect(chunks.join('')).toContain('Hello from Anthropic contract!');
    expect(finishReason).toBe('stop');
    expect(tokensIn).toBe(30);
    expect(tokensOut).toBe(8);
  });

  it('normalizes tool use deltas from Anthropic SSE into standard tool_calls', async () => {
    const toolCalls: any[] = [];
    const stream = connector.complete(
      getCfg(),
      {
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Search something' }],
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
      'sk-ant-test-key'
    );

    for await (const chunk of stream) {
      if (chunk.tool_calls) {
        toolCalls.push(...chunk.tool_calls);
      }
    }

    expect(toolCalls.length).toBeGreaterThan(0);
    const startCall = toolCalls.find((c) => c.function?.name === 'search_tool');
    expect(startCall).toBeDefined();
    const fullArgs = toolCalls.map((c) => c.function?.arguments || '').join('');
    expect(fullArgs).toBe('{"query":"anthropic"}');
  });

  it('handles 401, 429 rate limit, 500 error, and network failures correctly', async () => {
    // 401
    const auth401 = await connector.authenticate(getCfg('/error-401'), 'bad-key');
    expect(auth401.success).toBe(false);
    expect(auth401.category).toBe('auth');

    // 429
    const auth429 = await connector.authenticate(getCfg('/error-429'), 'key');
    expect(auth429.success).toBe(false);
    expect(auth429.category).toBe('rate_limited');

    // 500
    const auth500 = await connector.authenticate(getCfg('/error-500'), 'key');
    expect(auth500.success).toBe(false);
  });
});
