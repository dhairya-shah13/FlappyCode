import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { GitTool, ShellTool, SecretGuard, PermissionEngine } from '@flappycode/core';

describe('Git Tool Safety & Integration (GAP-020)', () => {
  let tmpDir: string;
  let shell: ShellTool;
  let git: GitTool;
  let secretGuard: SecretGuard;
  let permEngine: PermissionEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-git-test-'));
    // Initialize temporary Git repository
    execSync('git init -b main', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test User"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });

    secretGuard = new SecretGuard();
    permEngine = new PermissionEngine({
      shell_allow: ['git status*', 'git diff*', 'git branch*', 'git rev-parse*'],
      shell_deny: ['git push --force*'],
      shell_ask: ['*'],
    });
    shell = new ShellTool(tmpDir, permEngine, secretGuard);
    git = new GitTool(shell, secretGuard, ['main', 'master']);
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('statusStructured returns accurate branch, staged, unstaged, and untracked files', async () => {
    // Initial commit
    fs.writeFileSync(path.join(tmpDir, 'initial.txt'), 'hello', 'utf8');
    execSync('git add initial.txt', { cwd: tmpDir });
    execSync('git commit -m "initial commit"', { cwd: tmpDir });

    // Stage a new file
    fs.writeFileSync(path.join(tmpDir, 'staged.txt'), 'staged content', 'utf8');
    execSync('git add staged.txt', { cwd: tmpDir });

    // Modify a tracked file without staging
    fs.writeFileSync(path.join(tmpDir, 'initial.txt'), 'hello modified', 'utf8');

    // Create untracked file
    fs.writeFileSync(path.join(tmpDir, 'untracked.txt'), 'untracked', 'utf8');

    const status = await git.statusStructured();
    expect(status.branch).toBe('main');
    expect(status.staged).toContain('staged.txt');
    expect(status.unstaged).toContain('initial.txt');
    expect(status.untracked).toContain('untracked.txt');
    expect(status.clean).toBe(false);
  });

  it('diffStructured parses insertions, deletions, and patches per file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'app.ts'), 'line1\nline2\n', 'utf8');
    execSync('git add app.ts', { cwd: tmpDir });
    execSync('git commit -m "add app.ts"', { cwd: tmpDir });

    fs.writeFileSync(path.join(tmpDir, 'app.ts'), 'line1\nline2 edited\nline3 added\n', 'utf8');

    const diff = await git.diffStructured(false);
    expect(diff.files.length).toBeGreaterThan(0);
    const appDiff = diff.files.find((f) => f.path.includes('app.ts'));
    expect(appDiff).toBeDefined();
    expect(appDiff?.insertions).toBeGreaterThanOrEqual(1);
    expect(appDiff?.deletions).toBeGreaterThanOrEqual(1);
    expect(appDiff?.patch).toContain('line2 edited');
  });

  it('branchCreate validates against command injection and invalid names', async () => {
    // Safe branch
    const res = await git.branchCreate('feature/auth-provider', { isUserApproved: true });
    expect(res).toContain("Switched to a new branch 'feature/auth-provider'");

    // Invalid branches
    await expect(git.branchCreate('; rm -rf /', { isUserApproved: true })).rejects.toThrow();
    await expect(git.branchCreate('-leading-dash', { isUserApproved: true })).rejects.toThrow();
    await expect(git.branchCreate('foo/../bar', { isUserApproved: true })).rejects.toThrow();
  });

  it('commit scans for secrets and blocks commit if sensitive keys are staged', async () => {
    // Initial commit
    fs.writeFileSync(path.join(tmpDir, 'app.ts'), '// app\n', 'utf8');
    execSync('git add app.ts', { cwd: tmpDir });
    await git.commit('initial', { isUserApproved: true });

    // Stage a file containing a leaked Anthropic API key
    fs.writeFileSync(
      path.join(tmpDir, 'keys.ts'),
      'export const KEY = "sk-ant-api03-abcdef1234567890abcdef1234567890abcdef";',
      'utf8'
    );
    execSync('git add keys.ts', { cwd: tmpDir });

    await expect(git.commit('add keys', { isUserApproved: true })).rejects.toThrow(
      /Security Violation: Staged changes contain sensitive keys/
    );
  });

  it('push enforces confirmation, force-push blocking, and protected branch rules', async () => {
    // 1. Force push is permanently blocked
    await expect(git.push('origin', 'feature', true, { confirmed: true, isUserApproved: true })).rejects.toThrow(
      /Force-push is blocked by safety policy/
    );

    // 2. Protected branch ('main') push requires explicit confirmation
    await expect(git.push('origin', 'main', false, { confirmed: false, isUserApproved: true })).rejects.toThrow(
      /Direct push to protected branch 'main' requires explicit confirmation/
    );

    // 3. Unconfirmed push to regular branch is blocked
    await expect(git.push('origin', 'feature-branch', false, { confirmed: false, isUserApproved: false })).rejects.toThrow(
      /Push confirmation required/
    );
  });

  it('generatePrDraft produces structured, non-destructive markdown summaries', async () => {
    fs.writeFileSync(path.join(tmpDir, 'calc.ts'), 'export const add = (a: number, b: number) => a + b;\n', 'utf8');
    execSync('git add calc.ts', { cwd: tmpDir });
    execSync('git commit -m "feat: add calculator"', { cwd: tmpDir });

    const draft = await git.generatePrDraft({
      goal: 'Add calculator module',
      taskSummary: 'Implemented add function in calc.ts',
      testsPassed: true,
    });

    expect(draft).toContain('## Pull Request: Add calculator module');
    expect(draft).toContain('Implemented add function in calc.ts');
    expect(draft).toContain('- [x] Automated tests and linting passed');
    expect(draft).toContain('calc.ts');
  });
});
