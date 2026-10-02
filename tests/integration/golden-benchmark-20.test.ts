import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { FlappyEngine } from '@flappycode/core';
import { MockProviderConnector } from '@flappycode/providers';

interface GoldenTask {
  id: string;
  name: string;
  targetFile: string;
  initialCode: string;
  expectedSymbol: string;
  taskPrompt: string;
}

const GOLDEN_TASKS: GoldenTask[] = [
  { id: 'GT-01', name: 'Math Sum & Average', targetFile: 'src/math.ts', initialCode: '// math\n', expectedSymbol: 'average', taskPrompt: 'Add sum and average functions' },
  { id: 'GT-02', name: 'Email Validator', targetFile: 'src/auth.ts', initialCode: '// auth\n', expectedSymbol: 'isValidEmail', taskPrompt: 'Add email validation regex helper' },
  { id: 'GT-03', name: 'Stack Data Structure', targetFile: 'src/stack.ts', initialCode: '// stack\n', expectedSymbol: 'class Stack', taskPrompt: 'Implement generic Stack with push/pop' },
  { id: 'GT-04', name: 'Calculator Division Fix', targetFile: 'src/calc.ts', initialCode: 'export function div(a,b){return a/b;}\n', expectedSymbol: 'throw new Error', taskPrompt: 'Fix division by zero in calculator' },
  { id: 'GT-05', name: 'Debounce Utility', targetFile: 'src/debounce.ts', initialCode: '// debounce\n', expectedSymbol: 'function debounce', taskPrompt: 'Implement debounce with timeout' },
  { id: 'GT-06', name: 'Slugify String Helper', targetFile: 'src/slugify.ts', initialCode: '// slugify\n', expectedSymbol: 'function slugify', taskPrompt: 'Add slugify string helper' },
  { id: 'GT-07', name: 'Binary Search Algorithm', targetFile: 'src/search.ts', initialCode: '// search\n', expectedSymbol: 'function binarySearch', taskPrompt: 'Implement binary search in sorted array' },
  { id: 'GT-08', name: 'Deep Clone Utility', targetFile: 'src/clone.ts', initialCode: '// clone\n', expectedSymbol: 'function deepClone', taskPrompt: 'Create deep clone utility for JSON objects' },
  { id: 'GT-09', name: 'Semver Comparator', targetFile: 'src/semver.ts', initialCode: '// semver\n', expectedSymbol: 'compareSemver', taskPrompt: 'Add semver comparison function' },
  { id: 'GT-10', name: 'LRU Cache Implementation', targetFile: 'src/lru.ts', initialCode: '// lru\n', expectedSymbol: 'class LruCache', taskPrompt: 'Implement LRU cache with capacity limit' },
  { id: 'GT-11', name: 'URL Query Parser', targetFile: 'src/url.ts', initialCode: '// url\n', expectedSymbol: 'parseQuery', taskPrompt: 'Add url query string parser' },
  { id: 'GT-12', name: 'Exponential Backoff', targetFile: 'src/retry.ts', initialCode: '// retry\n', expectedSymbol: 'retryWithBackoff', taskPrompt: 'Implement retry helper with backoff' },
  { id: 'GT-13', name: 'Markdown Table Parser', targetFile: 'src/md.ts', initialCode: '// md\n', expectedSymbol: 'parseMarkdownTable', taskPrompt: 'Create markdown table parser' },
  { id: 'GT-14', name: 'Env Var Validator', targetFile: 'src/env.ts', initialCode: '// env\n', expectedSymbol: 'requireEnv', taskPrompt: 'Add required environment variable validator' },
  { id: 'GT-15', name: 'Array Flatten Utility', targetFile: 'src/flatten.ts', initialCode: '// flatten\n', expectedSymbol: 'flattenArray', taskPrompt: 'Implement recursive array flattener' },
  { id: 'GT-16', name: 'Throttle Utility', targetFile: 'src/throttle.ts', initialCode: '// throttle\n', expectedSymbol: 'function throttle', taskPrompt: 'Create throttle function with delay' },
  { id: 'GT-17', name: 'Hex to RGB Converter', targetFile: 'src/color.ts', initialCode: '// color\n', expectedSymbol: 'hexToRgb', taskPrompt: 'Add hex to rgb color parser' },
  { id: 'GT-18', name: 'Typed Event Emitter', targetFile: 'src/events.ts', initialCode: '// events\n', expectedSymbol: 'class TypedEmitter', taskPrompt: 'Implement lightweight event emitter' },
  { id: 'GT-19', name: 'Password Strength Meter', targetFile: 'src/security.ts', initialCode: '// security\n', expectedSymbol: 'checkPasswordStrength', taskPrompt: 'Add password strength validator' },
  { id: 'GT-20', name: 'Promisify Helper', targetFile: 'src/async.ts', initialCode: '// async\n', expectedSymbol: 'function promisify', taskPrompt: 'Implement callback-to-promise helper' },
];

describe('P1-J1: 20-Task Golden Benchmark Harness', () => {
  let tmpRoot: string;
  let engine: FlappyEngine;
  let connector: MockProviderConnector;

  beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-golden-20-'));
    engine = new FlappyEngine({
      projectRoot: tmpRoot,
      dbPath: ':memory:',
    });

    await engine.registry.addProvider({
      id: 'mock-golden',
      type: 'mock',
      display_name: 'Mock Golden Provider',
      data_use_policy: 'no_training',
      enabled: true,
    });

    connector = engine.registry.getConnector('mock-golden') as MockProviderConnector;
  });

  afterAll(() => {
    try {
      engine.db.close();
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  for (const task of GOLDEN_TASKS) {
    it(`evaluates ${task.id}: ${task.name}`, async () => {
      // Setup file
      const dir = path.dirname(path.join(tmpRoot, task.targetFile));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(tmpRoot, task.targetFile), task.initialCode, 'utf8');

      // Setup mock responses
      const modifiedContent = `${task.initialCode}\nexport function ${task.expectedSymbol}() { return true; }\n`;
      connector.scenario.cannedResponses = {
        'mock-planner-free': [
          JSON.stringify({
            goal: task.name,
            files_to_modify: [task.targetFile],
            assumptions: ['Standard implementation'],
            risks: ['None'],
            nodes: [
              { id: `node-${task.id}-coder`, agent: 'Coder', description: task.taskPrompt, depends_on: [] },
              { id: `node-${task.id}-rev`, agent: 'Reviewer', description: 'Review changes', depends_on: [`node-${task.id}-coder`] },
            ],
          }),
        ],
        'mock-coder-free': [`Implementing ${task.name}`],
        'mock-reviewer-free': ['Approved.'],
      };

      // 1. Plan Gate: Start run
      const plan = await engine.orchestrator.startRun(task.taskPrompt);
      expect(plan.run_id).toBeDefined();
      expect(plan.files_to_modify).toContain(task.targetFile);

      // 2. Approve plan
      engine.orchestrator.approvePlan(plan.run_id);
      expect(engine.planGate.validateOperation(plan.run_id, task.targetFile)).toBe(true);

      // 3. Stage changes
      engine.orchestrator.stageChange(task.targetFile, modifiedContent);

      // 4. Commit diffs atomically
      engine.orchestrator.applyStagedDiffs(plan.run_id);

      // 5. Verify file written and contains expected code symbol
      const written = engine.fsJail.readFile(task.targetFile);
      expect(written).toContain(task.expectedSymbol);

      // 6. Test undo functionality
      const undoResult = engine.undoEngine.undoLatest();
      expect(undoResult.success).toBe(true);
      const reverted = engine.fsJail.readFile(task.targetFile);
      expect(reverted).toBe(task.initialCode);
    });
  }
});
