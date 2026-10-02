import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlappyEngine } from '@flappycode/core';

/**
 * GAP-007: Deterministic single-model mode tests.
 * When --model X is specified (X ≠ flappyauto), the planner is bypassed entirely,
 * a single Coder node is constructed directly, and safety gates remain active.
 */
describe('GAP-007 — Single-Model Mode', () => {
  let engine: FlappyEngine;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-single-model-'));
    engine = new FlappyEngine({
      projectRoot: tmpDir,
      dbPath: path.join(tmpDir, 'single-model.db'),
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

  it('constructs a single Coder node directly when --model is specified', async () => {
    // submitPrompt with model option should bypass planner and return a plan
    // with exactly one Coder node.
    const events: any[] = [];
    engine.eventBus.on('plan.proposed', (ev) => events.push(ev));

    // Since no providers are connected, the single-model path will still
    // construct the plan locally (no LLM call needed for single-model mode).
    const plan = await engine.submitPrompt('Fix the bug', { model: 'test-model-id' });

    expect(plan.graph.nodes).toHaveLength(1);
    expect(plan.graph.nodes[0].agent).toBe('Coder');
    expect(plan.graph.nodes[0].description).toBe('Fix the bug');
    expect(plan.planner_model).toBe('test-model-id');
    expect(events.length).toBe(1);
    expect(events[0].plan.graph.nodes[0].agent).toBe('Coder');
  });

  it('does not invoke the multi-agent planner in single-model mode', async () => {
    const events: any[] = [];
    engine.eventBus.on('model.selected', (ev) => events.push(ev));

    // In single-model mode, no model.selected event should fire during planning
    // because the planner is completely bypassed.
    await engine.submitPrompt('Add logging', { model: 'some-model' });

    // No model.selected for 'Planner' agent should be emitted.
    const plannerSelections = events.filter((e) => e.agent === 'Planner');
    expect(plannerSelections).toHaveLength(0);
  });

  it('PlanGate remains enforced after single-model plan approval', async () => {
    const plan = await engine.submitPrompt('Write a test', { model: 'test-model' });
    engine.approvePlan(plan.run_id);

    // PlanGate should have a token scoped to the plan's files_to_modify (empty in this case).
    const token = engine.planGate.getToken(plan.run_id);
    expect(token).toBeDefined();
    // Empty files_to_modify means NO writes are authorized by the plan.
    expect(token!.allowed_files).toEqual([]);
  });

  it('passes through model value "flappyauto" to normal planning path', async () => {
    // model=flappyauto should NOT use single-model bypass
    // Since no providers are connected, this will throw PoolExhausted.
    try {
      await engine.submitPrompt('Fix something', { model: 'flappyauto' });
    } catch {
      // Expected: PoolExhaustedError because no providers connected
    }
    // The key assertion is that it attempted real planning (would have tried LLM).
    // We can verify by checking no plan was proposed (since it fails).
    const pendingPlan = engine.orchestrator.getPendingPlan();
    expect(pendingPlan).toBeNull();
  });
});
