import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleConnector, USER_AGENT } from '@flappycode/providers';
import { ProviderConfig } from '@flappycode/protocol';
import { startContractFixtureServer, RecordedContractServer } from './fixture-server.js';

describe('GAP-060: OpenAI-Compatible Connector Contract Tests', () => {
  let fixture: RecordedContractServer;
  let connector: OpenAICompatibleConnector;

  beforeEach(async () => {
    fixture = await startContractFixtureServer();
    connector = new OpenAICompatibleConnector();
  });

  afterEach(async () => {
    await fixture.close();
  });

  const getCfg = (pathSuffix = ''): ProviderConfig => ({
    id: 'openai-compatible',
    display_name: 'OpenAI Test',
    type: 'openai-compatible',
    base_url: `${fixture.baseUrl}${pathSuffix}`,
    enabled: true,
    data_use_policy: 'no_training',
  });

  it('authenticates and validates honest User-Agent header', async () => {
    const auth = await connector.authenticate(getCfg(), 'sk-contract-key');
    expect(auth.success).toBe(true);

    const req = fixture.receivedRequests.find((r) => r.url === '/models');
    expect(req).toBeDefined();
    expect(req?.headers['user-agent']).toBe(USER_AGENT);
    expect(req?.headers['authorization']).toBe('Bearer sk-contract-key');
  });

  it('discovers models with normalized IDs, context length, and capabilities', async () => {
    const models = await connector.listModels(getCfg(), 'sk-contract-key');
    expect(models.length).toBe(2);

    const gpt4 = models.find((m) => m.id === 'contract-gpt-4');
    expect(gpt4).toBeDefined();
    expect(gpt4?.context_length).toBe(128000);
  });

  it('completes streaming text with chunk delta and token usage', async () => {
    const chunks: string[] = [];
    let finishReason: string | null | undefined;
    let tokensIn = 0;
    let tokensOut = 0;

    const stream = connector.complete(
      getCfg(),
      {
        model: 'contract-gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      },
      'sk-contract-key'
    );

    for await (const chunk of stream) {
      if (chunk.delta) chunks.push(chunk.delta);
      if (chunk.finish_reason) finishReason = chunk.finish_reason;
      if (chunk.usage) {
        tokensIn = chunk.usage.tokens_in;
        tokensOut = chunk.usage.tokens_out;
      }
    }

    expect(chunks.join('')).toBe('Hello from OpenAI-Compatible contract!');
    expect(finishReason).toBe('stop');
    expect(tokensIn).toBe(10);
    expect(tokensOut).toBe(6);
  });

  it('normalizes tool calls from streaming responses', async () => {
    const toolCalls: any[] = [];
    const stream = connector.complete(
      getCfg(),
      {
        model: 'contract-gpt-4',
        messages: [{ role: 'user', content: 'Search' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'search_tool',
              description: 'Search',
              parameters: { type: 'object' },
            },
          },
        ],
      },
      'sk-contract-key'
    );

    for await (const chunk of stream) {
      if (chunk.tool_calls) {
        toolCalls.push(...chunk.tool_calls);
      }
    }

    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].function?.name).toBe('search_tool');
    expect(toolCalls[0].function?.arguments).toBe('{"query":"contract"}');
  });

  it('handles 401, 429 rate limit, 500 error, and malformed responses correctly', async () => {
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
    expect(auth500.category).toBe('other');

    // Malformed JSON on listModels throws clean error
    await expect(connector.listModels(getCfg('/malformed-json'), 'key')).rejects.toThrow();
  });
});
