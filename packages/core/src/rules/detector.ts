import fs from 'node:fs';
import path from 'node:path';

export const ALL_CATEGORIES = [
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
] as const;

export type Category = (typeof ALL_CATEGORIES)[number];

interface PackageJson {
  name?: string;
  private?: boolean;
  workspaces?: unknown;
  bin?: unknown;
  main?: string;
  module?: string;
  types?: string;
  typings?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export function detectCategoriesSync(projectRoot: string): string[] {
  const detected = new Set<string>();

  const exists = (relPath: string) => {
    try {
      return fs.existsSync(path.join(projectRoot, relPath));
    } catch {
      return false;
    }
  };

  // Monorepo checks
  if (
    exists('pnpm-workspace.yaml') ||
    exists('lerna.json') ||
    exists('turbo.json') ||
    exists('nx.json')
  ) {
    detected.add('monorepo');
  }

  // Documentation checks
  if (
    exists('docs') ||
    exists('mkdocs.yml') ||
    exists('docusaurus.config.js') ||
    exists('.vitepress')
  ) {
    detected.add('documentation');
  }

  // Infrastructure checks
  if (
    exists('Dockerfile') ||
    exists('docker-compose.yml') ||
    exists('docker-compose.yaml') ||
    exists('.github/workflows') ||
    exists('terraform') ||
    exists('k8s') ||
    exists('kubernetes')
  ) {
    detected.add('infrastructure');
  }

  // Mobile checks
  if (exists('android') || exists('ios')) {
    detected.add('mobile');
  }

  // Marketing / SEO checks
  if (
    exists('sitemap.xml') ||
    exists('public/sitemap.xml') ||
    exists('robots.txt') ||
    exists('public/robots.txt')
  ) {
    detected.add('marketing-seo');
  }

  // Read package.json if present
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as PackageJson;

      if (pkg.workspaces) {
        detected.add('monorepo');
      }

      if (pkg.bin) {
        detected.add('cli');
      }

      if ((pkg.types || pkg.typings) && (pkg.main || pkg.exports || pkg.module) && pkg.private !== true) {
        detected.add('library-sdk');
      }

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      };

      const hasDep = (...depNames: string[]) => depNames.some((d) => Boolean(allDeps[d]));

      // Frontend deps
      if (hasDep('react', 'react-dom', 'vue', 'svelte', 'next', 'nuxt', 'vite', 'astro', '@angular/core')) {
        detected.add('frontend');
      }

      // Backend deps
      if (hasDep('express', 'fastify', 'koa', '@nestjs/core', 'hono', 'prisma', 'typeorm', 'mongoose', 'pg')) {
        detected.add('backend');
      }

      // CLI deps
      if (hasDep('commander', 'yargs', 'cac', 'meow', 'ink', 'clack', 'prompts')) {
        detected.add('cli');
      }

      // Mobile deps
      if (hasDep('react-native', 'expo')) {
        detected.add('mobile');
      }

      // SEO deps
      if (hasDep('next-seo', 'react-helmet', 'react-helmet-async')) {
        detected.add('marketing-seo');
      }
    } catch {
      // Ignore package.json parsing errors
    }
  }

  // Python Data/ML checks
  if (exists('requirements.txt') || exists('pyproject.toml') || exists('Pipfile')) {
    const checkFile = (f: string) => {
      try {
        const content = fs.readFileSync(path.join(projectRoot, f), 'utf8');
        return /torch|tensorflow|pandas|scikit-learn|numpy|jupyter/i.test(content);
      } catch {
        return false;
      }
    };
    if (
      (exists('requirements.txt') && checkFile('requirements.txt')) ||
      (exists('pyproject.toml') && checkFile('pyproject.toml')) ||
      (exists('Pipfile') && checkFile('Pipfile'))
    ) {
      detected.add('data-ml');
    }
  }

  return Array.from(detected).sort();
}
