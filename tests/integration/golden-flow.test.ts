import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlappyEngine } from '@flappycode/core';
import { MockProviderConnector } from '@flappycode/providers';

describe('Golden Flow End-to-End Integration Test (Prompt Section 4 & 45)', () => {
  const tmpRoot = path.join(os.tmpdir(), 'flappycode-golden-flow-' + Date.now());
  let engine: FlappyEngine;

  beforeAll(async () => {
    fs.mkdirSync(path.join(tmpRoot, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, 'src', 'math.ts'),
      'export function add(a: number, b: number) {\n  return a + b;\n}\n',
      'utf8'
    );
    fs.writeFileSync(path.join(tmpRoot, 'Context.md'), '# Context\n', 'utf8');
    fs.writeFileSync(path.join(tmpRoot, 'Changelog.md'), '# Changelog\n', 'utf8');

    engine = new FlappyEngine({
      projectRoot: tmpRoot,
      dbPath: ':memory:',
    });

    // Add mock provider
    await engine.registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      display_name: 'Mock Test Provider',
      base_url: 'http://localhost/mock',
      data_use_policy: 'no_training',
      enabled: true,
    });
  });

  afterAll(() => {
    try {
      engine.db.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
  });

  it('Executes complete golden workflow: prompt -> plan proposal -> approval -> diff review -> atomic write -> docs upkeep -> /undo', async () => {
    const initialContent = engine.fsJail.readFile('src/math.ts');
    expect(initialContent).toContain('export function add');
    expect(initialContent).not.toContain('export function multiply');

    // 1. Configure Mock Planner canned response
    const connector = engine.registry.getConnector('mock-p1') as MockProviderConnector;
    connector.scenario.cannedResponses = {
      'mock-planner-free': [
        JSON.stringify({
          goal: 'Add multiply function to math.ts',
          files_to_modify: ['src/math.ts'],
          assumptions: ['Pure function'],
          risks: ['None'],
          nodes: [
            {
              id: 'node-coder',
              agent: 'Coder',
              description: 'Implement multiply function in src/math.ts',
              depends_on: [],
            },
            {
              id: 'node-reviewer',
              agent: 'Reviewer',
              description: 'Review modified code in src/math.ts',
              depends_on: ['node-coder'],
            },
          ],
        }),
      ],
      'mock-coder-free': ['I will add the multiply function to math.ts'],
      'mock-reviewer-free': ['Code changes in src/math.ts are clean and approved.'],
    };

    // 2. Start run -> produces PlanProposal
    const plan = await engine.orchestrator.startRun('Add multiply to math.ts');
    const runId = plan.run_id;
    expect(plan.goal).toBe('Add multiply function to math.ts');
    expect(plan.files_to_modify).toContain('src/math.ts');

    // Invariant: Unapproved write is blocked before plan approval
    expect(() =>
      engine.fsJail.writeFile('src/math.ts', 'hacked content', runId)
    ).toThrow(/PlanGate Blocked Write/);

    // 3. User approves plan -> PlanGate issues PlanToken
    engine.orchestrator.approvePlan(runId);
    expect(engine.planGate.validateOperation(runId, 'src/math.ts')).toBe(true);

    // 4. Staged diff proposal
    const modifiedCode =
      'export function add(a: number, b: number) {\n  return a + b;\n}\n\n' +
      'export function multiply(a: number, b: number) {\n  return a * b;\n}\n';

    engine.orchestrator.stageChange('src/math.ts', modifiedCode);

    // 5. Diff approval and atomic apply
    engine.orchestrator.applyStagedDiffs(runId);

    // Verify file content was atomically written inside jail
    const updatedContent = engine.fsJail.readFile('src/math.ts');
    expect(updatedContent).toContain('export function multiply');

    // 6. Docs upkeep per RULES.md Section 8.1
    engine.docsKeeper.recordChange({
      title: 'Add multiply function',
      category: 'Dev',
      whatChanged: 'Added multiply function to src/math.ts',
      why: 'Golden test verification of agent changes',
    });

    const changelog = fs.readFileSync(path.join(tmpRoot, 'Changelog.md'), 'utf8');
    expect(changelog).toContain('Add multiply function');

    // 7. Verify /undo restores original state
    const undoRes = engine.undoEngine.undoLatest();
    expect(undoRes.success).toBe(true);
    expect(undoRes.restoredFiles).toContain('src/math.ts');

    const revertedContent = engine.fsJail.readFile('src/math.ts');
    expect(revertedContent).toBe(initialContent);
    expect(revertedContent).not.toContain('export function multiply');
  });
});
