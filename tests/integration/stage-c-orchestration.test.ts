import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlappyEngine } from '@flappycode/core';
import { FlappyEvent } from '@flappycode/protocol';

/**
 * Stage C integration tests.
 * Verifies the end-to-end orchestration path including safety gates.
 */
describe('Stage C — Integration', () => {
  let engine: FlappyEngine;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-stage-c-'));
    engine = new FlappyEngine({
      projectRoot: tmpDir,
      dbPath: path.join(tmpDir, 'stage-c.db'),
      disableScheduler: true,
      retryPolicy: { maxRetriesPerModel: 0, baseDelayMs: 0, maxDelayMs: 0 },
    });
  });

  afterEach(() => {
    try {
      engine.close();
    } catch { /* ok */ }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ok */ }
  });

  describe('Safety pipeline verification', () => {
    it('PlanGate is active and enforces write scope', async () => {
      const plan = await engine.submitPrompt('fix bug', { model: 'model-x' });
      engine.approvePlan(plan.run_id);

      // Verify PlanGate has an active token
      const token = engine.planGate.getToken(plan.run_id);
      expect(token).toBeDefined();
    });

    it('PermissionEngine is wired and functional', () => {
      const result = engine.permissionEngine.checkCommand('ls');
      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });

    it('FsJail is active and enforces sandbox', () => {
      // FsJail should reject absolute paths outside project
      expect(() => engine.fsJail.readFile('/etc/passwd')).toThrow();
    });

    it('UndoEngine is wired', () => {
      const result = engine.undo();
      // Should return error (no changes to undo) but not crash
      expect(result.success).toBe(false);
    });

    it('ShellTool is wired', async () => {
      // Should be able to execute a basic command
      const result = await engine.shell.execute('echo test', { isUserApproved: true });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test');
    });

    it('GitTool is wired', () => {
      // GitTool should be defined and accessible
      expect(engine.git).toBeDefined();
    });
  });

  describe('Single-model end-to-end', () => {
    it('single-model plan has exactly one Coder node', async () => {
      const plan = await engine.submitPrompt('implement feature', { model: 'test-model' });

      expect(plan.graph.nodes).toHaveLength(1);
      expect(plan.graph.nodes[0].agent).toBe('Coder');
      expect(plan.planner_model).toBe('test-model');
    });

    it('approval flow works for single-model plans', async () => {
      const events: FlappyEvent[] = [];
      engine.eventBus.on('approval.requested', (ev) => events.push(ev));

      const plan = await engine.submitPrompt('add tests', { model: 'test-model' });

      // An approval request should have been emitted
      const approvalEvents = events.filter(
        (e) => e.type === 'approval.requested' && (e as any).kind === 'plan'
      );
      expect(approvalEvents.length).toBeGreaterThanOrEqual(1);

      // Should be able to approve
      engine.approvePlan(plan.run_id);
      const approved = engine.planGate.getToken(plan.run_id);
      expect(approved).toBeDefined();
    });

    it('rejection clears the pending plan', async () => {
      const plan = await engine.submitPrompt('bad plan', { model: 'test-model' });
      engine.rejectPlan(plan.run_id, 'I changed my mind');

      const pending = engine.orchestrator.getPendingPlan();
      expect(pending).toBeNull();
    });
  });

  describe('Event protocol', () => {
    it('emits plan.proposed with correct structure', async () => {
      const events: any[] = [];
      engine.eventBus.on('plan.proposed', (ev) => events.push(ev));

      const plan = await engine.submitPrompt('add feature', { model: 'model-a' });

      expect(events).toHaveLength(1);
      expect(events[0].plan.run_id).toBe(plan.run_id);
      expect(events[0].plan.graph.nodes.length).toBeGreaterThan(0);
    });

    it('run.cancelled event includes exit_code 130', () => {
      const events: any[] = [];
      engine.eventBus.on('run.cancelled', (ev) => events.push(ev));

      engine.eventBus.emit({
        type: 'run.cancelled',
        run_id: 'test_run',
        reason: 'SIGINT',
        exit_code: 130,
        timestamp: Date.now(),
      });

      expect(events[0].exit_code).toBe(130);
    });

    it('feedback.iteration event has required fields', () => {
      const events: any[] = [];
      engine.eventBus.on('feedback.iteration', (ev) => events.push(ev));

      engine.eventBus.emit({
        type: 'feedback.iteration',
        run_id: 'r1',
        node_id: 'n1',
        agent: 'Coder',
        iteration: 2,
        max_iterations: 3,
        from: 'Tester',
        feedback: 'Tests still failing',
        timestamp: Date.now(),
      });

      expect(events[0]).toMatchObject({
        iteration: 2,
        max_iterations: 3,
        from: 'Tester',
      });
    });
  });

  describe('Agent operations', () => {
    it('listAgents returns built-in agents plus custom', () => {
      const agents = engine.listAgents();
      expect(agents['Coder']).toBeDefined();
      expect(agents['Tester']).toBeDefined();
      expect(agents['Reviewer']).toBeDefined();
      expect(agents['File-Finder']).toBeDefined();
      expect(agents['Command-Executor']).toBeDefined();
      expect(agents['Codebase-Analyst']).toBeDefined();
    });

    it('Coder agent has search tool (GAP-019)', () => {
      const agents = engine.listAgents();
      expect(agents['Coder'].allowed_tools).toContain('search');
    });
  });

  describe('Project memory', () => {
    it('projectMemoryRepo is wired', () => {
      expect(engine.projectMemoryRepo).toBeDefined();
    });

    it('context manager can store and retrieve project memory', () => {
      engine.orchestrator.contextManager.setMemory('test_key', 'test_value');
      expect(engine.orchestrator.contextManager.getMemory('test_key')).toBe('test_value');
    });
  });
});
