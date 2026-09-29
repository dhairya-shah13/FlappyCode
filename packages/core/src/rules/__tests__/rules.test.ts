import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CORE_RULE_PREFIXES,
  detectCategoriesSync,
  isCoreRule,
  loadRules,
  parseRuleContent,
} from '../index.js';

describe('Rules Parser & Utilities', () => {
  it('correctly identifies core rule prefixes', () => {
    expect(CORE_RULE_PREFIXES).toContain('SEC-');
    expect(CORE_RULE_PREFIXES).toContain('PLAN-');
    expect(CORE_RULE_PREFIXES).toContain('STOP-');
    expect(CORE_RULE_PREFIXES).toContain('NEVER-');
    expect(isCoreRule('SEC-001')).toBe(true);
    expect(isCoreRule('PLAN-002')).toBe(true);
    expect(isCoreRule('STOP-001')).toBe(true);
    expect(isCoreRule('NEVER-004')).toBe(true);
    expect(isCoreRule('COMM-001')).toBe(false);
    expect(isCoreRule('FE-001')).toBe(false);
  });

  it('parses frontmatter and rule list items', () => {
    const raw = `---
scope: "packages/api"
overrides:
  - "COMM-001"
---

# Title
- [COMM-001] In the API package, log structured JSON payloads.
  Continuation line with extra details.
- [API-001] Validate all requests.
`;

    const parsed = parseRuleContent(raw, 'test.md', 1);
    expect(parsed.metadata.scope).toBe('packages/api');
    expect(parsed.metadata.overrides).toEqual(['COMM-001']);
    expect(parsed.rules).toHaveLength(2);

    expect(parsed.rules[0].id).toBe('COMM-001');
    expect(parsed.rules[0].text).toContain('In the API package, log structured JSON payloads.');
    expect(parsed.rules[0].text).toContain('Continuation line with extra details.');
    expect(parsed.rules[0].isCore).toBe(false);

    expect(parsed.rules[1].id).toBe('API-001');
    expect(parsed.rules[1].text).toBe('Validate all requests.');
  });
});

describe('Category Detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-cat-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('detects monorepo and cli from workspace layout and package.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"');
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'my-cli',
        bin: { 'my-cli': './dist/bin.js' },
        dependencies: {
          commander: '^11.0.0',
        },
      })
    );

    const categories = detectCategoriesSync(tmpDir);
    expect(categories).toContain('monorepo');
    expect(categories).toContain('cli');
    expect(categories).toContain('documentation');
  });

  it('detects frontend and backend from dependencies', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          react: '^18.0.0',
          express: '^4.18.0',
        },
      })
    );

    const categories = detectCategoriesSync(tmpDir);
    expect(categories).toContain('frontend');
    expect(categories).toContain('backend');
  });
});

describe('RulesLoader', () => {
  let tmpProjectDir: string;
  let tmpShippedDir: string;

  beforeEach(() => {
    tmpProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-proj-'));
    tmpShippedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-shipped-'));

    // Create shipped universal RULES.md
    fs.writeFileSync(
      path.join(tmpShippedDir, 'RULES.md'),
      `# Universal Rules
- [SEC-001] Never leak credentials or API keys.
- [PLAN-001] Formulate a plan before editing code.
- [COMM-001] Ask for clarification when ambiguous.
`
    );

    // Create categories directory
    fs.mkdirSync(path.join(tmpShippedDir, 'categories'));
    fs.writeFileSync(
      path.join(tmpShippedDir, 'categories', 'frontend.md'),
      `# Frontend Rules
- [FE-001] Ensure WCAG accessibility.
`
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpProjectDir, { recursive: true, force: true });
      fs.rmSync(tmpShippedDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('loads shipped universal rules and category rules cleanly', () => {
    const loaded = loadRules({
      projectRoot: tmpProjectDir,
      shippedRulesDir: tmpShippedDir,
      categories: ['frontend'],
      userRulesDir: path.join(tmpProjectDir, 'nonexistent-user-dir'),
    });

    expect(loaded.hasErrors()).toBe(false);
    expect(loaded.conflicts).toHaveLength(0);
    expect(loaded.rules).toHaveLength(4);

    const prompt = loaded.renderPromptBlock();
    expect(prompt).toContain('SEC-001');
    expect(prompt).toContain('PLAN-001');
    expect(prompt).toContain('COMM-001');
    expect(prompt).toContain('FE-001');
    expect(prompt).toContain('Untrusted Content Boundary');
  });

  it('rejects overrides of protected core rules (SEC-, PLAN-, NEVER-, STOP-)', () => {
    // Project root tries to override SEC-001
    fs.writeFileSync(
      path.join(tmpProjectDir, 'RULES.md'),
      `---
overrides:
  - "SEC-001"
---
- [SEC-001] Permissive security allowed in dev.
`
    );

    const loaded = loadRules({
      projectRoot: tmpProjectDir,
      shippedRulesDir: tmpShippedDir,
      categories: [],
      userRulesDir: path.join(tmpProjectDir, 'nonexistent-user-dir'),
    });

    expect(loaded.hasErrors()).toBe(true);
    expect(loaded.conflicts).toHaveLength(1);
    expect(loaded.conflicts[0].reason).toBe('weakens_core_rule');
    expect(loaded.conflicts[0].ruleId).toBe('SEC-001');
  });

  it('allows explicit override of non-core rules with frontmatter declaration', () => {
    fs.writeFileSync(
      path.join(tmpProjectDir, 'RULES.md'),
      `---
overrides:
  - "COMM-001"
---
- [COMM-001] Never ask interactive questions; always log JSON errors.
`
    );

    const loaded = loadRules({
      projectRoot: tmpProjectDir,
      shippedRulesDir: tmpShippedDir,
      categories: [],
      userRulesDir: path.join(tmpProjectDir, 'nonexistent-user-dir'),
    });

    expect(loaded.hasErrors()).toBe(false);
    expect(loaded.conflicts).toHaveLength(0);

    const commRule = loaded.rules.find((r) => r.id === 'COMM-001');
    expect(commRule).toBeDefined();
    expect(commRule?.text).toBe('Never ask interactive questions; always log JSON errors.');
  });

  it('detects undeclared override conflict when non-core rule is redefined without overrides frontmatter', () => {
    fs.writeFileSync(
      path.join(tmpProjectDir, 'RULES.md'),
      `- [COMM-001] Different text without declaring override.
`
    );

    const loaded = loadRules({
      projectRoot: tmpProjectDir,
      shippedRulesDir: tmpShippedDir,
      categories: [],
      userRulesDir: path.join(tmpProjectDir, 'nonexistent-user-dir'),
    });

    expect(loaded.hasErrors()).toBe(true);
    expect(loaded.conflicts).toHaveLength(1);
    expect(loaded.conflicts[0].reason).toBe('undeclared_override');
    expect(loaded.conflicts[0].ruleId).toBe('COMM-001');
  });

  it('loads real repository shipped rules with all 10 categories', () => {
    // Test against actual repo rules directory
    const repoRulesDir = path.resolve(process.cwd(), 'rules');
    const loaded = loadRules({
      projectRoot: process.cwd(),
      shippedRulesDir: repoRulesDir,
      categories: [
        'frontend',
        'backend',
        'mobile',
        'cli',
        'library-sdk',
        'infrastructure',
        'data-ml',
        'monorepo',
        'documentation',
        'marketing-seo',
      ],
      userRulesDir: path.join(tmpProjectDir, 'nonexistent-user-dir'),
    });

    expect(loaded.hasErrors()).toBe(false);
    // 25+ universal rules + 15 * 10 category rules = ~175+ rules
    expect(loaded.rules.length).toBeGreaterThan(150);
  });
});
