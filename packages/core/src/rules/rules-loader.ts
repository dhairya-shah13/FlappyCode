import fs from 'node:fs';
import path from 'node:path';

export interface LoadedRules {
  rawContent: string;
  universalRules: string;
  activeCategories: string[];
  conflicts: string[];
}

export class RulesLoader {
  constructor(private projectRoot: string) {}

  public loadRules(): LoadedRules {
    // 1. Authoritative repository-root RULES.md
    const rootRulesPath = path.join(this.projectRoot, 'RULES.md');
    let rawContent = '';
    if (fs.existsSync(rootRulesPath)) {
      rawContent = fs.readFileSync(rootRulesPath, 'utf8');
    } else {
      // Fallback: check nested rules/RULES.md
      const bundledRulesPath = path.join(this.projectRoot, 'rules', 'RULES.md');
      if (fs.existsSync(bundledRulesPath)) {
        rawContent = fs.readFileSync(bundledRulesPath, 'utf8');
      } else {
        rawContent = '# Universal Rules\nPlan-before-execution is mandatory. Do not commit secrets.';
      }
    }

    const activeCategories = this.detectCategories();

    return {
      rawContent,
      universalRules: rawContent,
      activeCategories,
      conflicts: [],
    };
  }

  private detectCategories(): string[] {
    const categories: string[] = [];
    const pkgJsonPath = path.join(this.projectRoot, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const allDeps = {
          ...pkg.dependencies,
          ...pkg.devDependencies,
        };

        if (pkg.bin) categories.push('CLI');
        if (allDeps.react || allDeps.vue || allDeps.svelte || allDeps.next) categories.push('Frontend');
        if (allDeps.express || allDeps.fastify || allDeps.koa || allDeps.nest) categories.push('Backend');
      } catch {
        // Ignore parse error
      }
    }
    return categories;
  }
}
