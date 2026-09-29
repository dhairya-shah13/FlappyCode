import type { ProviderConfig } from '@flappycode/protocol';
import {
  ProviderConnector,
  CompletionRequest,
  CompletionChunk,
  RawModel,
  HealthInfo,
  AuthResult,
} from '../types.js';
import {
  AuthError,
  RateLimitError,
  ServerError,
  NetworkError,
  TimeoutError,
  MalformedResponseError,
  AbortedError,
  redactSecrets,
} from '../errors.js';

export interface OpenAICompatibleConfig {
  id?: string;
  baseUrl: string;
  apiKey: string;
  defaultHeaders?: Record<string, string>;
  discoveryPath?: string;
  authHeaderName?: string;
  parseModel?: (raw: unknown) => RawModel;
  version?: string;
  timeoutMs?: number;
}

/**
 * Parses HTTP Retry-After header (seconds or HTTP-date).
 */
export function parseRetryAfter(header?: string | null): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10) * 1000;
  }
  const dateMs = Date.parse(trimmed);
  if (!isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return undefined;
}

export class OpenAICompatibleConnector implements ProviderConnector {
  readonly type = 'openai-compatible';
  readonly id: string;
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly discoveryPath: string;
  private readonly authHeaderName: string;
  private readonly parseModelHook?: (raw: unknown) => RawModel;
  private readonly version: string;
  private readonly timeoutMs: number;

  constructor(cfg: OpenAICompatibleConfig) {
    this.id = cfg.id ?? 'openai-compatible';
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.apiKey = cfg.apiKey;
    this.defaultHeaders = cfg.defaultHeaders ?? {};
    this.discoveryPath = cfg.discoveryPath ?? '/models';
    this.authHeaderName = cfg.authHeaderName ?? 'Authorization';
    this.parseModelHook = cfg.parseModel;
    this.version = cfg.version ?? '0.0.0-dev';
    this.timeoutMs = cfg.timeoutMs ?? 30000;
  }

  private getHeaders(): Record<string, string> {
    const authVal =
      this.authHeaderName.toLowerCase() === 'authorization'
        ? `Bearer ${this.apiKey}`
        : this.apiKey;

    return {
      'User-Agent': `flappycode/${this.version}`,
      [this.authHeaderName]: authVal,
      ...this.defaultHeaders,
    };
  }

  async authenticate(_cfg?: ProviderConfig, signal?: AbortSignal): Promise<AuthResult> {
    try {
      await this.listModels(signal);
      return { authenticated: true };
    } catch (err) {
      if (err instanceof AuthError) {
        throw err;
      }
      if (err instanceof Error) {
        throw new AuthError(this.id, redactSecrets(err.message, [this.apiKey]));
      }
      throw new AuthError(this.id, 'Authentication validation failed');
    }
  }

  async listModels(signal?: AbortSignal): Promise<RawModel[]> {
    const url = `${this.baseUrl}${this.discoveryPath.startsWith('/') ? '' : '/'}${this.discoveryPath}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal,
      });
    } catch (err: unknown) {
      if (signal?.aborted) {
        throw new AbortedError('Model discovery');
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new NetworkError(this.id, redactSecrets(msg, [this.apiKey]));
    }

    if (!res.ok) {
      await this.handleHttpErrors(res);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new MalformedResponseError(this.id, 'Failed to parse JSON response from models endpoint');
    }

    let items: unknown[] = [];
    if (Array.isArray(json)) {
      items = json;
    } else if (json && typeof json === 'object' && 'data' in json && Array.isArray((json as { data: unknown[] }).data)) {
      items = (json as { data: unknown[] }).data;
    } else {
      throw new MalformedResponseError(this.id, 'Models endpoint returned unrecognized structure');
    }

    return items.map((item) => {
      if (this.parseModelHook) {
        return this.parseModelHook(item);
      }
      if (item && typeof item === 'object' && 'id' in item) {
        const idStr = String((item as { id: unknown }).id);
        const nameStr = 'name' in item ? String((item as { name: unknown }).name) : idStr;
        return { id: idStr, name: nameStr, raw: item };
      }
      return { id: String(item), raw: item };
    });
  }

  async *complete(
    req: CompletionRequest,
    signal?: AbortSignal,
  ): AsyncIterable<CompletionChunk> {
    const url = `${this.baseUrl}/chat/completions`;

    const bodyPayload: Record<string, unknown> = {
      model: req.model,
      messages: req.messages.map((m) => {
        const baseMsg: Record<string, unknown> = {
          role: m.role,
          content: m.content,
        };
        if (m.toolCalls && m.toolCalls.length > 0) {
          baseMsg.tool_calls = m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          }));
        }
        if (m.toolCallId) {
          baseMsg.tool_call_id = m.toolCallId;
        }
        return baseMsg;
      }),
      stream: true,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
    };

    if (req.tools && req.tools.length > 0) {
      bodyPayload.tools = req.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    let res: Response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    const onUserAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onUserAbort);
    }

    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getHeaders(),
        },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (signal?.aborted) {
        throw new AbortedError('Completion stream');
      }
      if (controller.signal.aborted) {
        throw new TimeoutError(this.id, this.timeoutMs);
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new NetworkError(this.id, redactSecrets(msg, [this.apiKey]));
    } finally {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', onUserAbort);
      }
    }

    if (!res.ok) {
      await this.handleHttpErrors(res);
    }

    if (!res.body) {
      throw new MalformedResponseError(this.id, 'Response body is empty');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Accumulated tool calls indexed by tool_call index or id
    const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();

    try {
      while (true) {
        if (signal?.aborted) {
          throw new AbortedError('Completion stream');
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue; // Skip comments/keepalives

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              // Emit any accumulated tool calls before finish
              for (const tc of toolCallsMap.values()) {
                try {
                  JSON.parse(tc.arguments);
                  yield {
                    type: 'tool-call',
                    toolCall: {
                      id: tc.id || `call_${Date.now()}`,
                      name: tc.name,
                      arguments: tc.arguments,
                    },
                  };
                } catch {
                  yield {
                    type: 'error',
                    error: new MalformedResponseError(
                      this.id,
                      `Failed to parse arguments JSON for tool call "${tc.name}"`,
                    ),
                  };
                }
              }
              yield { type: 'finish', reason: 'stop' };
              return;
            }

            interface StreamChunkPayload {
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{
                    index?: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string | null;
              }>;
              usage?: {
                prompt_tokens?: number;
                completion_tokens?: number;
                total_tokens?: number;
              };
            }

            let chunkObj: StreamChunkPayload;
            try {
              chunkObj = JSON.parse(dataStr) as StreamChunkPayload;
            } catch {
              yield {
                type: 'error',
                error: new MalformedResponseError(this.id, 'Malformed JSON in SSE chunk'),
              };
              continue;
            }

            const choice = chunkObj.choices?.[0];
            if (choice) {
              // Text delta
              if (choice.delta?.content) {
                yield { type: 'text-delta', text: choice.delta.content };
              }

              // Tool call fragments
              if (choice.delta?.tool_calls && Array.isArray(choice.delta.tool_calls)) {
                for (const tcDelta of choice.delta.tool_calls) {
                  const idx = tcDelta.index ?? 0;
                  const existing = toolCallsMap.get(idx) ?? { id: '', name: '', arguments: '' };

                  if (tcDelta.id) existing.id = tcDelta.id;
                  if (tcDelta.function?.name) existing.name += tcDelta.function.name;
                  if (tcDelta.function?.arguments) existing.arguments += tcDelta.function.arguments;

                  toolCallsMap.set(idx, existing);
                }
              }

              // Finish reason
              if (choice.finish_reason) {
                const reason = choice.finish_reason;
                if (reason === 'tool_calls' || toolCallsMap.size > 0) {
                  for (const tc of toolCallsMap.values()) {
                    try {
                      JSON.parse(tc.arguments);
                      yield {
                        type: 'tool-call',
                        toolCall: {
                          id: tc.id || `call_${Date.now()}`,
                          name: tc.name,
                          arguments: tc.arguments,
                        },
                      };
                    } catch {
                      yield {
                        type: 'error',
                        error: new MalformedResponseError(
                          this.id,
                          `Failed to parse arguments JSON for tool call "${tc.name}"`,
                        ),
                      };
                    }
                  }
                  yield { type: 'finish', reason: 'tool-calls' };
                } else if (reason === 'stop') {
                  yield { type: 'finish', reason: 'stop' };
                } else if (reason === 'length') {
                  yield { type: 'finish', reason: 'length' };
                } else {
                  yield { type: 'finish', reason: 'stop' };
                }
              }
            }

            // Usage reporting in stream
            if (chunkObj.usage) {
              yield {
                type: 'usage',
                usage: {
                  promptTokens: chunkObj.usage.prompt_tokens ?? 0,
                  completionTokens: chunkObj.usage.completion_tokens ?? 0,
                  totalTokens: chunkObj.usage.total_tokens ?? 0,
                },
              };
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async healthCheck(_signal?: AbortSignal): Promise<HealthInfo> {
    const start = Date.now();
    try {
      await this.listModels(_signal);
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        lastChecked: Date.now(),
      };
    } catch (err: unknown) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        lastChecked: Date.now(),
        message: err instanceof Error ? redactSecrets(err.message, [this.apiKey]) : String(err),
      };
    }
  }

  private async handleHttpErrors(res: Response): Promise<never> {
    const status = res.status;
    let rawText = '';
    try {
      rawText = await res.text();
    } catch {
      // ignore
    }
    const details = rawText
      ? redactSecrets(rawText, [this.apiKey])
      : `Upstream server returned ${status}`;

    if (status === 401 || status === 403) {
      throw new AuthError(this.id, details);
    }
    if (status === 429) {
      const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      throw new RateLimitError(this.id, retryAfterMs);
    }
    if (status >= 500) {
      throw new ServerError(this.id, status, details);
    }
    throw new ServerError(this.id, status, details);
  }
}
