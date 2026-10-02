import { ProviderConfig, RawModel } from '@flappycode/protocol';
import {
  AuthResult,
  CompletionChunk,
  CompletionRequest,
  HealthInfo,
  ProviderConnector,
} from './types.js';
import { USER_AGENT } from './user-agent.js';

export class AnthropicConnector implements ProviderConnector {
  public readonly type = 'anthropic';

  public async authenticate(cfg: ProviderConfig, apiKey?: string): Promise<AuthResult> {
    const baseUrl = (cfg.base_url || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const url = `${baseUrl}/models`;

    const headers: Record<string, string> = {
      'anthropic-version': '2023-06-01',
      'User-Agent': USER_AGENT,
    };
    if (apiKey) headers['x-api-key'] = apiKey;

    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (res.status === 401 || res.status === 403) {
        return { success: false, error: 'Invalid Anthropic API key (401/403).', category: 'auth' };
      }
      if (res.status === 429) {
        return { success: false, error: 'Rate limit reached on authentication (429).', category: 'rate_limited' };
      }
      if (!res.ok) {
        return { success: false, error: `Anthropic API returned status ${res.status}.`, category: 'other' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Endpoint unreachable at ${url}: ${err.message}`, category: 'unreachable' };
    }
  }

  public async listModels(cfg: ProviderConfig, apiKey?: string): Promise<RawModel[]> {
    const baseUrl = (cfg.base_url || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const url = `${baseUrl}/models`;

    const headers: Record<string, string> = {
      'anthropic-version': '2023-06-01',
      'User-Agent': USER_AGENT,
    };
    if (apiKey) headers['x-api-key'] = apiKey;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      throw new Error(`Failed to list Anthropic models: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const items = data.data || [];

    return items.map((m: any) => ({
      id: m.id,
      name: m.display_name || m.id,
      context_length: 200000,
      supports_tools: true,
      supports_vision: true,
      price_in: 3.0, // paid by default
      price_out: 15.0,
      raw_metadata: m,
    }));
  }

  public async *complete(
    cfg: ProviderConfig,
    req: CompletionRequest,
    apiKey?: string
  ): AsyncIterable<CompletionChunk> {
    const baseUrl = (cfg.base_url || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const url = `${baseUrl}/messages`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'User-Agent': USER_AGENT,
    };
    if (apiKey) headers['x-api-key'] = apiKey;

    // Filter system message
    const systemMsg = req.messages.find((m) => m.role === 'system')?.content;

    // Anthropic-native message mapping: assistant tool_calls become `tool_use`
    // content blocks, and `role: 'tool'` results become `tool_result` blocks in
    // a following user message (required for the tool round trip, GAP-035).
    const nonSystemMsgs: Array<{ role: string; content: any }> = [];
    for (const m of req.messages) {
      if (m.role === 'system') continue;
      if (m.role === 'tool') {
        // Group consecutive tool results into one user message (Anthropic
        // requires all tool_result blocks for a turn to arrive together).
        const block = {
          type: 'tool_result',
          tool_use_id: m.tool_call_id || '',
          content: m.content,
        };
        const prev = nonSystemMsgs[nonSystemMsgs.length - 1];
        if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
          prev.content.push(block);
        } else {
          nonSystemMsgs.push({ role: 'user', content: [block] });
        }
        continue;
      }
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        const content: any[] = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const tc of m.tool_calls) {
          let input: any = {};
          try {
            input = JSON.parse(tc.function.arguments || '{}');
          } catch {
            input = {}; // never fail the request on malformed prior arguments
          }
          content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        }
        nonSystemMsgs.push({ role: 'assistant', content });
        continue;
      }
      nonSystemMsgs.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      });
    }

    const body: Record<string, any> = {
      model: req.model,
      messages: nonSystemMsgs.length > 0 ? nonSystemMsgs : [{ role: 'user', content: 'Hello' }],
      max_tokens: req.max_tokens || 4096,
      stream: true,
      temperature: req.temperature ?? 0.2,
    };
    if (systemMsg) body.system = systemMsg;

    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (res.status === 429) {
      throw new Error(`Anthropic rate limit exceeded (429)`);
    }
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Anthropic completion error HTTP ${res.status}: ${err}`);
    }

    if (!res.body) throw new Error('Response body is null');
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf8');
    let buffer = '';
    let sawFinish = false;
    // Streamed tool_use blocks are tracked by content-block index so
    // incremental `input_json_delta` fragments map onto one normalized
    // tool_calls entry (same incremental contract as openai-compatible).
    const toolBlockIndex = new Map<number, number>();
    let nextToolCallIndex = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const jsonStr = trimmed.slice(6);
          try {
            const event = JSON.parse(jsonStr);
            if (event.type === 'content_block_start') {
              const block = event.content_block;
              if (block?.type === 'tool_use') {
                const idx =
                  toolBlockIndex.get(event.index) ?? nextToolCallIndex++;
                toolBlockIndex.set(event.index, idx);
                yield {
                  tool_calls: [
                    {
                      id: block.id || '',
                      index: idx,
                      type: 'function',
                      function: { name: block.name || '', arguments: '' },
                    },
                  ],
                };
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta?.type === 'text_delta') {
                yield { delta: event.delta.text };
              } else if (event.delta?.type === 'input_json_delta') {
                const idx = toolBlockIndex.get(event.index);
                if (idx !== undefined) {
                  yield {
                    tool_calls: [
                      {
                        id: '',
                        index: idx,
                        type: 'function',
                        function: { arguments: event.delta.partial_json || '' },
                      },
                    ],
                  };
                }
              }
            } else if (event.type === 'message_delta') {
              // Authoritative stop reason from Anthropic.
              const stop = event.delta?.stop_reason;
              if (stop) {
                sawFinish = true;
                yield {
                  finish_reason:
                    stop === 'tool_use'
                      ? 'tool_calls'
                      : stop === 'max_tokens'
                        ? 'length'
                        : 'stop',
                };
              }
              if (event.usage?.output_tokens !== undefined) {
                yield {
                  usage: {
                    tokens_in: 0,
                    tokens_out: event.usage.output_tokens || 0,
                  },
                };
              }
            } else if (event.type === 'message_start') {
              if (event.message?.usage?.input_tokens !== undefined) {
                yield {
                  usage: {
                    tokens_in: event.message.usage.input_tokens || 0,
                    tokens_out: 0,
                  },
                };
              }
            } else if (event.type === 'message_stop') {
              if (!sawFinish) yield { finish_reason: 'stop' };
            }
          } catch {
            // Ignore partial SSE JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  public async healthCheck(cfg: ProviderConfig, apiKey?: string): Promise<HealthInfo> {
    const start = Date.now();
    const auth = await this.authenticate(cfg, apiKey);
    const latency = Date.now() - start;

    return {
      status: auth.success ? 'healthy' : 'auth_failed',
      latencyMs: latency,
      lastChecked: Date.now(),
      error: auth.error,
    };
  }
}
