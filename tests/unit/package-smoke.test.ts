import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

describe('GAP-057: Package Asset Bundling & Install Verification Smoke Test', () => {
  const cliDir = path.resolve(process.cwd(), 'packages/cli');
  const pkgJsonPath = path.join(cliDir, 'package.json');

  it('declares dist and assets in package.json files array', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    expect(pkg.files).toBeDefined();
    expect(pkg.files).toContain('dist');
    expect(pkg.files).toContain('assets');
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin.flappycode).toBe('dist/cli.js');
  });

  it('bundles all critical runtime assets including RULES.md and category rules', () => {
    const assetsDir = path.join(cliDir, 'assets');
    expect(fs.existsSync(assetsDir)).toBe(true);

    const rulesMd = path.join(assetsDir, 'RULES.md');
    expect(fs.existsSync(rulesMd)).toBe(true);
    const rulesContent = fs.readFileSync(rulesMd, 'utf8');
    expect(rulesContent.length).toBeGreaterThan(1000);

    const categoriesDir = path.join(assetsDir, 'rules', 'categories');
    expect(fs.existsSync(categoriesDir)).toBe(true);
    const categoryFiles = fs.readdirSync(categoriesDir);
    expect(categoryFiles.length).toBeGreaterThanOrEqual(10);
    expect(categoryFiles).toContain('backend.md');
    expect(categoryFiles).toContain('frontend.md');
    expect(categoryFiles).toContain('monorepo.md');

    for (const file of categoryFiles) {
      const fullPath = path.join(categoriesDir, file);
      const stat = fs.statSync(fullPath);
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it('runs npm pack --dry-run and verifies package manifest includes assets and dist', () => {
    const raw = execSync('npm pack --dry-run --json', { cwd: cliDir, encoding: 'utf8' });
    const parsed = JSON.parse(raw);
    const tarball = parsed[0];
    expect(tarball).toBeDefined();
    expect(tarball.name).toBe('flappycode');
    const files = tarball.files.map((f: any) => f.path);

    expect(files.some((p: string) => p.startsWith('dist/'))).toBe(true);
    expect(files.some((p: string) => p === 'assets/RULES.md')).toBe(true);
    expect(files.some((p: string) => p.startsWith('assets/rules/categories/'))).toBe(true);
  });

  it('executes flappycode binary --version and --help without errors', () => {
    const cliBin = path.join(cliDir, 'dist', 'cli.js');
    expect(fs.existsSync(cliBin)).toBe(true);

    const versionOut = execSync(`node "${cliBin}" --version`, { encoding: 'utf8' }).trim();
    expect(versionOut).toBe('0.1.0');

    const helpOut = execSync(`node "${cliBin}" --help`, { encoding: 'utf8' });
    expect(helpOut).toContain('flappycode');
    expect(helpOut).toContain('Options:');
    expect(helpOut).toContain('--version');
    expect(helpOut).toContain('--help');
  });
});
