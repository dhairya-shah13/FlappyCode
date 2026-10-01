import { ProviderConfig } from '@flappycode/protocol';
import { CompletionRequest, ProviderConnector, ToolDefinition } from '@flappycode/providers';

const PROBE_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'test_probe_tool',
    description: 'A tool for testing model tool call capabilities',
    parameters: {
      type: 'object',
      properties: {
        ping: { type: 'string', description: 'Echo message' },
      },
      required: ['ping'],
    },
  },
};

export class CapabilityProbe {
  private probeCache: Map<string, boolean> = new Map();

  public async probeToolCalling(
    connector: ProviderConnector,
    cfg: ProviderConfig,
    modelId: string,
    apiKey?: string
  ): Promise<boolean> {
    const cacheKey = `${cfg.id}:${modelId}`;
    if (this.probeCache.has(cacheKey)) {
      return this.probeCache.get(cacheKey)!;
    }

    const req: CompletionRequest = {
      model: modelId,
      messages: [
        {
          role: 'user',
          content: 'Please call the tool test_probe_tool with ping: "pong". Do not write text.',
        },
      ],
      tools: [PROBE_TOOL],
      temperature: 0,
      max_tokens: 100,
    };

    try {
      let sawToolCall = false;
      const chunks = connector.complete(cfg, req, apiKey);
      for await (const chunk of chunks) {
        if (chunk.tool_calls && chunk.tool_calls.length > 0) {
          sawToolCall = true;
          break;
        }
      }
      this.probeCache.set(cacheKey, sawToolCall);
      return sawToolCall;
    } catch {
      this.probeCache.set(cacheKey, false);
      return false;
    }
  }

  public getCachedResult(providerId: string, modelId: string): boolean | undefined {
    return this.probeCache.get(`${providerId}:${modelId}`);
  }

  public setCachedResult(providerId: string, modelId: string, passed: boolean): void {
    this.probeCache.set(`${providerId}:${modelId}`, passed);
  }

  /** Allow a fresh probe after a provider/model capability change (FR-MOD-007). */
  public invalidate(providerId: string, modelId?: string): void {
    if (modelId) {
      this.probeCache.delete(`${providerId}:${modelId}`);
      return;
    }
    for (const key of Array.from(this.probeCache.keys())) {
      if (key.startsWith(`${providerId}:`)) {
        this.probeCache.delete(key);
      }
    }
  }
}
