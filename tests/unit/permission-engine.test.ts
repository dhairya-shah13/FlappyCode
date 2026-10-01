import { describe, expect, it } from 'vitest';
import { PermissionEngine } from '@flappycode/core';

describe('PermissionEngine Shell Command Security Tests (FR-TOO-005, FR-TOO-006)', () => {
  const engine = new PermissionEngine({
    shell_allow: ['git status', 'git diff', 'npm test*'],
    shell_deny: ['rm -rf /', 'rmdir /s /q c:\\', 'git push --force*'],
    shell_ask: ['*'],
  });

  it('Allows commands matching shell_allow list', () => {
    expect(engine.checkCommand('git status').decision).toBe('allow');
    expect(engine.checkCommand('git diff').decision).toBe('allow');
    expect(engine.checkCommand('npm test -- --coverage').decision).toBe('allow');
  });

  it('Denies commands matching shell_deny list', () => {
    const denyRoot = engine.checkCommand('rm -rf /');
    expect(denyRoot.decision).toBe('deny');
    expect(denyRoot.reason).toContain('deny-list');

    const denyForcePush = engine.checkCommand('git push --force origin main');
    expect(denyForcePush.decision).toBe('deny');
  });

  it('Flags destructive commands for mandatory user confirmation', () => {
    const dropDb = engine.checkCommand('psql -c "DROP DATABASE production;"');
    expect(dropDb.decision).toBe('ask');
    expect(dropDb.isDestructive).toBe(true);
  });

  it('Defaults unlisted commands to ask', () => {
    const unlisted = engine.checkCommand('cat package.json');
    expect(unlisted.decision).toBe('ask');
  });

  it('Prevents allow-listing destructive commands', () => {
    const allowed = engine.allowCommandPattern('DROP TABLE users');
    expect(allowed).toBe(false);
  });
});
