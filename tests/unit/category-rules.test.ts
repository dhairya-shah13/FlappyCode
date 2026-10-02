import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RulesLoader, PromptComposer } from '@flappycode/core';

describe('Category Rules & Detection (GAP-049)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-category-rules-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('detects CLI category from package.json bin and commander dependency', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-cli',
        bin: { 'test-cli': 'dist/bin.js' },
        dependencies: { commander: '^11.0.0' },
      }),
      'utf8'
    );

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toContain('CLI');
    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('CATEGORY-SPECIFIC RULES');
    expect(rules.effectiveRules).toContain('CLI');
    expect(rules.effectiveRules).toContain('Deterministic Exit Codes');
  });

  it('detects Frontend category from react or vite', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-frontend',
        dependencies: { react: '^18.0.0', vite: '^5.0.0' },
      }),
      'utf8'
    );

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toContain('Frontend');
    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('Frontend');
    expect(rules.effectiveRules).toContain('Accessibility');
  });

  it('detects Backend category from express and routes folder', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-backend',
        dependencies: { express: '^4.18.0' },
      }),
      'utf8'
    );
    fs.mkdirSync(path.join(tmpDir, 'src', 'routes'), { recursive: true });

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toContain('Backend');
    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('Backend');
    expect(rules.effectiveRules).toContain('Structured logging');
  });

  it('detects Mobile category from react-native or android folder', () => {
    fs.mkdirSync(path.join(tmpDir, 'android'), { recursive: true });

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toContain('Mobile');
    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('Mobile');
  });

  it('detects Monorepo category from pnpm-workspace.yaml', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"', 'utf8');

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toContain('Monorepo');
    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('Monorepo');
  });

  it('detects Infra category from Dockerfile', () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20-alpine', 'utf8');

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toContain('Infra');
    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('Infra');
  });

  it('detects Data/ML category from requirements.txt or pyproject.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'torch>=2.0.0\npandas>=2.0.0', 'utf8');

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toContain('Data/ML');
    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('Data/ML');
  });

  it('detects Docs category from mkdocs.yml', () => {
    fs.writeFileSync(path.join(tmpDir, 'mkdocs.yml'), 'site_name: Test Docs', 'utf8');

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toContain('Docs');
    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('Docs');
  });

  it('detects Marketing/SEO category from robots.txt', () => {
    fs.writeFileSync(path.join(tmpDir, 'robots.txt'), 'User-agent: *\nDisallow:', 'utf8');

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toContain('Marketing/SEO');
    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('Marketing/SEO');
  });

  it('detects Library category when types are defined and not CLI/Frontend/Backend', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-lib',
        main: 'dist/index.js',
        types: 'dist/index.d.ts',
      }),
      'utf8'
    );

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toContain('Library');
    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('Library');
  });

  it('honors manual override in flappy.config.json category field', () => {
    // Project has Dockerfile (Infra) and package.json with express (Backend)
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20', 'utf8');
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { express: '^4.18.0' } }),
      'utf8'
    );

    // But user overrides to CLI only
    fs.writeFileSync(
      path.join(tmpDir, 'flappy.config.json'),
      JSON.stringify({ category: 'CLI' }),
      'utf8'
    );

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toEqual(['CLI']);
    expect(categories).not.toContain('Infra');
    expect(categories).not.toContain('Backend');

    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('Category Rules: CLI');
    expect(rules.effectiveRules).not.toContain('Category Rules: Backend');
    expect(rules.effectiveRules).not.toContain('Category Rules: Infra');
  });

  it('honors array override in flappy.config.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'flappy.config.json'),
      JSON.stringify({ category: ['Frontend', 'Docs'] }),
      'utf8'
    );

    const loader = new RulesLoader(tmpDir);
    const categories = loader.detectCategories();

    expect(categories).toEqual(['Frontend', 'Docs']);
    const rules = loader.loadRules();
    expect(rules.effectiveRules).toContain('Frontend');
    expect(rules.effectiveRules).toContain('Docs');
  });

  it('includes active category rules in PromptComposer output', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'flappy.config.json'),
      JSON.stringify({ category: ['Backend'] }),
      'utf8'
    );

    const loader = new RulesLoader(tmpDir);
    const rules = loader.loadRules();

    const prompt = PromptComposer.compose(
      {
        name: 'BackendCoder',
        system_prompt: 'Backend specialist',
        allowed_tools: ['fs_write'],
        preferred_model_ref: 'flappyauto',
        fallback_policy: 'ask_user',
      },
      rules,
      { goal: 'Build REST API', projectPath: tmpDir }
    );

    expect(prompt).toContain('## 2. CATEGORY-SPECIFIC RULES (Backend)');
    expect(prompt).toContain('Structured logging');
    expect(prompt).toContain('Idempotency');
  });
});
