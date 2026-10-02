import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OllamaConnector, USER_AGENT } from '@flappycode/providers';
import { ProviderConfig } from '@flappycode/protocol';
import { startContractFixtureServer, RecordedContractServer } from './fixture-server.js';

describe('GAP-060: Ollama Connector Contract Tests', () => {
  let fixture: RecordedContractServer;
  let connector: OllamaConnector;

  beforeEach(async () => {
    fixture = await startContractFixtureServer();
    connector = new OllamaConnector();
  });

  afterEach(async () => {
    await fixture.close();
  });

  const getCfg = (pathSuffix = ''): ProviderConfig => ({
    id: 'ollama',
    display_name: 'Ollama Local Test',
    type: 'ollama',
    base_url: `${fixture.baseUrl}${pathSuffix}`,
    enabled: true,
    data_use_policy: 'no_training',
  });

  it('authenticates and validates honest User-Agent header', async () => {
    const auth = await connector.authenticate(getCfg());
    expect(auth.success).toBe(true);

    const req = fixture.receivedRequests.find((r) => r.url === '/api/tags');
    expect(req).toBeDefined();
    expect(req?.headers['user-agent']).toBe(USER_AGENT);
  });

  it('discovers Ollama models and parses tags', async () => {
    const models = await connector.listModels(getCfg());
    expect(models.length).toBeGreaterThan(0);
    const llama = models.find((m) => m.id.includes('llama3'));
    expect(llama).toBeDefined();
  });

  it('completes streaming text with chunk delta and token usage', async () => {
    const chunks: string[] = [];
    let finishReason: string | null | undefined;
    let tokensIn = 0;
    let tokensOut = 0;

    const stream = connector.complete(getCfg(), {
      model: 'llama3:8b',
      messages: [{ role: 'user', content: 'Hello Ollama' }],
    });

    for await (const chunk of stream) {
      if (chunk.delta) chunks.push(chunk.delta);
      if (chunk.finish_reason) finishReason = chunk.finish_reason;
      if (chunk.usage) {
        tokensIn = chunk.usage.tokens_in;
        tokensOut = chunk.usage.tokens_out;
      }
    }

    expect(chunks.join('')).toContain('Hello from Ollama contract!');
    expect(finishReason).toBe('stop');
    expect(tokensIn).toBe(8);
    expect(tokensOut).toBe(6);
  });

  it('normalizes tool calls from Ollama chat stream into standard tool_calls', async () => {
    const toolCalls: any[] = [];
    const stream = connector.complete(getCfg(), {
      model: 'llama3:8b',
      messages: [{ role: 'user', content: 'Search Ollama' }],
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
    });

    for await (const chunk of stream) {
      if (chunk.tool_calls) {
        toolCalls.push(...chunk.tool_calls);
      }
    }

    expect(toolCalls.length).toBeGreaterThan(0);
    expect(toolCalls[0].function?.name).toBe('search_tool');
    expect(toolCalls[0].function?.arguments).toBe('{"query":"ollama"}');
  });

  it('handles 401, 429, and 500 error responses correctly', async () => {
    const auth401 = await connector.authenticate(getCfg('/error-401'), 'bad-key');
    expect(auth401.success).toBe(false);

    const auth429 = await connector.authenticate(getCfg('/error-429'));
    expect(auth429.success).toBe(false);

    const auth500 = await connector.authenticate(getCfg('/error-500'));
    expect(auth500.success).toBe(false);
  });
});
