import { ProviderConfig, RawModel } from '@flappycode/protocol';

export interface AuthResult {
  success: boolean;
  error?: string;
  /** Failure category so add-flow can distinguish auth vs reachability (FR-PRV-002). */
  category?: 'auth' | 'unreachable' | 'rate_limited' | 'other';
}

export interface QuotaInfo {
  remainingRequests?: number;
  remainingTokens?: number;
  resetAt?: number;
  isEstimate?: boolean;
}

export interface HealthInfo {
  status: 'healthy' | 'rate_limited' | 'auth_failed' | 'offline';
  latencyMs: number;
  lastChecked: number;
  error?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface CompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  max_tokens?: number;
  signal?: AbortSignal;
}

export interface CompletionChunk {
  delta?: string;
  tool_calls?: Array<{
    id: string;
    index: number;
    type: 'function';
    function: {
      name?: string;
      arguments?: string;
    };
  }>;
  finish_reason?: string;
  usage?: {
    tokens_in: number;
    tokens_out: number;
  };
}

export interface ProviderConnector {
  readonly type: string;
  authenticate(cfg: ProviderConfig, apiKey?: string): Promise<AuthResult>;
  listModels(cfg: ProviderConfig, apiKey?: string): Promise<RawModel[]>;
  complete(cfg: ProviderConfig, req: CompletionRequest, apiKey?: string): AsyncIterable<CompletionChunk>;
  getQuota?(cfg: ProviderConfig, apiKey?: string): Promise<QuotaInfo | 'unknown'>;
  healthCheck(cfg: ProviderConfig, apiKey?: string): Promise<HealthInfo>;
}
