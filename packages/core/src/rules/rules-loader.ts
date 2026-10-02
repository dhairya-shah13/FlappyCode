import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RuleConflict {
  ruleA: string;
  ruleB: string;
  description: string;
  scope?: string;
}

export interface LoadedRules {
  rawContent: string;
  universalRules: string;
  projectRules: string;
  nestedRules: Array<{ path: string; content: string }>;
  categoryRules: Array<{ category: string; content: string }>;
  activeCategories: string[];
  effectiveRules: string;
  conflicts: RuleConflict[];
}

export class RulesLoader {
  private bundledRulesCache?: string;

  constructor(
    private projectRoot: string,
    private categoryOverride?: string | string[]
  ) {}

  /**
   * Resolve universal rules bundled with the distribution package.
   * Falls back to dev-mode repository root or embedded baseline.
   */
  public resolveUniversalRules(): string {
    if (this.bundledRulesCache) return this.bundledRulesCache;

    const candidates: string[] = [];

    // 1. Current ESM directory relative assets
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      candidates.push(path.resolve(currentDir, '../../assets/RULES.md'));
      candidates.push(path.resolve(currentDir, '../../../cli/assets/RULES.md'));
      candidates.push(path.resolve(currentDir, '../assets/RULES.md'));
    } catch {
      // Ignore URL resolution errors
    }

    // 2. Package install locations (e.g. node_modules/flappycode/assets/RULES.md)
    candidates.push(path.join(this.projectRoot, 'node_modules', 'flappycode', 'assets', 'RULES.md'));
    candidates.push(path.join(this.projectRoot, 'assets', 'RULES.md'));

    // 3. Dev-mode repository root RULES.md
    candidates.push(path.join(this.projectRoot, 'rules', 'RULES.md'));

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        try {
          const content = fs.readFileSync(cand, 'utf8');
          if (content.trim().length > 0) {
            this.bundledRulesCache = content;
            return content;
          }
        } catch {
          // Continue to next candidate
        }
      }
    }

    // 4. Fallback baseline if asset file is missing
    const fallback = `# Universal Rules (FlappyCode Baseline)
1. Plan-before-execution is mandatory: never write or modify files without explicit plan approval.
2. Root-jail sandbox bounds: never access files outside the project workspace root.
3. Zero secrets leakage: never log, commit, or prompt sensitive credentials or API keys.
4. Mandatory Context.md & Changelog.md upkeep on meaningful project changes.
`;
    this.bundledRulesCache = fallback;
    return fallback;
  }

  /**
   * Load effective rules for the project, optionally scoped to a target file.
   */
  public loadRules(targetFilePath?: string): LoadedRules {
    const universalRules = this.resolveUniversalRules();

    // 1. Project-level RULES.md
    let projectRules = '';
    const rootRulesPath = path.join(this.projectRoot, 'RULES.md');
    if (fs.existsSync(rootRulesPath)) {
      try {
        const rootContent = fs.readFileSync(rootRulesPath, 'utf8');
        // If root content is not identical to universal rules, it's a project extension/override
        if (rootContent.trim() !== universalRules.trim()) {
          projectRules = rootContent;
        }
      } catch {
        // Ignore read errors
      }
    }

    // 2. Nested directory rules (scoped to targetFilePath if provided)
    const nestedRules: Array<{ path: string; content: string }> = [];
    if (targetFilePath) {
      const resolvedTarget = path.isAbsolute(targetFilePath)
        ? path.resolve(targetFilePath)
        : path.resolve(this.projectRoot, targetFilePath);

      // Only search directories within projectRoot
      if (resolvedTarget.startsWith(path.resolve(this.projectRoot))) {
        let dir = path.dirname(resolvedTarget);
        const nestedFiles: string[] = [];

        while (dir.startsWith(path.resolve(this.projectRoot)) && dir !== path.resolve(this.projectRoot)) {
          const nestedRulePath = path.join(dir, 'RULES.md');
          if (fs.existsSync(nestedRulePath)) {
            nestedFiles.unshift(nestedRulePath); // Higher ancestor first
          }
          const parent = path.dirname(dir);
          if (parent === dir) break;
          dir = parent;
        }

        for (const nf of nestedFiles) {
          try {
            const content = fs.readFileSync(nf, 'utf8');
            nestedRules.push({ path: path.relative(this.projectRoot, nf), content });
          } catch {
            // Ignore read errors
          }
        }
      }
    }

    // 3. Category rules
    const activeCategories = this.detectCategories();
    const categoryRules: Array<{ category: string; content: string }> = [];
    for (const cat of activeCategories) {
      const catContent = this.loadCategoryRule(cat);
      if (catContent) {
        categoryRules.push({ category: cat, content: catContent });
      }
    }

    // 4. Conflict detection
    const allContents = [
      { name: 'Universal Rules', content: universalRules },
      ...(projectRules ? [{ name: 'Project Rules', content: projectRules }] : []),
      ...categoryRules.map((c) => ({ name: `Category (${c.category})`, content: c.content })),
      ...nestedRules.map((n) => ({ name: `Nested (${n.path})`, content: n.content })),
    ];
    const conflicts = this.detectConflicts(allContents);

    // 5. Compose effective rules
    const sections: string[] = [];
    sections.push(`## 1. UNIVERSAL OPERATING RULES\n${universalRules.trim()}`);

    if (categoryRules.length > 0) {
      sections.push(
        `## 2. CATEGORY-SPECIFIC RULES (${activeCategories.join(', ')})\n` +
          categoryRules.map((c) => `### ${c.category}\n${c.content.trim()}`).join('\n\n')
      );
    }

    if (projectRules) {
      sections.push(`## 3. PROJECT-LEVEL RULES\n${projectRules.trim()}`);
    }

    if (nestedRules.length > 0) {
      sections.push(
        `## 4. SCOPED DIRECTORY RULES\n` +
          nestedRules.map((n) => `### Scope: ${n.path}\n${n.content.trim()}`).join('\n\n')
      );
    }

    const effectiveRules = sections.join('\n\n');

    return {
      rawContent: projectRules || universalRules,
      universalRules,
      projectRules,
      nestedRules,
      categoryRules,
      activeCategories,
      effectiveRules,
      conflicts,
    };
  }

  /**
   * Multi-signal repository detection covering 10 categories with manual override support.
   */
  public detectCategories(): string[] {
    let override = this.categoryOverride;
    if (!override) {
      const configPath = path.join(this.projectRoot, 'flappy.config.json');
      if (fs.existsSync(configPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (cfg?.category) {
            override = cfg.category;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    if (override) {
      const overrides = Array.isArray(override)
        ? override
        : [override];
      return overrides.filter(Boolean);
    }

    const categories = new Set<string>();

    // 1. Inspect package.json
    const pkgJsonPath = path.join(this.projectRoot, 'package.json');
    let pkg: any = null;
    if (fs.existsSync(pkgJsonPath)) {
      try {
        pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      } catch {
        // Ignore parse error
      }
    }

    const allDeps = {
      ...(pkg?.dependencies || {}),
      ...(pkg?.devDependencies || {}),
    };

    // Category: CLI
    if (
      pkg?.bin ||
      allDeps.commander ||
      allDeps.yargs ||
      allDeps.meow ||
      allDeps.cac ||
      allDeps.clipanion
    ) {
      categories.add('CLI');
    }

    // Category: Frontend
    if (
      allDeps.react ||
      allDeps.vue ||
      allDeps.svelte ||
      allDeps.next ||
      allDeps.nuxt ||
      allDeps.vite ||
      allDeps['@angular/core'] ||
      allDeps.astro ||
      allDeps.remix ||
      fs.existsSync(path.join(this.projectRoot, 'public', 'index.html'))
    ) {
      categories.add('Frontend');
    }

    // Category: Backend
    if (
      allDeps.express ||
      allDeps.fastify ||
      allDeps.koa ||
      allDeps.nest ||
      allDeps['@nestjs/core'] ||
      allDeps.koa ||
      allDeps.hapi ||
      fs.existsSync(path.join(this.projectRoot, 'src', 'controllers')) ||
      fs.existsSync(path.join(this.projectRoot, 'src', 'routes'))
    ) {
      categories.add('Backend');
    }

    // Category: Mobile
    if (
      allDeps['react-native'] ||
      allDeps.expo ||
      fs.existsSync(path.join(this.projectRoot, 'android')) ||
      fs.existsSync(path.join(this.projectRoot, 'ios')) ||
      fs.existsSync(path.join(this.projectRoot, 'Podfile'))
    ) {
      categories.add('Mobile');
    }

    // Category: Monorepo
    if (
      fs.existsSync(path.join(this.projectRoot, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(this.projectRoot, 'lerna.json')) ||
      fs.existsSync(path.join(this.projectRoot, 'turbo.json')) ||
      fs.existsSync(path.join(this.projectRoot, 'nx.json')) ||
      (Array.isArray(pkg?.workspaces) && pkg.workspaces.length > 0)
    ) {
      categories.add('Monorepo');
    }

    // Category: Infra
    if (
      fs.existsSync(path.join(this.projectRoot, 'Dockerfile')) ||
      fs.existsSync(path.join(this.projectRoot, 'docker-compose.yml')) ||
      fs.existsSync(path.join(this.projectRoot, 'docker-compose.yaml')) ||
      fs.existsSync(path.join(this.projectRoot, 'terraform')) ||
      fs.existsSync(path.join(this.projectRoot, 'k8s'))
    ) {
      categories.add('Infra');
    }

    // Category: Data/ML
    if (
      fs.existsSync(path.join(this.projectRoot, 'requirements.txt')) ||
      fs.existsSync(path.join(this.projectRoot, 'pyproject.toml')) ||
      allDeps.torch ||
      allDeps.tensorflow ||
      allDeps.pandas ||
      allDeps.numpy
    ) {
      categories.add('Data/ML');
    }

    // Category: Docs
    if (
      fs.existsSync(path.join(this.projectRoot, 'mkdocs.yml')) ||
      fs.existsSync(path.join(this.projectRoot, 'docusaurus.config.js')) ||
      fs.existsSync(path.join(this.projectRoot, '.vuepress'))
    ) {
      categories.add('Docs');
    }

    // Category: Marketing/SEO
    if (
      fs.existsSync(path.join(this.projectRoot, 'robots.txt')) ||
      fs.existsSync(path.join(this.projectRoot, 'public', 'robots.txt')) ||
      fs.existsSync(path.join(this.projectRoot, 'sitemap.xml')) ||
      allDeps.gatsby
    ) {
      categories.add('Marketing/SEO');
    }

    // Category: Library (if types/main exist and it's not primarily a monorepo or CLI)
    if (
      (pkg?.types || pkg?.typings || pkg?.exports) &&
      !categories.has('CLI') &&
      !categories.has('Frontend') &&
      !categories.has('Backend')
    ) {
      categories.add('Library');
    }

    return Array.from(categories);
  }

  /**
   * Load category rules content from package assets.
   */
  private loadCategoryRule(category: string): string | null {
    const slug = category.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const candidates = [
      path.join(this.projectRoot, 'assets', 'rules', 'categories', `${slug}.md`),
      path.join(this.projectRoot, 'rules', 'categories', `${slug}.md`),
    ];

    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      candidates.push(path.resolve(currentDir, `../../assets/rules/categories/${slug}.md`));
      candidates.push(path.resolve(currentDir, `../assets/rules/categories/${slug}.md`));
    } catch {
      // Ignore URL resolution
    }

    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        try {
          return fs.readFileSync(cand, 'utf8');
        } catch {
          // Continue
        }
      }
    }
    return null;
  }

  /**
   * Structural conflict detection (GAP-018):
   * Identifies contradictory explicit requirements or safety violations.
   * Ordinary documented precedence overrides are preserved and not flagged.
   */
  public detectConflicts(sources: Array<{ name: string; content: string }>): RuleConflict[] {
    const conflicts: RuleConflict[] = [];

    // Safety conflict signatures: rules attempting to disable core safety laws
    const safetyViolations = [
      {
        pattern: /(?:skip|bypass|disable|never require)\s+(?:plan\s+approval|plan-before-execution)/i,
        desc: 'Violates core law: Plan approval cannot be bypassed by child rules.',
      },
      {
        pattern: /(?:allow|permit)\s+(?:unrestricted\s+filesystem|escape\s+sandbox|access\s+outside\s+project)/i,
        desc: 'Violates core law: Root-jail filesystem bounds cannot be disabled.',
      },
      {
        pattern: /(?:commit|print|log)\s+(?:raw\s+secrets|api\s+keys|credentials)/i,
        desc: 'Violates core law: Secret leakage protections cannot be disabled.',
      },
    ];

    for (const src of sources) {
      if (src.name === 'Universal Rules') continue;
      for (const sv of safetyViolations) {
        if (sv.pattern.test(src.content)) {
          conflicts.push({
            ruleA: 'Universal Rules: Mandatory Safety Invariant',
            ruleB: `${src.name}: ${sv.pattern.exec(src.content)?.[0] || 'Unsafe directive'}`,
            description: sv.desc,
            scope: src.name,
          });
        }
      }
    }

    // Direct contradictory directive checks across rules
    const contradictions = [
      {
        pos: /always\s+use\s+tabs/i,
        neg: /always\s+use\s+spaces|never\s+use\s+tabs/i,
        desc: 'Contradictory indentation requirements (tabs vs spaces)',
      },
      {
        pos: /strictly\s+forbid\s+external\s+dependencies/i,
        neg: /allow\s+any\s+external\s+dependencies/i,
        desc: 'Contradictory dependency management policies',
      },
      {
        pos: /never\s+run\s+tests/i,
        neg: /mandatory\s+test\s+execution\s+before\s+commit/i,
        desc: 'Contradictory testing requirements',
      },
    ];

    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        for (const c of contradictions) {
          const aHasPos = c.pos.test(sources[i].content);
          const aHasNeg = c.neg.test(sources[i].content);
          const bHasPos = c.pos.test(sources[j].content);
          const bHasNeg = c.neg.test(sources[j].content);

          if ((aHasPos && bHasNeg) || (aHasNeg && bHasPos)) {
            conflicts.push({
              ruleA: sources[i].name,
              ruleB: sources[j].name,
              description: c.desc,
              scope: `${sources[i].name} <-> ${sources[j].name}`,
            });
          }
        }
      }
    }

    return conflicts;
  }
}
