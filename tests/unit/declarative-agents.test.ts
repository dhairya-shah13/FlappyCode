import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadAgentsFromProject, mergeAgents, parseAgentYaml } from '@flappycode/core';
import { BUILTIN_AGENTS } from '@flappycode/core';

/**
 * GAP-008: Declarative agent definitions from .flappycode/agents/*.
 */
describe('GAP-008 — Declarative Agent Definitions', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-agents-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty agents when .flappycode/agents/ does not exist', () => {
    const result = loadAgentsFromProject(tmpDir);
    expect(Object.keys(result.agents)).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('loads a valid YAML agent definition', () => {
    const agentsDir = path.join(tmpDir, '.flappycode', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'security-auditor.yaml'),
      `name: SecurityAuditor
system_prompt: You are a security auditor. Find vulnerabilities.
allowed_tools: [fs_read, search]
preferred_model_ref: flappyauto
fallback_policy: next_best_fit
`
    );

    const result = loadAgentsFromProject(tmpDir);
    expect(result.errors).toHaveLength(0);
    expect(result.agents['SecurityAuditor']).toBeDefined();
    expect(result.agents['SecurityAuditor'].allowed_tools).toContain('search');
    expect(result.agents['SecurityAuditor'].system_prompt).toContain('security auditor');
  });

  it('loads a valid JSON agent definition', () => {
    const agentsDir = path.join(tmpDir, '.flappycode', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'doc-writer.json'),
      JSON.stringify({
        name: 'DocWriter',
        system_prompt: 'Write documentation.',
        allowed_tools: ['fs_read', 'fs_write'],
        preferred_model_ref: 'flappyauto',
        fallback_policy: 'next_best_fit',
      })
    );

    const result = loadAgentsFromProject(tmpDir);
    expect(result.errors).toHaveLength(0);
    expect(result.agents['DocWriter']).toBeDefined();
  });

  it('overrides a built-in agent with a custom definition of the same name', () => {
    const agentsDir = path.join(tmpDir, '.flappycode', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'coder.yaml'),
      `name: Coder
system_prompt: Custom Coder prompt for this project.
allowed_tools: [fs_read, fs_write, shell_exec]
preferred_model_ref: flappyauto
fallback_policy: ask_user
`
    );

    const result = loadAgentsFromProject(tmpDir);
    const merged = mergeAgents(result.agents);
    // The custom Coder should override the builtin
    expect(merged['Coder'].system_prompt).toContain('Custom Coder');
    expect(merged['Coder'].allowed_tools).toContain('shell_exec');
  });

  it('reports errors for invalid agent files without silently ignoring', () => {
    const agentsDir = path.join(tmpDir, '.flappycode', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'broken.yaml'), 'not: valid: yaml: here');

    const result = loadAgentsFromProject(tmpDir);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].error).toBeTruthy();
  });

  it('parses YAML subset correctly', () => {
    const yaml = `name: Test
system_prompt: |
  You are a test agent.
  Multiple lines.
allowed_tools:
  - fs_read
  - search
preferred_model_ref: flappyauto
fallback_policy: next_best_fit`;

    const parsed = parseAgentYaml(yaml, 'test.yaml');
    expect(parsed.name).toBe('Test');
    expect(parsed.system_prompt).toContain('Multiple lines');
    expect(parsed.allowed_tools).toEqual(['fs_read', 'search']);
  });
});
