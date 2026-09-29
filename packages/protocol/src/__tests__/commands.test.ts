import { describe, it, expect } from 'vitest';
import { CommandSchema } from '../commands.js';

describe('CommandSchema', () => {
  it('validates submitPrompt command', () => {
    const cmd = {
      type: 'submitPrompt',
      prompt: 'Refactor login component',
      model: 'flappyauto',
    };
    const parsed = CommandSchema.parse(cmd);
    expect(parsed.type).toBe('submitPrompt');
  });

  it('validates approvePlan command', () => {
    const cmd = { type: 'approvePlan', runId: 'run-123' };
    const parsed = CommandSchema.parse(cmd);
    expect(parsed.type).toBe('approvePlan');
  });

  it('validates rejectPlan command', () => {
    const cmd = { type: 'rejectPlan', runId: 'run-123', reason: 'Too complex' };
    const parsed = CommandSchema.parse(cmd);
    expect(parsed.type).toBe('rejectPlan');
  });

  it('validates approveDiff command', () => {
    const cmd = { type: 'approveDiff', runId: 'run-123', hunks: ['hunk1', 'hunk2'] };
    const parsed = CommandSchema.parse(cmd);
    expect(parsed.type).toBe('approveDiff');
  });

  it('validates answerQuestion command', () => {
    const cmd = { type: 'answerQuestion', questionId: 'q-1', answer: 'Use Option A' };
    const parsed = CommandSchema.parse(cmd);
    expect(parsed.type).toBe('answerQuestion');
  });

  it('validates grantPermission command', () => {
    const cmd = {
      type: 'grantPermission',
      requestId: 'req-1',
      allow: true,
      alwaysForProject: true,
    };
    const parsed = CommandSchema.parse(cmd);
    expect(parsed.type).toBe('grantPermission');
  });

  it('validates cancelRun command', () => {
    const cmd = { type: 'cancelRun', runId: 'run-123' };
    const parsed = CommandSchema.parse(cmd);
    expect(parsed.type).toBe('cancelRun');
  });

  it('validates addProvider command', () => {
    const cmd = {
      type: 'addProvider',
      provider: {
        id: 'together',
        type: 'openai-compatible',
        displayName: 'Together AI',
        baseUrl: 'https://api.together.xyz/v1',
      },
      apiKey: 'sk-test-fake',
    };
    const parsed = CommandSchema.parse(cmd);
    expect(parsed.type).toBe('addProvider');
  });

  it('validates refreshProviders command', () => {
    const cmd = { type: 'refreshProviders' };
    const parsed = CommandSchema.parse(cmd);
    expect(parsed.type).toBe('refreshProviders');
  });

  it('validates pinModel command', () => {
    const cmd = { type: 'pinModel', agentName: 'coder', modelId: 'groq/llama-3.3-70b' };
    const parsed = CommandSchema.parse(cmd);
    expect(parsed.type).toBe('pinModel');
  });

  it('validates resolvePoolExhausted command', () => {
    const cmd = {
      type: 'resolvePoolExhausted',
      action: 'connect_provider',
      runId: 'run-456',
    };
    const parsed = CommandSchema.parse(cmd);
    expect(parsed.type).toBe('resolvePoolExhausted');
  });

  it('rejects unknown command type', () => {
    expect(() => CommandSchema.parse({ type: 'unknownCommand' })).toThrow();
  });
});
