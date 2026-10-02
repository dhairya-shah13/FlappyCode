import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENTS } from '@flappycode/core';

/**
 * GAP-019: Search tool for agents — verifies access controls.
 */
describe('GAP-019 — Search Tool for Agents', () => {
  it('Coder agent has search in allowed_tools', () => {
    expect(BUILTIN_AGENTS['Coder'].allowed_tools).toContain('search');
  });

  it('Codebase-Analyst agent has search in allowed_tools', () => {
    expect(BUILTIN_AGENTS['Codebase-Analyst'].allowed_tools).toContain('search');
  });

  it('File-Finder agent has search in allowed_tools', () => {
    expect(BUILTIN_AGENTS['File-Finder'].allowed_tools).toContain('search');
  });

  it('Reviewer agent does NOT have search in allowed_tools', () => {
    expect(BUILTIN_AGENTS['Reviewer'].allowed_tools).not.toContain('search');
  });

  it('Command-Executor agent does NOT have search in allowed_tools', () => {
    expect(BUILTIN_AGENTS['Command-Executor'].allowed_tools).not.toContain('search');
  });

  it('Tester agent does NOT have search in allowed_tools', () => {
    expect(BUILTIN_AGENTS['Tester'].allowed_tools).not.toContain('search');
  });
});
