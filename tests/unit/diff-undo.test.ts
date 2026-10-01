import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DiffEngine, FsJail, UndoEngine } from '@flappycode/core';

describe('DiffEngine & UndoEngine Operations (FR-TOO-003, FR-TOO-004)', () => {
  const tmpRoot = path.join(os.tmpdir(), 'flappycode-diff-undo-test-' + Date.now());

  beforeAll(() => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'file.txt'), 'line 1\nline 2\nline 3\n');
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it('DiffEngine produces clean unified diff with hunks', () => {
    const oldContent = 'function hello() {\n  return 1;\n}\n';
    const newContent = 'function hello() {\n  return 2;\n}\n';

    const diff = DiffEngine.createUnifiedDiff('hello.ts', oldContent, newContent);
    expect(diff.path).toBe('hello.ts');
    expect(diff.isNew).toBe(false);
    expect(diff.isDeleted).toBe(false);
    expect(diff.hunks.length).toBeGreaterThan(0);
    expect(diff.unifiedDiff).toContain('-  return 1;');
    expect(diff.unifiedDiff).toContain('+  return 2;');
  });

  it('UndoEngine snapshots state and reverts modified files', () => {
    const jail = new FsJail(tmpRoot);
    const undo = new UndoEngine(jail);

    // Initial content
    expect(jail.readFile('file.txt')).toBe('line 1\nline 2\nline 3\n');

    // 1. Record snapshot before change
    undo.recordBeforeChange('run-1', ['file.txt']);

    // 2. Perform modification
    jail.writeFile('file.txt', 'line 1\nMODIFIED LINE\nline 3\n', undefined, true);
    expect(jail.readFile('file.txt')).toContain('MODIFIED LINE');

    // 3. Perform undo
    const res = undo.undoLatest();
    expect(res.success).toBe(true);
    expect(res.restoredFiles).toContain('file.txt');
    expect(jail.readFile('file.txt')).toBe('line 1\nline 2\nline 3\n');
  });

  it('UndoEngine cleanly deletes files that were newly created in the batch', () => {
    const jail = new FsJail(tmpRoot);
    const undo = new UndoEngine(jail);

    // 1. Record snapshot for a new file that does not exist yet
    undo.recordBeforeChange('run-2', ['brand-new.txt']);

    // 2. Create the file
    jail.writeFile('brand-new.txt', 'brand new content', undefined, true);
    expect(jail.exists('brand-new.txt')).toBe(true);

    // 3. Perform undo
    const res = undo.undoLatest();
    expect(res.success).toBe(true);
    expect(res.restoredFiles).toContain('brand-new.txt');
    expect(jail.exists('brand-new.txt')).toBe(false);
  });
});
