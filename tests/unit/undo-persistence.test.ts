import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { UndoEngine, FsJail, PlanGate } from '@flappycode/core';
import { FlappyDatabase, UndoRepository } from '@flappycode/storage';

describe('Persisted Undo Engine (GAP-045)', () => {
  let tmpDir: string;
  let dbFile: string;
  let db: FlappyDatabase;
  let undoRepo: UndoRepository;
  let planGate: PlanGate;
  let fsJail: FsJail;
  let undoEngine: UndoEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-undo-test-'));
    dbFile = path.join(tmpDir, 'test.db');
    db = new FlappyDatabase({ path: dbFile });
    undoRepo = new UndoRepository(db.db);
    planGate = new PlanGate();
    fsJail = new FsJail(tmpDir, planGate);
    undoEngine = new UndoEngine(fsJail, undoRepo);
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('restores single and multi-file changes atomically across engine restarts', () => {
    const fileA = path.join(tmpDir, 'a.txt');
    const fileB = path.join(tmpDir, 'b.txt');
    const fileC = path.join(tmpDir, 'new.txt'); // newly created file

    // Initial files
    fs.writeFileSync(fileA, 'initial content of A', 'utf8');
    fs.writeFileSync(fileB, 'initial content of B', 'utf8');

    // Record batch before making changes
    const batch = undoEngine.recordBeforeChange('run_1', ['a.txt', 'b.txt', 'new.txt']);
    expect(batch.files).toHaveLength(3);

    // Apply edits
    fsJail.writeFile('a.txt', 'modified content of A', 'run_1', true);
    fsJail.writeFile('b.txt', 'modified content of B', 'run_1', true);
    fsJail.writeFile('new.txt', 'brand new content', 'run_1', true);

    expect(fsJail.readFile('a.txt')).toBe('modified content of A');
    expect(fsJail.readFile('b.txt')).toBe('modified content of B');
    expect(fsJail.readFile('new.txt')).toBe('brand new content');

    // -------------------------------------------------------------
    // SIMULATE ENGINE / PROCESS RESTART (new instance, same SQLite DB)
    // -------------------------------------------------------------
    db.close();
    const newDb = new FlappyDatabase({ path: dbFile });
    const newUndoRepo = new UndoRepository(newDb.db);
    const newFsJail = new FsJail(tmpDir, new PlanGate());
    const restoredUndoEngine = new UndoEngine(newFsJail, newUndoRepo);

    // Verify history survived restart
    const history = restoredUndoEngine.getHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].id).toBe(batch.id);

    // Invoke undo
    const res = restoredUndoEngine.undoLatest();
    expect(res.success).toBe(true);
    expect(res.restoredFiles.length).toBe(3);

    // Verify original state is restored exactly:
    expect(newFsJail.readFile('a.txt')).toBe('initial content of A');
    expect(newFsJail.readFile('b.txt')).toBe('initial content of B');
    expect(newFsJail.exists('new.txt')).toBe(false); // Deleted because it was newly created

    newDb.close();
    // Reopen for afterEach
    db = new FlappyDatabase({ path: dbFile });
  });

  it('handles multiple sequential undo batches correctly', () => {
    const file = path.join(tmpDir, 'version.txt');
    fs.writeFileSync(file, 'v1', 'utf8');

    // Batch 1: v1 -> v2
    undoEngine.recordBeforeChange('run_step1', ['version.txt']);
    fsJail.writeFile('version.txt', 'v2', 'run_step1', true);

    // Batch 2: v2 -> v3
    undoEngine.recordBeforeChange('run_step2', ['version.txt']);
    fsJail.writeFile('version.txt', 'v3', 'run_step2', true);

    expect(fsJail.readFile('version.txt')).toBe('v3');

    // Undo Batch 2: should restore v2
    const undo1 = undoEngine.undoLatest();
    expect(undo1.success).toBe(true);
    expect(fsJail.readFile('version.txt')).toBe('v2');

    // Undo Batch 1: should restore v1
    const undo2 = undoEngine.undoLatest();
    expect(undo2.success).toBe(true);
    expect(fsJail.readFile('version.txt')).toBe('v1');

    // No more batches
    const undo3 = undoEngine.undoLatest();
    expect(undo3.success).toBe(false);
  });
});
