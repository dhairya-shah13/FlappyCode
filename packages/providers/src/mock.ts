import { ProviderConfig, RawModel } from '@flappycode/protocol';
import {
  AuthResult,
  CompletionChunk,
  CompletionRequest,
  HealthInfo,
  ProviderConnector,
  QuotaInfo,
} from './types.js';

export interface MockScenario {
  forceAuthFailure?: boolean;
  authError?: string;
  models?: RawModel[];
  rateLimitCountdown?: number;
  retryAfterSeconds?: number;
  force5xx?: boolean;
  forceTimeout?: boolean;
  forceMalformedJson?: boolean;
  forceMalformedToolCall?: boolean;
  disappearingModels?: Set<string>;
  quotaExhausted?: boolean;
  /** Models that FAIL the tool-calling capability probe (never emit tool calls). */
  failToolProbe?: Set<string>;
  /** Models with vision support (for vision routing tests). */
  visionModels?: Set<string>;
  /**
   * Per-model failure injection for fallback scenario tests:
   * fail the next `times` completions (undefined = forever) with `kind`.
   */
  failModels?: Record<string, { kind: 'rate_limit' | 'server' | 'timeout' | 'quota' | 'not_found'; times?: number; retryAfterSeconds?: number }>;
  cannedResponses?: Record<string, string[]>; // modelId -> sequence of responses
  cannedToolCalls?: Record<
    string,
    Array<Array<{ name: string; arguments: Record<string, any> }>>
  >;
}

export class MockProviderConnector implements ProviderConnector {
  public readonly type = 'mock';
  private callCounts: Record<string, number> = {};
  public scenario: MockScenario;

  constructor(scenario: MockScenario = {}) {
    this.scenario = {
      models: [
        {
          id: 'mock-coder-free',
          name: 'Mock Coder Free',
          context_length: 32768,
          supports_tools: true,
          supports_vision: false,
          price_in: 0,
          price_out: 0,
        },
        {
          id: 'mock-planner-free',
          name: 'Mock Planner Free',
          context_length: 16384,
          supports_tools: true,
          supports_vision: false,
          price_in: 0,
          price_out: 0,
        },
        {
          id: 'mock-reviewer-free',
          name: 'Mock Reviewer Free',
          context_length: 32768,
          supports_tools: true,
          supports_vision: false,
          price_in: 0,
          price_out: 0,
        },
        {
          id: 'mock-analyst-free',
          name: 'Mock Analyst Free',
          context_length: 65536,
          supports_tools: true,
          supports_vision: false,
          price_in: 0,
          price_out: 0,
        },
        {
          id: 'mock-expensive-paid',
          name: 'Mock Expensive Paid',
          context_length: 128000,
          supports_tools: true,
          supports_vision: true,
          price_in: 10.0,
          price_out: 30.0,
        },
      ],
      ...scenario,
    };
  }

  public async authenticate(_cfg: ProviderConfig, _apiKey?: string): Promise<AuthResult> {
    if (this.scenario.forceAuthFailure) {
      return {
        success: false,
        error: this.scenario.authError || 'Mock 401: Invalid API key',
        category: 'auth' as const,
      };
    }
    return { success: true };
  }

  public async listModels(_cfg: ProviderConfig, _apiKey?: string): Promise<RawModel[]> {
    if (this.scenario.disappearingModels) {
      return (this.scenario.models || []).filter(
        (m) => !this.scenario.disappearingModels?.has(m.id)
      );
    }
    return this.scenario.models || [];
  }

  public async *complete(
    cfgOrReq: any,
    maybeReq?: any
  ): AsyncIterable<CompletionChunk> {
    const req = maybeReq || cfgOrReq;
    const model = req.model || req.modelId;
    const count = (this.callCounts[model] || 0) + 1;
    this.callCounts[model] = count;

    // Capability probe round-trip (FR-MOD-007): simulate a model that can call
    // tools unless the scenario marks this model as probe-failing.
    const wantsProbe = Array.isArray(req.messages)
      ? req.messages.some((m: any) => typeof m.content === 'string' && m.content.includes('test_probe_tool'))
      : false;
    if (wantsProbe && !this.scenario.forceTimeout && !this.scenario.force5xx && !this.scenario.quotaExhausted) {
      if (this.scenario.failToolProbe?.has(model)) {
        yield { delta: 'I cannot call tools.' };
        return;
      }
      yield {
        tool_calls: [
          {
            id: `probe_${Date.now()}`,
            index: 0,
            type: 'function',
            function: { name: 'test_probe_tool', arguments: '{"ping":"pong"}' },
          },
        ],
        finish_reason: 'tool_calls',
      };
      return;
    }

    // Per-model failure injection (fallback scenario harness)
    const failing = this.scenario.failModels?.[model];
    if (failing && (failing.times === undefined || failing.times > 0)) {
      if (failing.times !== undefined) failing.times--;
      switch (failing.kind) {
        case 'rate_limit':
          throw new Error(
            `Mock 429: Rate limit exceeded. Retry-After: ${failing.retryAfterSeconds ?? 1}`
          );
        case 'server':
          throw new Error('Mock 500: Internal server error on provider backend');
        case 'timeout':
          throw new Error('Mock request timed out after 10000ms');
        case 'quota':
          throw new Error('Mock 429: Free quota exhausted for this account');
        case 'not_found':
          throw new Error(`Mock 404: Model '${model}' not found on provider`);
      }
    }

    if (this.scenario.forceTimeout) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      throw new Error('Mock request timed out');
    }

    if (this.scenario.force5xx) {
      throw new Error('Mock 500: Internal server error on provider backend');
    }

    if (this.scenario.quotaExhausted) {
      throw new Error('Mock 429: Free quota exhausted for this account');
    }

    if (this.scenario.rateLimitCountdown && this.scenario.rateLimitCountdown > 0) {
      this.scenario.rateLimitCountdown--;
      const retryAfter = this.scenario.retryAfterSeconds || 2;
      throw new Error(`Mock 429: Rate limit exceeded. Retry-After: ${retryAfter}`);
    }

    if (this.scenario.disappearingModels?.has(model)) {
      throw new Error(`Mock 404: Model '${model}' not found on provider`);
    }

    if (this.scenario.forceMalformedJson) {
      yield { delta: '{"incomplete_json: true, ' };
      return;
    }

    if (this.scenario.forceMalformedToolCall) {
      yield {
        tool_calls: [
          {
            id: 'call_bad',
            index: 0,
            type: 'function',
            function: {
              name: 'non_existent_tool',
              arguments: '{ unparseable arguments...',
            },
          },
        ],
      };
      return;
    }

    // Check if canned tool call exists — only for requests that actually
    // advertise tools (the planner never does, so its canned plan JSON is safe).
    const toolCallSeq = req.tools ? this.scenario.cannedToolCalls?.[model] : undefined;
    if (toolCallSeq && toolCallSeq.length > 0) {
      const toolCalls = toolCallSeq.shift()!;
      yield {
        tool_calls: toolCalls.map((tc, idx) => ({
          id: `mock_tc_${Date.now()}_${idx}`,
          index: idx,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        })),
        finish_reason: 'tool_calls',
      };
      return;
    }

    // Check if canned response text exists
    const cannedSeq = this.scenario.cannedResponses?.[model];
    let fullText = 'Mock assistant response';
    if (cannedSeq && cannedSeq.length > 0) {
      fullText = cannedSeq.shift()!;
    } else {
      // Default intelligent response for planner if prompt contains goal
      const lastMsg = req.messages[req.messages.length - 1]?.content || '';
      if (req.model.includes('planner') || lastMsg.includes('Fix failing test')) {
        fullText = JSON.stringify({
          goal: 'Fix test in auth.ts',
          files_to_modify: ['src/auth.ts'],
          assumptions: ['UTC time is used'],
          risks: ['Token expiration edge case'],
          nodes: [
            {
              id: 'node-1',
              agent: 'File-Finder',
              description: 'Find auth handlers',
              depends_on: [],
            },
            {
              id: 'node-2',
              agent: 'Coder',
              description: 'Patch token validation in src/auth.ts',
              depends_on: ['node-1'],
            },
            {
              id: 'node-3',
              agent: 'Tester',
              description: 'Run npm test',
              depends_on: ['node-2'],
            },
            {
              id: 'node-4',
              agent: 'Reviewer',
              description: 'Review diff and verification',
              depends_on: ['node-3'],
            },
          ],
        });
      }
    }

    // Stream out words as chunks
    const words = fullText.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield { delta: (i > 0 ? ' ' : '') + words[i] };
    }

    yield {
      finish_reason: 'stop',
      usage: {
        tokens_in: 50,
        tokens_out: words.length * 2,
      },
    };
  }

  public async getQuota(_cfg: ProviderConfig): Promise<QuotaInfo | 'unknown'> {
    if (this.scenario.quotaExhausted) {
      return { remainingRequests: 0, remainingTokens: 0, isEstimate: false };
    }
    return { remainingRequests: 500, remainingTokens: 100000, isEstimate: false };
  }

  public async healthCheck(_cfg: ProviderConfig): Promise<HealthInfo> {
    if (this.scenario.forceAuthFailure) {
      return {
        status: 'auth_failed',
        latencyMs: 15,
        lastChecked: Date.now(),
        error: this.scenario.authError,
      };
    }
    return {
      status: 'healthy',
      latencyMs: 12,
      lastChecked: Date.now(),
    };
  }
}
