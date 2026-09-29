import { describe, it, expect } from 'vitest';
import {
  AuthError,
  RateLimitError,
  ServerError,
  NetworkError,
  TimeoutError,
  MalformedResponseError,
  ModelNotFoundError,
  AbortedError,
  redactSecrets,
} from '../errors.js';

describe('Provider Errors', () => {
  it('AuthError formats code and message', () => {
    const err = new AuthError('Groq', 'Invalid token');
    expect(err.code).toBe('AUTH_FAILED');
    expect(err.message).toContain('Authentication failed with Groq');
    expect(err.message).toContain('flappycode providers add Groq');
  });

  it('RateLimitError formats code and retryAfterMs', () => {
    const err = new RateLimitError('OpenRouter', 30000);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryAfterMs).toBe(30000);
    expect(err.message).toContain('30s');
  });

  it('ServerError retains HTTP status', () => {
    const err = new ServerError('Anthropic', 503, 'Service unavailable');
    expect(err.code).toBe('SERVER_ERROR');
    expect(err.status).toBe(503);
  });

  it('TimeoutError retains timeoutMs', () => {
    const err = new TimeoutError('Google', 8000);
    expect(err.code).toBe('TIMEOUT');
    expect(err.timeoutMs).toBe(8000);
  });

  it('NetworkError formats correctly', () => {
    const err = new NetworkError('Together');
    expect(err.code).toBe('NETWORK_ERROR');
  });

  it('MalformedResponseError formats correctly', () => {
    const err = new MalformedResponseError('Ollama');
    expect(err.code).toBe('MALFORMED_RESPONSE');
  });

  it('ModelNotFoundError retains modelId', () => {
    const err = new ModelNotFoundError('OpenAI', 'gpt-ancient');
    expect(err.code).toBe('MODEL_NOT_FOUND');
    expect(err.modelId).toBe('gpt-ancient');
  });

  it('AbortedError formats correctly', () => {
    const err = new AbortedError();
    expect(err.code).toBe('ABORTED');
  });
});

describe('redactSecrets', () => {
  it('redacts Bearer tokens in headers or text', () => {
    const input = 'Authorization: Bearer sk-ant-secret1234567890';
    const redacted = redactSecrets(input);
    expect(redacted).not.toContain('sk-ant-secret1234567890');
    expect(redacted).toContain('[REDACTED]');
  });

  it('redacts custom supplied keys', () => {
    const secretKey = 'my-super-secret-key-value';
    const input = `Connecting with key ${secretKey} to provider`;
    const redacted = redactSecrets(input, [secretKey]);
    expect(redacted).not.toContain(secretKey);
    expect(redacted).toBe('Connecting with key [REDACTED] to provider');
  });

  it('redacts common OpenAI and Groq key prefixes', () => {
    const text = 'Failed key sk-proj-1234567890abcdef and gsk_9876543210abcdef';
    const redacted = redactSecrets(text);
    expect(redacted).not.toContain('sk-proj-1234567890abcdef');
    expect(redacted).not.toContain('gsk_9876543210abcdef');
  });
});
