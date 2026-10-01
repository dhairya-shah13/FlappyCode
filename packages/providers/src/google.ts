import { ProviderConfig, RawModel } from '@flappycode/protocol';
import {
  AuthResult,
  CompletionChunk,
  CompletionRequest,
  HealthInfo,
  ProviderConnector,
} from './types.js';

export class GoogleConnector implements ProviderConnector {
  public readonly type = 'google';

  public async authenticate(cfg: ProviderConfig, apiKey?: string): Promise<AuthResult> {
    const baseUrl = (cfg.base_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const url = `${baseUrl}/models${apiKey ? `?key=${apiKey}` : ''}`;

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.status === 400 || res.status === 403) {
        return { success: false, error: 'Invalid Google AI Studio API key (400/403).', category: 'auth' };
      }
      if (res.status === 429) {
        return { success: false, error: 'Rate limit reached on authentication (429).', category: 'rate_limited' };
      }
      if (!res.ok) {
        return { success: false, error: `Google API returned status ${res.status}.`, category: 'other' };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Endpoint unreachable at ${url}: ${err.message}`, category: 'unreachable' };
    }
  }

  public async listModels(cfg: ProviderConfig, apiKey?: string): Promise<RawModel[]> {
    const baseUrl = (cfg.base_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const url = `${baseUrl}/models${apiKey ? `?key=${apiKey}` : ''}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      throw new Error(`Failed to list Google models: HTTP ${res.status}`);
    }

    const data = (await res.json()) as any;
    const items = data.models || [];

    return items.map((m: any) => {
      const id = m.name?.replace(/^models\//, '') || m.displayName;
      const isFlash = id.includes('flash');
      return {
        id,
        name: m.displayName || id,
        context_length: m.inputTokenLimit || (isFlash ? 1048576 : 128000),
        supports_tools: m.supportedGenerationMethods?.includes('generateContent') || false,
        supports_vision: true,
        price_in: 0, // Free tier on AI Studio for developer keys
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
    const baseUrl = (cfg.base_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const model = req.model.replace(/^models\//, '');
    const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse${apiKey ? `&key=${apiKey}` : ''}`;

    const contents = req.messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body: Record<string, any> = {
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.2,
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (res.status === 429) {
      throw new Error('Google AI Studio rate limit exceeded (429)');
    }
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Google API error HTTP ${res.status}: ${err}`);
    }

    if (!res.body) throw new Error('Response body is null');
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
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(trimmed.slice(6));
            const candidate = data.candidates?.[0];
            const text = candidate?.content?.parts?.[0]?.text;
            if (text) {
              yield { delta: text };
            }
            if (candidate?.finishReason) {
              yield { finish_reason: candidate.finishReason };
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
