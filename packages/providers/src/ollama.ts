import { ProviderConfig, RawModel } from '@flappycode/protocol';
import {
  AuthResult,
  CompletionChunk,
  CompletionRequest,
  HealthInfo,
  ProviderConnector,
} from './types.js';
import { PROVIDER_PROFILES } from './profiles.js';
import { USER_AGENT } from './user-agent.js';

export class OllamaConnector implements ProviderConnector {
  public readonly type = 'ollama';

  /**
   * Resolve the base URL through the provider profile layer so Ollama Cloud
   * (https://ollama.com) and local Ollama (http://localhost:11434) share one
   * connector — differences live in the profile, not in branching code.
   */
  private resolveBaseUrl(cfg: ProviderConfig): string {
    const profile = PROVIDER_PROFILES[cfg.id] || PROVIDER_PROFILES[cfg.type];
    return (cfg.base_url || profile?.defaultBaseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  }

  /** Cloud profiles require `Authorization: Bearer <key>`; local does not. */
  private buildHeaders(apiKey?: string): Record<string, string> {
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    return headers;
  }

  public async authenticate(cfg: ProviderConfig, apiKey?: string): Promise<AuthResult> {
    const profile = PROVIDER_PROFILES[cfg.id] || PROVIDER_PROFILES[cfg.type];
    const baseUrl = this.resolveBaseUrl(cfg);
    const url = `${baseUrl}/api/tags`;

    // GAP-039/GAP-034: a cloud profile without a key can never authenticate —
    // fail fast with an actionable message instead of a bare 401.
    if (profile && !profile.isLocal && !apiKey) {
      return {
        success: false,
        error: 'Ollama Cloud requires an API key (Authorization: Bearer). Add one with: flappycode providers add ollama-cloud --key <OLLAMA_API_KEY>',
        category: 'auth',
      };
    }

    try {
      const res = await fetch(url, {
        headers: this.buildHeaders(apiKey),
        signal: AbortSignal.timeout(4000),
      });
      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          error: `Ollama rejected the API key (${res.status}).`,
          category: 'auth',
        };
      }
      if (res.status === 429) {
        return { success: false, error: 'Rate limit reached on authentication (429).', category: 'rate_limited' };
      }
      if (!res.ok) {
        return { success: false, error: `Ollama returned status ${res.status}`, category: 'other' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Ollama server not reachable at ${url}: ${err.message}`, category: 'unreachable' };
    }
  }

  public async listModels(cfg: ProviderConfig, apiKey?: string): Promise<RawModel[]> {
    const baseUrl = this.resolveBaseUrl(cfg);
    const url = `${baseUrl}/api/tags`;

    const res = await fetch(url, {
      headers: this.buildHeaders(apiKey),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      throw new Error(`Failed to list Ollama models: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const models = data?.models || [];

    return models.map((m: any) => {
      const name = m.name || m.model;
      const contextLength = m.details?.parameter_size?.includes('70b')
        ? 131072
        : m.details?.parameter_size?.includes('14b') || m.details?.parameter_size?.includes('32b')
        ? 32768
        : 8192;

      return {
        id: name,
        name,
        context_length: contextLength,
        supports_tools:
          name.includes('coder') ||
          name.includes('llama3') ||
          name.includes('qwen2') ||
          name.includes('mistral'),
        supports_vision: name.includes('llava') || name.includes('vision'),
        price_in: 0,
        price_out: 0,
        raw_metadata: m,
      };
    });
  }

  public async *complete(
    cfg: ProviderConfig,
    req: CompletionRequest,
    apiKey?: string
  ): AsyncIterable<CompletionChunk> {
    const baseUrl = this.resolveBaseUrl(cfg);
    // Ollama natively supports /api/chat with streaming and tool support
    const url = `${baseUrl}/api/chat`;

    const body: Record<string, any> = {
      model: req.model,
      messages: req.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      options: {
        temperature: req.temperature ?? 0.2,
      },
    };

    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: t.function,
      }));
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.buildHeaders(apiKey), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Ollama completion error HTTP ${res.status}: ${err}`);
    }

    if (!res.body) throw new Error('Ollama response body is null');

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            const delta = parsed.message?.content || undefined;
            const toolCalls = parsed.message?.tool_calls?.map((tc: any, index: number) => ({
              id: `call_${Date.now()}_${index}`,
              index,
              type: 'function' as const,
              function: {
                name: tc.function?.name,
                arguments:
                  typeof tc.function?.arguments === 'string'
                    ? tc.function?.arguments
                    : JSON.stringify(tc.function?.arguments || {}),
              },
            }));

            yield {
              delta,
              tool_calls: toolCalls,
              finish_reason: parsed.done ? 'stop' : undefined,
              usage: parsed.done
                ? {
                    tokens_in: parsed.prompt_eval_count || 0,
                    tokens_out: parsed.eval_count || 0,
                  }
                : undefined,
            };
          } catch {
            // Ignore parse errors on partial stream chunks
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
      status: auth.success ? 'healthy' : 'offline',
      latencyMs: latency,
      lastChecked: Date.now(),
      error: auth.error,
    };
  }

  public static async detectLocalServer(port = 11434): Promise<boolean> {
    try {
      const res = await fetch(`http://localhost:${port}/api/tags`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
