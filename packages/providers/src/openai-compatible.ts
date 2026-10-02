import { ProviderConfig, RawModel } from '@flappycode/protocol';
import {
  AuthResult,
  CompletionChunk,
  CompletionRequest,
  HealthInfo,
  ProviderConnector,
  QuotaInfo,
} from './types.js';
import { PROVIDER_PROFILES } from './profiles.js';
import { USER_AGENT } from './user-agent.js';

export class OpenAICompatibleConnector implements ProviderConnector {
  public readonly type = 'openai-compatible';

  public async authenticate(cfg: ProviderConfig, apiKey?: string): Promise<AuthResult> {
    const profile = PROVIDER_PROFILES[cfg.type] || PROVIDER_PROFILES[cfg.id];
    const baseUrl = cfg.base_url || profile?.defaultBaseUrl || 'https://api.openai.com/v1';
    const discoveryPath = profile?.discoveryPath || '/models';
    const url = `${baseUrl.replace(/\/+$/, '')}${discoveryPath}`;

    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000),
      });

      if (res.status === 401 || res.status === 403) {
        return { success: false, error: 'Invalid API key or unauthorized (401/403).', category: 'auth' };
      }
      if (res.status === 429) {
        return { success: false, error: 'Rate limit reached on authentication (429).', category: 'rate_limited' };
      }
      if (!res.ok) {
        return { success: false, error: `Endpoint returned HTTP status ${res.status}.`, category: 'other' };
      }
      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: `Endpoint unreachable at '${url}': ${err.message || 'Network error'}`,
        category: 'unreachable',
      };
    }
  }

  public async listModels(cfg: ProviderConfig, apiKey?: string): Promise<RawModel[]> {
    const profile = PROVIDER_PROFILES[cfg.type] || PROVIDER_PROFILES[cfg.id];
    const baseUrl = cfg.base_url || profile?.defaultBaseUrl || 'https://api.openai.com/v1';
    const discoveryPath = profile?.discoveryPath || '/models';
    const url = `${baseUrl.replace(/\/+$/, '')}${discoveryPath}`;

    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Failed to list models from ${cfg.id}: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const items = Array.isArray(data) ? data : data?.data || [];

    return items.map((item: any) => {
      const modelId = item.id || item.name;
      const contextLength =
        item.context_length ||
        item.context_window ||
        item.max_tokens ||
        (modelId.includes('32k') ? 32768 : modelId.includes('128k') ? 131072 : 4096);

      let priceIn = 0;
      let priceOut = 0;
      if (item.pricing) {
        priceIn = parseFloat(item.pricing.prompt || '0');
        priceOut = parseFloat(item.pricing.completion || '0');
      }

      const supportsTools =
        item.supports_tools !== undefined
          ? Boolean(item.supports_tools)
          : modelId.includes('coder') ||
            modelId.includes('instruct') ||
            modelId.includes('gpt') ||
            modelId.includes('claude');

      const supportsVision =
        item.supports_vision !== undefined
          ? Boolean(item.supports_vision)
          : modelId.includes('vision') || modelId.includes('flash') || modelId.includes('omni');

      return {
        id: modelId,
        name: item.name || modelId,
        context_length: contextLength,
        supports_tools: supportsTools,
        supports_vision: supportsVision,
        price_in: priceIn,
        price_out: priceOut,
        raw_metadata: item,
      };
    });
  }

  public async *complete(
    cfg: ProviderConfig,
    req: CompletionRequest,
    apiKey?: string
  ): AsyncIterable<CompletionChunk> {
    const profile = PROVIDER_PROFILES[cfg.type] || PROVIDER_PROFILES[cfg.id];
    const baseUrl = cfg.base_url || profile?.defaultBaseUrl || 'https://api.openai.com/v1';
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body: Record<string, any> = {
      model: req.model,
      messages: req.messages,
      stream: true,
      temperature: req.temperature ?? 0.2,
    };
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools;
    }
    if (req.max_tokens) {
      body.max_tokens = req.max_tokens;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      throw new Error(`Rate limit exceeded (429)${retryAfter ? ` Retry-After: ${retryAfter}` : ''}`);
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Completion error HTTP ${res.status}: ${errText}`);
    }

    if (!res.body) {
      throw new Error('Response body is null');
    }

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
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') return;
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(jsonStr);
              const choice = parsed.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta?.content || undefined;
              const toolCalls = choice.delta?.tool_calls?.map((tc: any) => ({
                id: tc.id || '',
                index: tc.index ?? 0,
                type: 'function' as const,
                function: {
                  name: tc.function?.name,
                  arguments: tc.function?.arguments,
                },
              }));

              yield {
                delta,
                tool_calls: toolCalls,
                finish_reason: choice.finish_reason || undefined,
                usage: parsed.usage
                  ? {
                      tokens_in: parsed.usage.prompt_tokens || 0,
                      tokens_out: parsed.usage.completion_tokens || 0,
                    }
                  : undefined,
              };
            } catch {
              // Ignore partial JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  public async getQuota(cfg: ProviderConfig, apiKey?: string): Promise<QuotaInfo | 'unknown'> {
    // Attempt HEAD or lightweight models call to inspect headers
    try {
      const profile = PROVIDER_PROFILES[cfg.type] || PROVIDER_PROFILES[cfg.id];
      const baseUrl = cfg.base_url || profile?.defaultBaseUrl || 'https://api.openai.com/v1';
      const url = `${baseUrl.replace(/\/+$/, '')}/models`;

      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
      };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const res = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(5000) });
      const reqRemaining = res.headers.get('x-ratelimit-remaining-requests');
      const tokensRemaining = res.headers.get('x-ratelimit-remaining-tokens');
      const resetRequests = res.headers.get('x-ratelimit-reset-requests');

      if (reqRemaining !== null || tokensRemaining !== null) {
        return {
          remainingRequests: reqRemaining ? parseInt(reqRemaining, 10) : undefined,
          remainingTokens: tokensRemaining ? parseInt(tokensRemaining, 10) : undefined,
          resetAt: resetRequests ? Date.now() + parseFloat(resetRequests) * 1000 : undefined,
          isEstimate: false,
        };
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  public async healthCheck(cfg: ProviderConfig, apiKey?: string): Promise<HealthInfo> {
    const start = Date.now();
    const auth = await this.authenticate(cfg, apiKey);
    const latency = Date.now() - start;

    if (!auth.success) {
      const isRateLimit = auth.error?.includes('429');
      return {
        status: isRateLimit ? 'rate_limited' : 'auth_failed',
        latencyMs: latency,
        lastChecked: Date.now(),
        error: auth.error,
      };
    }

    return {
      status: 'healthy',
      latencyMs: latency,
      lastChecked: Date.now(),
    };
  }
}
