/**
 * Base class for all provider-related errors.
 * Enforces stable error codes and "what happened -> why -> what to do" message style.
 */
export class ProviderError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthError extends ProviderError {
  constructor(provider: string, details?: string) {
    super(
      `Authentication failed with ${provider}. ${details ?? 'The API key or credentials were rejected (401/403)'}. Please verify your key with: flappycode providers add ${provider}`,
      'AUTH_FAILED',
    );
  }
}

export class RateLimitError extends ProviderError {
  readonly retryAfterMs?: number;

  constructor(provider: string, retryAfterMs?: number) {
    const afterNotice = retryAfterMs
      ? `Rate limit will reset in approximately ${Math.ceil(retryAfterMs / 1000)}s.`
      : 'No Retry-After header was provided.';
    super(
      `Rate limit exceeded on ${provider}. Too many requests sent in the current window. ${afterNotice} FlappyCode will automatically attempt fallback to another free model.`,
      'RATE_LIMITED',
    );
    this.retryAfterMs = retryAfterMs;
  }
}

export class ServerError extends ProviderError {
  readonly status: number;

  constructor(provider: string, status: number, details?: string) {
    super(
      `Server error from ${provider} (HTTP ${status}). ${details ?? 'The upstream provider experienced an internal failure'}. Wait briefly or switch models.`,
      'SERVER_ERROR',
    );
    this.status = status;
  }
}

export class NetworkError extends ProviderError {
  constructor(provider: string, details?: string) {
    super(
      `Network connection to ${provider} failed. ${details ?? 'The endpoint could not be reached or DNS lookup failed'}. Check your internet connection and proxy settings.`,
      'NETWORK_ERROR',
    );
  }
}

export class TimeoutError extends ProviderError {
  readonly timeoutMs: number;

  constructor(provider: string, timeoutMs: number) {
    super(
      `Request to ${provider} timed out after ${timeoutMs}ms. The upstream server did not respond in time. Consider retrying or checking provider status.`,
      'TIMEOUT',
    );
    this.timeoutMs = timeoutMs;
  }
}

export class MalformedResponseError extends ProviderError {
  constructor(provider: string, details?: string) {
    super(
      `Malformed response from ${provider}. ${details ?? 'The response body could not be parsed as valid JSON or expected stream structure'}. The system will attempt one automatic repair before switching models.`,
      'MALFORMED_RESPONSE',
    );
  }
}

export class ModelNotFoundError extends ProviderError {
  readonly modelId: string;

  constructor(provider: string, modelId: string) {
    super(
      `Model "${modelId}" was not found on ${provider}. The model may have been deprecated, renamed, or requires special account access. Check available models using: flappycode models`,
      'MODEL_NOT_FOUND',
    );
    this.modelId = modelId;
  }
}

export class AbortedError extends ProviderError {
  constructor(operation = 'Request') {
    super(
      `${operation} was cancelled by user signal. The active operation was terminated before completion. You may submit a new prompt.`,
      'ABORTED',
    );
  }
}

/**
 * Utility to scrub secrets like Bearer tokens and known API keys from text.
 */
export function redactSecrets(text: string, knownSecrets: string[] = []): string {
  let result = text;

  // Redact Bearer tokens
  result = result.replace(/Bearer\s+([A-Za-z0-9_\-.~+/]+=*)/gi, 'Bearer [REDACTED]');

  // Redact Authorization headers
  result = result.replace(
    /(Authorization:\s*)([^\r\n]+)/gi,
    '$1[REDACTED]',
  );

  // Redact known explicit secrets
  for (const secret of knownSecrets) {
    if (secret && secret.length >= 4) {
      result = result.replaceAll(secret, '[REDACTED]');
    }
  }

  // Redact common API key patterns (sk-..., gsk_..., etc.)
  result = result.replace(
    /\b(sk-[a-zA-Z0-9_-]{8,}|gsk_[a-zA-Z0-9_-]{8,}|AIza[a-zA-Z0-9_-]{20,})\b/g,
    '[REDACTED]',
  );

  return result;
}
