import type { ProviderConfig } from '@flappycode/protocol';
import {
  ProviderConnector,
  CompletionRequest,
  CompletionChunk,
  RawModel,
  QuotaInfo,
  HealthInfo,
  AuthResult,
} from '../types.js';
import {
  AuthError,
  RateLimitError,
  ServerError,
  TimeoutError,
  MalformedResponseError,
  ModelNotFoundError,
} from '../errors.js';
import { ScenarioAction } from './dsl.js';

export interface RecordedCall {
  request: CompletionRequest;
  timestamp: number;
}

export class MockProvider implements ProviderConnector {
  readonly type = 'mock';
  readonly id: string;

  private actions: ScenarioAction[] = [];
  private models: RawModel[] = [
    { id: 'mock-model-free', name: 'Mock Model Free' },
    { id: 'mock-model-paid', name: 'Mock Model Paid' },
  ];

  public recordedCalls: RecordedCall[] = [];
  public authCalls: ProviderConfig[] = [];
  public quotaInfo: QuotaInfo | 'unknown' = {
    requestsRemaining: 100,
    tokensRemaining: 100000,
  };
  public health: HealthInfo = {
    healthy: true,
    latencyMs: 15,
    lastChecked: Date.now(),
  };

  constructor(id = 'mock-provider', initialActions: ScenarioAction[] = []) {
    this.id = id;
    this.actions = [...initialActions];
  }

  /**
   * Set or queue up the script of actions to execute on subsequent calls.
   */
  queueActions(...actions: ScenarioAction[]): void {
    this.actions.push(...actions);
  }

  setModels(models: RawModel[]): void {
    this.models = [...models];
  }

  async authenticate(cfg: ProviderConfig, _signal?: AbortSignal): Promise<AuthResult> {
    this.authCalls.push(cfg);
    const nextAction = this.peekAction();
    if (nextAction && nextAction.type === 'authFail') {
      this.consumeAction();
      throw new AuthError(this.id, nextAction.message);
    }
    return { authenticated: true };
  }

  async listModels(_signal?: AbortSignal): Promise<RawModel[]> {
    const nextAction = this.peekAction();
    if (nextAction && nextAction.type === 'vanishModel') {
      this.consumeAction();
      this.models = this.models.filter((m) => m.id !== nextAction.modelId);
    }
    return [...this.models];
  }

  async *complete(
    req: CompletionRequest,
    signal?: AbortSignal,
  ): AsyncIterable<CompletionChunk> {
    this.recordedCalls.push({ request: req, timestamp: Date.now() });

    if (signal?.aborted) {
      yield { type: 'finish', reason: 'stop' };
      return;
    }

    const action = this.consumeAction() ?? { type: 'ok', text: 'Mock standard response' };

    switch (action.type) {
      case 'ok': {
        const words = action.text.split(' ');
        for (let i = 0; i < words.length; i++) {
          if (signal?.aborted) return;
          yield { type: 'text-delta', text: words[i] + (i < words.length - 1 ? ' ' : '') };
        }
        yield {
          type: 'usage',
          usage: {
            promptTokens: 10,
            completionTokens: words.length,
            totalTokens: 10 + words.length,
          },
        };
        yield { type: 'finish', reason: 'stop' };
        break;
      }

      case 'okToolCall': {
        const argsStr =
          typeof action.args === 'string' ? action.args : JSON.stringify(action.args);
        yield {
          type: 'tool-call',
          toolCall: {
            id: `call_${Date.now()}`,
            name: action.name,
            arguments: argsStr,
          },
        };
        yield {
          type: 'usage',
          usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
        };
        yield { type: 'finish', reason: 'tool-calls' };
        break;
      }

      case 'rateLimit': {
        throw new RateLimitError(this.id, action.retryAfterMs);
      }

      case 'http5xx': {
        throw new ServerError(this.id, action.status, action.details);
      }

      case 'malformedJson': {
        yield { type: 'text-delta', text: action.text ?? '{"broken":' };
        throw new MalformedResponseError(this.id, 'Response contained broken JSON');
      }

      case 'malformedToolCall': {
        yield {
          type: 'tool-call',
          toolCall: {
            id: `call_${Date.now()}`,
            name: action.name ?? 'broken_tool',
            arguments: action.invalidArgs ?? '{"invalid": syntax',
          },
        };
        yield { type: 'finish', reason: 'tool-calls' };
        break;
      }

      case 'timeout': {
        throw new TimeoutError(this.id, action.timeoutMs ?? 5000);
      }

      case 'slowStream': {
        const words = action.text.split(' ');
        for (const word of words) {
          if (signal?.aborted) return;
          if (action.chunkDelayMs > 0) {
            await new Promise((r) => setTimeout(r, action.chunkDelayMs));
          }
          yield { type: 'text-delta', text: word + ' ' };
        }
        yield { type: 'finish', reason: 'stop' };
        break;
      }

      case 'vanishModel': {
        throw new ModelNotFoundError(this.id, action.modelId);
      }

      case 'authFail': {
        throw new AuthError(this.id, action.message);
      }
    }
  }

  async getQuota(_signal?: AbortSignal): Promise<QuotaInfo | 'unknown'> {
    return this.quotaInfo;
  }

  async healthCheck(_signal?: AbortSignal): Promise<HealthInfo> {
    return this.health;
  }

  private peekAction(): ScenarioAction | undefined {
    return this.actions[0];
  }

  private consumeAction(): ScenarioAction | undefined {
    return this.actions.shift();
  }
}
