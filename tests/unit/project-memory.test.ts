import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { FlappyDatabase, ProjectMemoryRepository } from '@flappycode/storage';
import { ContextManager } from '../../packages/core/src/orchestration/context-manager.js';

describe('ProjectMemoryRepository & FR-CTX-003', () => {
  let tempDir: string;
  let db: FlappyDatabase;
  let repo: ProjectMemoryRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-mem-'));
    db = new FlappyDatabase({ path: path.join(tempDir, 'mem.db') });
    repo = new ProjectMemoryRepository(db.db);
  });

  afterEach(() => {
    try {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns undefined for non-existent keys', () => {
    expect(repo.get('/projects/flappy', 'nonexistent')).toBeUndefined();
  });

  it('persists and retrieves key-value entries', () => {
    const projectPath = '/projects/flappy';
    repo.set(projectPath, 'build_tool', 'pnpm');
    repo.set(projectPath, 'test_framework', 'vitest');

    expect(repo.get(projectPath, 'build_tool')).toBe('pnpm');
    expect(repo.get(projectPath, 'test_framework')).toBe('vitest');
  });

  it('updates existing key on conflict', () => {
    const projectPath = '/projects/flappy';
    repo.set(projectPath, 'version', '1.0.0');
    expect(repo.get(projectPath, 'version')).toBe('1.0.0');

    repo.set(projectPath, 'version', '1.0.1');
    expect(repo.get(projectPath, 'version')).toBe('1.0.1');
  });

  it('deletes keys correctly', () => {
    const projectPath = '/projects/flappy';
    repo.set(projectPath, 'temp_state', 'active');
    expect(repo.get(projectPath, 'temp_state')).toBe('active');

    repo.delete(projectPath, 'temp_state');
    expect(repo.get(projectPath, 'temp_state')).toBeUndefined();
  });

  it('lists all keys for a project in sorted order', () => {
    const projectPath = '/projects/flappy';
    repo.set(projectPath, 'zeta', 'end');
    repo.set(projectPath, 'alpha', 'start');
    repo.set(projectPath, 'beta', 'middle');

    const keys = repo.listKeys(projectPath);
    expect(keys.length).toBe(3);
    expect(keys[0].key).toBe('alpha');
    expect(keys[1].key).toBe('beta');
    expect(keys[2].key).toBe('zeta');
    expect(keys[0].value).toBe('start');
  });

  it('isolates memories between different projects', () => {
    const projA = '/projects/app-a';
    const projB = '/projects/app-b';

    repo.set(projA, 'port', '3000');
    repo.set(projB, 'port', '8080');

    expect(repo.get(projA, 'port')).toBe('3000');
    expect(repo.get(projB, 'port')).toBe('8080');

    expect(repo.listKeys(projA).length).toBe(1);
    expect(repo.listKeys(projB).length).toBe(1);
  });

  it('integrates seamlessly with ContextManager across sessions', () => {
    const projectPath = '/projects/my-app';
    const cm1 = new ContextManager();
    cm1.initProjectMemory(repo, projectPath);

    cm1.setMemory('architecture_decision', 'monorepo-pnpm');
    expect(cm1.getMemory('architecture_decision')).toBe('monorepo-pnpm');

    // Simulate new session with clean in-memory context manager
    const cm2 = new ContextManager();
    cm2.initProjectMemory(repo, projectPath);

    // Should load from SQLite repository
    expect(cm2.getMemory('architecture_decision')).toBe('monorepo-pnpm');
  });
});
