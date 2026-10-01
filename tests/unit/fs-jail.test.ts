import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FsJail, PlanGate } from '@flappycode/core';
import { PlanProposal } from '@flappycode/protocol';

describe('FsJail Path Traversal Protection & PlanGate Enforcement (FR-TOO-001, FR-TOO-002)', () => {
  const tmpRoot = path.join(os.tmpdir(), 'flappycode-fs-jail-test-' + Date.now());

  beforeAll(() => {
    fs.mkdirSync(tmpRoot, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'authorized.txt'), 'hello');
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it('Resolves safe paths within the project root', () => {
    const jail = new FsJail(tmpRoot);
    const safePath = jail.resolveSafePath('authorized.txt');
    expect(safePath).toContain('authorized.txt');
  });

  it('Strictly rejects path traversal escaping project root (../)', () => {
    const jail = new FsJail(tmpRoot);
    expect(() => jail.resolveSafePath('../../../etc/passwd')).toThrow(/escapes project root/);
    expect(() => jail.resolveSafePath('..\\..\\windows\\system32')).toThrow(/escapes project root/);
  });

  it('Blocks writing to files when PlanGate is active without an authorized PlanToken', () => {
    const gate = new PlanGate();
    const jail = new FsJail(tmpRoot, gate);

    // Unapproved write attempt without token
    expect(() => jail.writeFile('unapproved.txt', 'secret data')).toThrow(/PlanGate Blocked Write/);
  });

  it('Allows writing to files authorized in approved PlanProposal', () => {
    const gate = new PlanGate();
    const jail = new FsJail(tmpRoot, gate);

    const plan: PlanProposal = {
      run_id: 'run-xyz',
      goal: 'Write authorized output',
      planner_model: 'mock-planner',
      assumptions: [],
      risks: [],
      files_to_modify: ['authorized.txt', 'created.txt'],
      graph: {
        id: 'graph-1',
        goal: 'Write authorized output',
        created_at: Date.now(),
        nodes: [],
      },
      timestamp: Date.now(),
    };

    gate.createToken('run-xyz', plan);

    jail.writeFile('created.txt', 'new file content', 'run-xyz');
    expect(jail.readFile('created.txt')).toBe('new file content');
  });

  it('Blocks write to files NOT present in the approved plan proposal even with valid runId', () => {
    const gate = new PlanGate();
    const jail = new FsJail(tmpRoot, gate);

    const plan: PlanProposal = {
      run_id: 'run-xyz',
      goal: 'Task',
      planner_model: 'mock-planner',
      assumptions: [],
      risks: [],
      files_to_modify: ['authorized.txt'],
      graph: {
        id: 'graph-1',
        goal: 'Task',
        created_at: Date.now(),
        nodes: [],
      },
      timestamp: Date.now(),
    };

    gate.createToken('run-xyz', plan);

    expect(() => jail.writeFile('rogue-file.ts', 'malicious code', 'run-xyz')).toThrow(
      /PlanGate Blocked Write/
    );
  });
});
