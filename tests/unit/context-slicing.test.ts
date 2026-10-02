import { describe, expect, it, beforeEach } from 'vitest';
import { ContextManager, AgentRole } from '@flappycode/core';

/**
 * GAP-026: Context slicing, project memory, and compaction.
 */
describe('GAP-026 — Context Slicing & Project Memory', () => {
  let ctx: ContextManager;

  beforeEach(() => {
    ctx = new ContextManager();
  });

  it('stores and retrieves in-memory project memory', () => {
    ctx.setMemory('convention', 'use 2-space indent');
    expect(ctx.getMemory('convention')).toBe('use 2-space indent');
  });

  it('returns undefined for non-existent keys', () => {
    expect(ctx.getMemory('nonexistent')).toBeUndefined();
  });

  it('builds a File-Finder context slice with directory tree', () => {
    const slice = ctx.buildAgentSlice('File-Finder', {
      goal: 'Find the login module',
      history: [{ role: 'user', content: 'Where is login?' }],
      directoryTree: ['src/', 'src/auth/', 'src/auth/login.ts'],
    });

    expect(slice.goal).toBe('Find the login module');
    // System message should contain directory tree info
    const systemMsg = slice.turns.find((t) => t.role === 'system');
    expect(systemMsg?.content).toContain('Directory tree');
    expect(systemMsg?.content).toContain('login.ts');
  });

  it('builds a Coder context slice with plan and feedback', () => {
    const slice = ctx.buildAgentSlice('Coder', {
      goal: 'Fix the bug',
      history: [{ role: 'user', content: 'Fix this error' }],
      plan: 'Modify auth/login.ts to handle null case',
      feedbackHistory: 'Tester: VERDICT: FAIL - login returns undefined',
    });

    const systemMsg = slice.turns.find((t) => t.role === 'system');
    expect(systemMsg?.content).toContain('Approved plan');
    expect(systemMsg?.content).toContain('Previous feedback');
  });

  it('builds a Tester context slice with changed files', () => {
    const slice = ctx.buildAgentSlice('Tester', {
      goal: 'Test the login fix',
      history: [],
      changedFiles: ['src/auth/login.ts'],
      testCommands: ['pnpm test'],
    });

    const systemMsg = slice.turns.find((t) => t.role === 'system');
    expect(systemMsg?.content).toContain('login.ts');
    expect(systemMsg?.content).toContain('pnpm test');
  });

  it('builds a Reviewer context slice with diff and rules', () => {
    const slice = ctx.buildAgentSlice('Reviewer', {
      goal: 'Review the fix',
      history: [],
      unifiedDiff: '--- a/file.ts\n+++ b/file.ts\n-old\n+new',
      codingRules: 'No unused variables',
      testerVerdict: 'VERDICT: PASS',
    });

    const systemMsg = slice.turns.find((t) => t.role === 'system');
    expect(systemMsg?.content).toContain('Unified diff');
    expect(systemMsg?.content).toContain('Tester verdict');
  });

  it('compacts context when approaching 80% of model context window', () => {
    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: 'x'.repeat(5000),
    }));

    const slice = ctx.buildContextSlice('goal', longHistory, [], 8192);
    expect(slice.compacted).toBe(true);
    // Should retain first turn + summary + last 2 turns = 4 turns total
    expect(slice.turns.length).toBeLessThan(longHistory.length);
    expect(slice.turns.length).toBe(4);
    expect(slice.turns[1].content).toContain('compacted');
  });

  it('does NOT compact when below 80% threshold', () => {
    const shortHistory = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi' },
    ];

    const slice = ctx.buildContextSlice('goal', shortHistory, [], 32768);
    expect(slice.compacted).toBe(false);
    expect(slice.turns).toHaveLength(2);
  });
});
