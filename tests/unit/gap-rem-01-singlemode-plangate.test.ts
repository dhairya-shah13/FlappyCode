import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PlanGate } from '../../packages/core/src/rules/plan-gate';
import { FlappyEngine } from '../../packages/core/src/engine';

describe('GAP-REM-01: Single-model mode PlanGate & Scoped Write Access', () => {
  let tmpDir: string;
  let planGate: PlanGate;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-gap-rem-01-'));
    planGate = new PlanGate();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('PlanGate Unit Tests: issueToken & validateScope', () => {
    it('enforces explicit scope strictly in explicit mode', () => {
      const token = planGate.issueToken('run-1', ['src/allowed.ts'], 3600000, 'explicit');

      const pass = planGate.validateScope(token, 'src/allowed.ts', { projectRoot: tmpDir });
      expect(pass.allowed).toBe(true);

      const fail = planGate.validateScope(token, 'src/other.ts', { projectRoot: tmpDir });
      expect(fail.allowed).toBe(false);
      expect(fail.category).toBe('not_in_plan');
      expect(fail.reason).toMatch(/outside the approved plan scope/);
    });

    it('allows valid project file writes in single-model scope mode', () => {
      const token = planGate.issueToken('run-2', ['hello.txt'], 3600000, 'single-model', 'Create hello.txt');

      const check = planGate.validateScope(token, 'hello.txt', { projectRoot: tmpDir });
      expect(check.allowed).toBe(true);

      const check2 = planGate.validateScope(token, 'src/utils/calc.ts', { projectRoot: tmpDir });
      expect(check2.allowed).toBe(true);
    });

    it('blocks traversal outside jail boundary with actionable reason', () => {
      const token = planGate.issueToken('run-3', [], 3600000, 'single-model', 'Escape attempt');

      const traversal = planGate.validateScope(token, '../escape.txt', { projectRoot: tmpDir });
      expect(traversal.allowed).toBe(false);
      expect(traversal.category).toBe('outside_jail');
      expect(traversal.reason).toMatch(/resolves outside filesystem jail boundary/);

      const outsideAbs = planGate.validateScope(token, path.resolve(tmpDir, '../../outside.txt'), { projectRoot: tmpDir });
      expect(outsideAbs.allowed).toBe(false);
      expect(outsideAbs.category).toBe('outside_jail');
    });

    it('blocks writes to protected set: .git, .env*, node_modules, RULES.md, .flappycode, and lockfiles', () => {
      const token = planGate.issueToken('run-4', [], 3600000, 'single-model', 'touch files');

      const gitCheck = planGate.validateScope(token, '.git/config', { projectRoot: tmpDir });
      expect(gitCheck.allowed).toBe(false);
      expect(gitCheck.category).toBe('protected_path');
      expect(gitCheck.reason).toMatch(/protected directory '\.git'/);

      const envCheck = planGate.validateScope(token, '.env', { projectRoot: tmpDir });
      expect(envCheck.allowed).toBe(false);
      expect(envCheck.category).toBe('protected_path');
      expect(envCheck.reason).toMatch(/protected environment\/secret file/);

      const nodeModulesCheck = planGate.validateScope(token, 'node_modules/foo/index.js', { projectRoot: tmpDir });
      expect(nodeModulesCheck.allowed).toBe(false);
      expect(nodeModulesCheck.category).toBe('protected_path');
      expect(nodeModulesCheck.reason).toMatch(/protected directory 'node_modules'/);

      const rulesCheck = planGate.validateScope(token, 'RULES.md', { projectRoot: tmpDir });
      expect(rulesCheck.allowed).toBe(false);
      expect(rulesCheck.category).toBe('protected_path');
      expect(rulesCheck.reason).toMatch(/protected rules configuration file/);

      const flappycodeCheck = planGate.validateScope(token, '.flappycode/config.json', { projectRoot: tmpDir });
      expect(flappycodeCheck.allowed).toBe(false);
      expect(flappycodeCheck.category).toBe('protected_path');
      expect(flappycodeCheck.reason).toMatch(/protected directory '\.flappycode'/);

      const lockCheck = planGate.validateScope(token, 'package-lock.json', { projectRoot: tmpDir });
      expect(lockCheck.allowed).toBe(false);
      expect(lockCheck.category).toBe('protected_path');
      expect(lockCheck.reason).toMatch(/protected lockfile and was not explicitly requested in prompt/);
    });

    it('allows lockfile write if lockfile is explicitly named in user prompt', () => {
      const token = planGate.issueToken(
        'run-5',
        ['package-lock.json'],
        3600000,
        'single-model',
        'Update package-lock.json with new dependency'
      );

      const lockCheck = planGate.validateScope(token, 'package-lock.json', {
        projectRoot: tmpDir,
        userPrompt: 'Update package-lock.json with new dependency',
      });
      expect(lockCheck.allowed).toBe(true);
    });
  });

  describe('Real Execution Path Tests: executeToolCall → PlanGate → FsJail → Staging', () => {
    it('executes single-model run, stages hello.txt diff, writes on approval, and updates docs', async () => {
      const engine = new FlappyEngine({
        projectRoot: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
      });
      await engine.addProvider({
        id: 'mock',
        type: 'mock',
        display_name: 'Mock Provider',
        enabled: true,
        data_use_policy: 'unknown',
      });

      // Submit single-model prompt
      const plan = await engine.submitPrompt('Create hello.txt with hello world', {
        model: 'mock/mock-coder-free',
      });

      expect(plan.planner_model).toBe('mock/mock-coder-free');
      expect(plan.files_to_modify).toEqual(['hello.txt']);

      // Approve plan
      engine.approvePlan(plan.run_id);

      // Execute plan with diff approval
      await engine.executePlan(
        plan.run_id,
        async () => true, // approve diff
        async () => 'allow'
      );

      // Verify file exists on disk with expected content
      const filePath = path.join(tmpDir, 'hello.txt');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8').trim()).toBe('hello world');

      // Verify docs keeper updated Context.md and Changelog.md
      expect(fs.existsSync(path.join(tmpDir, 'Context.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'Changelog.md'))).toBe(true);
      const changelog = fs.readFileSync(path.join(tmpDir, 'Changelog.md'), 'utf8');
      expect(changelog).toContain('hello.txt');
    });

    it('discards staged changes and leaves disk untouched when diff is rejected', async () => {
      const engine = new FlappyEngine({
        projectRoot: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
      });
      await engine.addProvider({
        id: 'mock',
        type: 'mock',
        display_name: 'Mock Provider',
        enabled: true,
        data_use_policy: 'unknown',
      });

      const plan = await engine.submitPrompt('Create rejected.txt with secret', {
        model: 'mock/mock-coder-free',
      });

      engine.approvePlan(plan.run_id);

      // Reject diff: executePlan throws diff approval denied error
      await expect(
        engine.executePlan(
          plan.run_id,
          async () => false, // reject diff
          async () => 'allow'
        )
      ).rejects.toThrowError(/Diff approval denied/);

      const filePath = path.join(tmpDir, 'rejected.txt');
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('blocks protected and outside write attempts, records to audit log, and surfaces reasons', async () => {
      const engine = new FlappyEngine({
        projectRoot: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
      });
      await engine.addProvider({
        id: 'mock',
        type: 'mock',
        display_name: 'Mock Provider',
        enabled: true,
        data_use_policy: 'unknown',
      });

      // Attempt write to .env
      const plan = await engine.submitPrompt('Create .env with SECRET=123', {
        model: 'mock/mock-coder-free',
      });

      engine.approvePlan(plan.run_id);

      // Expect execution to fail because Coder writes were blocked by PlanGate
      await expect(
        engine.executePlan(
          plan.run_id,
          async () => true,
          async () => 'allow'
        )
      ).rejects.toThrowError(/Coder agent completed without staging changes due to blocked writes:.*protected environment\/secret file/);

      // Verify .env does not exist on disk
      expect(fs.existsSync(path.join(tmpDir, '.env'))).toBe(false);

      // Verify audit log has the blocked attempt in SQLite
      const logs = engine.auditRepo.listToolCalls(plan.graph.nodes[0].id);
      expect(logs.length).toBeGreaterThan(0);
      const blockedCall = logs.find((l) => l.tool === 'write_file');
      expect(blockedCall).toBeDefined();
      expect(blockedCall?.approved_by_user).toBe(false);
      expect(blockedCall?.result_summary).toMatch(/PlanGate Blocked/);
    });

    it('enforces explicit scope in multi-agent planner flow and blocks writes outside files_to_modify', async () => {
      const engine = new FlappyEngine({
        projectRoot: tmpDir,
        dbPath: path.join(tmpDir, 'test.db'),
      });
      await engine.addProvider({
        id: 'mock',
        type: 'mock',
        display_name: 'Mock Provider',
        enabled: true,
        data_use_policy: 'unknown',
      });

      // Submit multi-agent prompt with planner
      const plan = await engine.submitPrompt('Fix failing test in auth.ts');
      expect(plan.planner_model).not.toBe('mock/mock-coder-free');
      expect(plan.files_to_modify).toContain('src/auth.ts');

      engine.approvePlan(plan.run_id);

      // Verify token has explicit scope mode
      const token = engine.planGate.getToken(plan.run_id);
      expect(token).toBeDefined();
      expect(token?.scope_mode).toBe('explicit');

      // Attempting to write a file not in files_to_modify is blocked
      const check = engine.planGate.validateScope(token!, 'src/unplanned.ts', { projectRoot: tmpDir });
      expect(check.allowed).toBe(false);
      expect(check.category).toBe('not_in_plan');
      expect(check.reason).toMatch(/outside the approved plan scope/);
    });
  });
});
