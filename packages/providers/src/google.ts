import { ProviderConfig, RawModel } from '@flappycode/protocol';
import {
  AuthResult,
  CompletionChunk,
  CompletionRequest,
  HealthInfo,
  ProviderConnector,
} from './types.js';
import { USER_AGENT } from './user-agent.js';

export class GoogleConnector implements ProviderConnector {
  public readonly type = 'google';

  public async authenticate(cfg: ProviderConfig, apiKey?: string): Promise<AuthResult> {
    const baseUrl = (cfg.base_url || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const url = `${baseUrl}/models${apiKey ? `?key=${apiKey}` : ''}`;

    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
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

    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
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

    // Anthropic-style: pull the system prompt out of the message list into
    // Gemini's top-level systemInstruction (verified against the generateContent
    // API reference: systemInstruction is a Content with text parts only).
    const systemMsg = req.messages.find((m) => m.role === 'system')?.content;

    // Verified gate G1 (ai.google.dev function-calling guide):
    // - assistant tool_calls -> `model` turn with `functionCall` parts
    // - role 'tool' results   -> `user` turn with `functionResponse` parts
    const contents: Array<{ role: string; parts: any[] }> = [];
    for (const m of req.messages) {
      if (m.role === 'system') continue;
      if (m.role === 'tool') {
        // functionResponse.response must be a JSON object; wrap plain text.
        let response: any;
        try {
          const parsed = JSON.parse(m.content);
          response = parsed && typeof parsed === 'object' ? parsed : { output: parsed };
        } catch {
          response = { output: m.content };
        }
        const part = {
          functionResponse: { name: m.name || '', response },
        };
        const prev = contents[contents.length - 1];
        if (prev && prev.role === 'user' && prev.parts.every((p: any) => p.functionResponse)) {
          prev.parts.push(part);
        } else {
          contents.push({ role: 'user', parts: [part] });
        }
        continue;
      }
      if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const tc of m.tool_calls) {
          let args: any = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {
            args = {};
          }
          parts.push({ functionCall: { name: tc.function.name, args } });
        }
        contents.push({ role: 'model', parts });
        continue;
      }
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }

    const body: Record<string, any> = {
      contents,
      generationConfig: {
        temperature: req.temperature ?? 0.2,
      },
    };
    if (systemMsg) {
      body.systemInstruction = { role: 'user', parts: [{ text: systemMsg }] };
    }
    if (req.tools && req.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters,
          })),
        },
      ];
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
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
    // Verified gate G2: finishReason arrives as candidates[0].finishReason on
    // the final chunk (STOP / MAX_TOKENS / SAFETY / ...). We pass it through
    // unmodified, matching the OpenAI-compatible connector contract.
    // Verified gate G3: functionCall.id is present on current models; fall
    // back to a stable synthesized id when the provider omits it.
    let toolCallIndex = 0;

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
            if (!candidate) continue;
            const parts: any[] = candidate.content?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (typeof part.text === 'string' && part.text.length > 0) {
                  yield { delta: part.text };
                } else if (part.functionCall) {
                  const args = part.functionCall.args ?? {};
                  const index = toolCallIndex++;
                  yield {
                    tool_calls: [
                      {
                        id: part.functionCall.id || `call_${index}`,
                        index,
                        type: 'function' as const,
                        function: {
                          name: part.functionCall.name || '',
                          arguments: JSON.stringify(args),
                        },
                      },
                    ],
                  };
                }
              }
            }
            if (candidate.finishReason) {
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
