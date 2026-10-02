import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RulesLoader } from '@flappycode/core';
import { PromptComposer } from '@flappycode/core';

describe('RulesLoader (GAP-018 / Universal, Project, and Nested Rules)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-rules-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('loads universal rules even when project has no local RULES.md', () => {
    const loader = new RulesLoader(tmpDir);
    const rules = loader.loadRules();

    expect(rules.universalRules).toBeDefined();
    expect(rules.universalRules.length).toBeGreaterThan(0);
    expect(rules.universalRules).toContain('Planning Before Execution');
    expect(rules.projectRules).toBe('');
    expect(rules.nestedRules).toHaveLength(0);
  });

  it('allows project RULES.md to extend universal rules', () => {
    const projectRules = '# Custom Project Rules\nAlways prefer functional programming patterns.';
    fs.writeFileSync(path.join(tmpDir, 'RULES.md'), projectRules, 'utf8');

    const loader = new RulesLoader(tmpDir);
    const rules = loader.loadRules();

    expect(rules.projectRules).toBe(projectRules);
    expect(rules.effectiveRules).toContain('## 1. UNIVERSAL OPERATING RULES');
    expect(rules.effectiveRules).toContain('## 3. PROJECT-LEVEL RULES');
    expect(rules.effectiveRules).toContain('Always prefer functional programming patterns.');
  });

  it('scopes nested directory rules to target files within that directory', () => {
    // Project root
    fs.writeFileSync(path.join(tmpDir, 'RULES.md'), '# Root Rules\nBase rules.', 'utf8');

    // Nested directory: src/auth
    const authDir = path.join(tmpDir, 'src', 'auth');
    fs.mkdirSync(authDir, { recursive: true });
    const authRules = '# Auth Rules\nRequire bcrypt with minimum work factor 12.';
    fs.writeFileSync(path.join(authDir, 'RULES.md'), authRules, 'utf8');

    // Nested directory: src/ui
    const uiDir = path.join(tmpDir, 'src', 'ui');
    fs.mkdirSync(uiDir, { recursive: true });
    const uiRules = '# UI Rules\nUse Tailwind CSS design tokens.';
    fs.writeFileSync(path.join(uiDir, 'RULES.md'), uiRules, 'utf8');

    const loader = new RulesLoader(tmpDir);

    // 1. Target file in src/auth
    const authTarget = path.join(authDir, 'login.ts');
    const authResolved = loader.loadRules(authTarget);
    expect(authResolved.nestedRules).toHaveLength(1);
    expect(authResolved.effectiveRules).toContain('Require bcrypt with minimum work factor 12.');
    expect(authResolved.effectiveRules).not.toContain('Use Tailwind CSS design tokens.');

    // 2. Target file in src/ui
    const uiTarget = path.join(uiDir, 'Button.tsx');
    const uiResolved = loader.loadRules(uiTarget);
    expect(uiResolved.nestedRules).toHaveLength(1);
    expect(uiResolved.effectiveRules).toContain('Use Tailwind CSS design tokens.');
    expect(uiResolved.effectiveRules).not.toContain('Require bcrypt');

    // 3. Unscoped target (root or other file)
    const rootTarget = path.join(tmpDir, 'README.md');
    const rootResolved = loader.loadRules(rootTarget);
    expect(rootResolved.nestedRules).toHaveLength(0);
  });

  it('supports multi-level nested precedence (ancestor -> child directory)', () => {
    const srcDir = path.join(tmpDir, 'src');
    const featureDir = path.join(srcDir, 'feature');
    fs.mkdirSync(featureDir, { recursive: true });

    fs.writeFileSync(path.join(srcDir, 'RULES.md'), '# Src Rules\nLevel 1', 'utf8');
    fs.writeFileSync(path.join(featureDir, 'RULES.md'), '# Feature Rules\nLevel 2', 'utf8');

    const loader = new RulesLoader(tmpDir);
    const resolved = loader.loadRules(path.join(featureDir, 'example.ts'));

    expect(resolved.nestedRules).toHaveLength(2);
    expect(resolved.nestedRules[0].content).toContain('Level 1');
    expect(resolved.nestedRules[1].content).toContain('Level 2');
  });

  it('injects full effective rules into PromptComposer without character truncation', () => {
    const longProjectRule = '# Long Rules\n' + 'Rule directive sentence. '.repeat(100);
    fs.writeFileSync(path.join(tmpDir, 'RULES.md'), longProjectRule, 'utf8');

    const loader = new RulesLoader(tmpDir);
    const rules = loader.loadRules();

    const prompt = PromptComposer.compose(
      {
        name: 'Coder',
        system_prompt: 'Lead implementation agent',
        allowed_tools: ['fs_write'],
        preferred_model_ref: 'flappyauto',
        fallback_policy: 'ask_user',
      },
      rules,
      { goal: 'Test prompt rules', projectPath: tmpDir }
    );

    // Verify long rules are NOT truncated with "slice(0, 1200)"
    expect(prompt).toContain(longProjectRule.trim());
    expect(prompt.length).toBeGreaterThan(1500);
  });
});
