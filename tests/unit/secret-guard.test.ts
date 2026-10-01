import { describe, expect, it } from 'vitest';
import { SecretGuard } from '@flappycode/core';

describe('SecretGuard Redaction Tests (FR-TOO-007)', () => {
  it('Redacts known API keys matching regex patterns', () => {
    const guard = new SecretGuard();
    const openAiText = 'Contacted upstream with Authorization: Bearer sk-1234567890abcdef1234567890';
    const groqText = 'Groq client initialized with gsk_abcdef1234567890abcdef12';

    expect(guard.redact(openAiText)).toContain('[REDACTED_KEY]');
    expect(guard.redact(openAiText)).not.toContain('sk-1234567890abcdef1234567890');

    expect(guard.redact(groqText)).toContain('[REDACTED_KEY]');
    expect(guard.redact(groqText)).not.toContain('gsk_abcdef1234567890abcdef12');
  });

  it('Redacts dynamically registered secrets', () => {
    const guard = new SecretGuard();
    const customSecret = 'my-super-secret-token-xyz-987';
    guard.addSecret(customSecret);

    const logMessage = `Error processing request for token ${customSecret} in environment`;
    const redacted = guard.redact(logMessage);

    expect(redacted).toBe('Error processing request for token [REDACTED_SECRET] in environment');
    expect(guard.containsSecret(logMessage)).toBe(true);
    expect(guard.containsSecret('clean message')).toBe(false);
  });
});
