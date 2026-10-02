import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  AnthropicConnector,
  GoogleConnector,
  OllamaConnector,
  OpenAICompatibleConnector,
  PROVIDER_PROFILES,
  USER_AGENT,
  FLAPPYCODE_VERSION,
} from '@flappycode/providers';
import { ProviderConfig, RawModel } from '@flappycode/protocol';

describe('Stage B Connectors & User-Agent (GAP-034, GAP-035, GAP-036)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('GAP-036 — Honest User-Agent headers', () => {
    it('version string is truthful and non-empty', () => {
      expect(FLAPPYCODE_VERSION).toBe('0.1.0');
      expect(USER_AGENT).toBe('flappycode/0.1.0');
    });

    it('Google connector sends honest User-Agent in authenticate and listModels', async () => {
      const capturedHeaders: HeadersInit[] = [];
      globalThis.fetch = vi.fn(async (_url, init) => {
        if (init?.headers) capturedHeaders.push(init.headers);
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      });

      const connector = new GoogleConnector();
      const cfg: ProviderConfig = {
        id: 'google',
        type: 'google',
        data_use_policy: 'no_training',
        display_name: 'Google AI Studio',
        enabled: true,
      };

      await connector.authenticate(cfg, 'test-key');
      await connector.listModels(cfg, 'test-key');

      expect(capturedHeaders.length).toBe(2);
      for (const h of capturedHeaders) {
        expect((h as Record<string, string>)['User-Agent']).toBe(USER_AGENT);
      }
    });

    it('Ollama connector sends honest User-Agent in local and cloud modes', async () => {
      const capturedHeaders: HeadersInit[] = [];
      globalThis.fetch = vi.fn(async (_url, init) => {
        if (init?.headers) capturedHeaders.push(init.headers);
        return new Response(JSON.stringify({ models: [] }), { status: 200 });
      });

      const connector = new OllamaConnector();
      const localCfg: ProviderConfig = {
        id: 'ollama',
        type: 'ollama',
        data_use_policy: 'no_training',
        display_name: 'Local Ollama',
        enabled: true,
      };
      const cloudCfg: ProviderConfig = {
        id: 'ollama-cloud',
        type: 'ollama',
        data_use_policy: 'no_training',
        display_name: 'Ollama Cloud',
        enabled: true,
      };

      await connector.authenticate(localCfg);
      await connector.authenticate(cloudCfg, 'cloud-secret-key');

      expect(capturedHeaders.length).toBe(2);
      for (const h of capturedHeaders) {
        expect((h as Record<string, string>)['User-Agent']).toBe(USER_AGENT);
      }
    });

    it('Anthropic and OpenAI-compatible retain honest User-Agent', async () => {
      const capturedHeaders: HeadersInit[] = [];
      globalThis.fetch = vi.fn(async (_url, init) => {
        if (init?.headers) capturedHeaders.push(init.headers);
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      });

      const anthropic = new AnthropicConnector();
      await anthropic.authenticate({ id: 'anthropic', type: 'anthropic', data_use_policy: 'no_training', display_name: 'Anthropic', enabled: true }, 'key');

      const openai = new OpenAICompatibleConnector();
      await openai.authenticate({ id: 'openrouter', type: 'openai-compatible', data_use_policy: 'no_training', display_name: 'OpenRouter', enabled: true }, 'key');

      expect(capturedHeaders.length).toBe(2);
      expect((capturedHeaders[0] as Record<string, string>)['User-Agent']).toBe(USER_AGENT);
      expect((capturedHeaders[1] as Record<string, string>)['User-Agent']).toBe(USER_AGENT);
    });
  });

  describe('GAP-034 — Ollama Cloud profile & connector', () => {
    it('profile exists with correct metadata and classification rule', () => {
      const profile = PROVIDER_PROFILES['ollama-cloud'];
      expect(profile).toBeDefined();
      expect(profile.id).toBe('ollama-cloud');
      expect(profile.type).toBe('ollama');
      expect(profile.defaultBaseUrl).toBe('https://ollama.com');
      expect(profile.isLocal).toBe(false);
      expect(profile.authHeaderPrefix).toBe('Bearer');
      expect(profile.defaultDataUsePolicy).toBe('no_training');
      expect(profile.rateLimitRpm).toBe(30);
      expect(profile.freeClassifierRule).toBeDefined();
      expect(profile.freeClassifierRule!('qwen2.5-coder:7b', {})).toBe(true);
    });

    it('Ollama connector requires API key for cloud profile and selects cloud endpoint', async () => {
      const connector = new OllamaConnector();
      const cloudCfg: ProviderConfig = {
        id: 'ollama-cloud',
        type: 'ollama',
        data_use_policy: 'no_training',
        display_name: 'Ollama Cloud',
        enabled: true,
      };

      // No API key -> fails fast with informative auth error
      const authWithoutKey = await connector.authenticate(cloudCfg);
      expect(authWithoutKey.success).toBe(false);
      expect(authWithoutKey.category).toBe('auth');
      expect(authWithoutKey.error).toMatch(/API key/);

      // With API key -> targets https://ollama.com/api/tags with Bearer auth
      let calledUrl = '';
      let authHeader = '';
      globalThis.fetch = vi.fn(async (url, init) => {
        calledUrl = String(url);
        authHeader = (init?.headers as Record<string, string>)['Authorization'];
        return new Response(JSON.stringify({ models: [{ name: 'llama3:latest', details: { parameter_size: '8b' } }] }), { status: 200 });
      });

      const authWithKey = await connector.authenticate(cloudCfg, 'my-ollama-cloud-token');
      expect(authWithKey.success).toBe(true);
      expect(calledUrl).toBe('https://ollama.com/api/tags');
      expect(authHeader).toBe('Bearer my-ollama-cloud-token');

      // Models list
      const models = await connector.listModels(cloudCfg, 'my-ollama-cloud-token');
      expect(models.length).toBe(1);
      expect(models[0].id).toBe('llama3:latest');
    });

    it('handles invalid credentials on Ollama Cloud honestly', async () => {
      globalThis.fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
      });
      const connector = new OllamaConnector();
      const res = await connector.authenticate(
        { id: 'ollama-cloud', type: 'ollama', data_use_policy: 'no_training', display_name: 'Ollama Cloud', enabled: true },
        'bad-key'
      );
      expect(res.success).toBe(false);
      expect(res.category).toBe('auth');
      expect(res.error).toMatch(/401/);
    });
  });

  describe('GAP-035 — Anthropic tool-call normalization', () => {
    it('maps internal tool definitions to Anthropic input_schema format and groups tool results', async () => {
      let sentBody: any;
      globalThis.fetch = vi.fn(async (_url, init) => {
        sentBody = JSON.parse(String(init?.body));
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n\n'));
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call_123","name":"read_file"}}\n\n'
              )
            );
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"src/main.ts\\"}"}}\n\n'
              )
            );
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":15}}\n\n'
              )
            );
            controller.enqueue(new TextEncoder().encode('data: {"type":"message_stop"}\n\n'));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      });

      const connector = new AnthropicConnector();
      const cfg: ProviderConfig = { id: 'anthropic', type: 'anthropic', data_use_policy: 'no_training', display_name: 'Anthropic', enabled: true };
      const req = {
        model: 'claude-3-5-sonnet',
        messages: [
          { role: 'user' as const, content: 'Check src/main.ts' },
          {
            role: 'assistant' as const,
            content: '',
            tool_calls: [{ id: 'call_prev', type: 'function' as const, function: { name: 'list_files', arguments: '{}' } }],
          },
          { role: 'tool' as const, content: '["src/main.ts"]', tool_call_id: 'call_prev' },
        ],
        tools: [
          {
            type: 'function' as const,
            function: {
              name: 'read_file',
              description: 'Read a file from disk',
              parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
            },
          },
        ],
      };

      const chunks: any[] = [];
      for await (const chunk of connector.complete(cfg, req, 'sk-ant-test')) {
        chunks.push(chunk);
      }

      // Assert sent request mapping
      expect(sentBody.tools).toBeDefined();
      expect(sentBody.tools[0].name).toBe('read_file');
      expect(sentBody.tools[0].input_schema).toEqual(req.tools[0].function.parameters);

      // Verify tool result round trip in user message
      const lastMsg = sentBody.messages[sentBody.messages.length - 1];
      expect(lastMsg.role).toBe('user');
      expect(lastMsg.content[0].type).toBe('tool_result');
      expect(lastMsg.content[0].tool_use_id).toBe('call_prev');

      // Assert streaming normalized output
      const toolChunk = chunks.find((c) => c.tool_calls && c.tool_calls.length > 0 && c.tool_calls[0].id === 'call_123');
      expect(toolChunk).toBeDefined();
      expect(toolChunk.tool_calls[0].function.name).toBe('read_file');

      const argChunk = chunks.find((c) => c.tool_calls && c.tool_calls[0].function.arguments?.includes('src/main.ts'));
      expect(argChunk).toBeDefined();

      const finishChunk = chunks.find((c) => c.finish_reason === 'tool_calls');
      expect(finishChunk).toBeDefined();
    });
  });

  describe('GAP-035 — Google/Gemini tool-call normalization', () => {
    it('sends tools in Gemini functionDeclarations and parses functionCall SSE chunks', async () => {
      let sentBody: any;
      globalThis.fetch = vi.fn(async (_url, init) => {
        sentBody = JSON.parse(String(init?.body));
        const stream = new ReadableStream({
          start(controller) {
            const chunkData = {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          id: 'call_gemini_1',
                          name: 'write_file',
                          args: { path: 'src/app.ts', content: 'console.log(1);' },
                        },
                      },
                    ],
                  },
                  finishReason: 'STOP',
                },
              ],
            };
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunkData)}\n\n`));
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      });

      const connector = new GoogleConnector();
      const cfg: ProviderConfig = { id: 'google', type: 'google', data_use_policy: 'no_training', display_name: 'Google AI Studio', enabled: true };
      const req = {
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'user' as const, content: 'Write file' },
          {
            role: 'assistant' as const,
            content: '',
            tool_calls: [{ id: 'call_0', type: 'function' as const, function: { name: 'ping', arguments: '{}' } }],
          },
          { role: 'tool' as const, name: 'ping', content: 'pong', tool_call_id: 'call_0' },
        ],
        tools: [
          {
            type: 'function' as const,
            function: {
              name: 'write_file',
              description: 'Write file content',
              parameters: { type: 'object', properties: { path: { type: 'string' } } },
            },
          },
        ],
      };

      const chunks: any[] = [];
      for await (const chunk of connector.complete(cfg, req, 'gemini-key')) {
        chunks.push(chunk);
      }

      // Assert sent request mapping
      expect(sentBody.tools).toBeDefined();
      expect(sentBody.tools[0].functionDeclarations).toBeDefined();
      expect(sentBody.tools[0].functionDeclarations[0].name).toBe('write_file');

      // Assert tool result formatted as functionResponse
      const toolTurn = sentBody.contents.find((c: any) => c.parts.some((p: any) => p.functionResponse));
      expect(toolTurn).toBeDefined();
      expect(toolTurn.role).toBe('user');
      expect(toolTurn.parts[0].functionResponse.name).toBe('ping');
      expect(toolTurn.parts[0].functionResponse.response).toEqual({ output: 'pong' });

      // Assert parsed normalized tool call
      const toolCallChunk = chunks.find((c) => c.tool_calls && c.tool_calls.length > 0);
      expect(toolCallChunk).toBeDefined();
      expect(toolCallChunk.tool_calls[0].id).toBe('call_gemini_1');
      expect(toolCallChunk.tool_calls[0].function.name).toBe('write_file');
      expect(JSON.parse(toolCallChunk.tool_calls[0].function.arguments)).toEqual({
        path: 'src/app.ts',
        content: 'console.log(1);',
      });
    });
  });
});
