import type { ProviderConfig } from '@flappycode/protocol';

/**
 * Normalized tool call in messages and chunks.
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

/**
 * Normalized message representation.
 */
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

/**
 * Normalized tool definition provided to complete().
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

/**
 * Completion request sent to any ProviderConnector.
 */
export interface CompletionRequest {
  model: string;
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Discriminated union of chunks emitted during streaming completion.
 */
export type CompletionChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolCall: ToolCall }
  | {
      type: 'usage';
      usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      };
    }
  | {
      type: 'finish';
      reason: 'stop' | 'tool-calls' | 'length' | 'content-filter' | 'error';
    }
  | { type: 'error'; error: Error };

/**
 * Raw model returned directly from provider discovery before classification.
 */
export interface RawModel {
  id: string;
  name?: string;
  raw?: unknown;
}

/**
 * Provider quota information when available.
 */
export interface QuotaInfo {
  requestsRemaining?: number;
  tokensRemaining?: number;
  resetTime?: number | string;
  raw?: unknown;
}

/**
 * Provider health check result.
 */
export interface HealthInfo {
  healthy: boolean;
  latencyMs: number;
  lastChecked: number;
  message?: string;
}

/**
 * Authentication check result.
 */
export interface AuthResult {
  authenticated: boolean;
  message?: string;
}

/**
 * Standard interface for all LLM provider connectors.
 */
export interface ProviderConnector {
  readonly type: string;
  authenticate(cfg: ProviderConfig, signal?: AbortSignal): Promise<AuthResult>;
  listModels(signal?: AbortSignal): Promise<RawModel[]>;
  complete(req: CompletionRequest, signal?: AbortSignal): AsyncIterable<CompletionChunk>;
  getQuota?(signal?: AbortSignal): Promise<QuotaInfo | 'unknown'>;
  healthCheck(signal?: AbortSignal): Promise<HealthInfo>;
}
