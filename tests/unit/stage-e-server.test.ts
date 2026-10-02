import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FlappyEngine } from '@flappycode/core';
import { FlappyServer } from '@flappycode/server';

describe('Stage E: Server Command Dispatch & Error Correctness (GAP-052, GAP-058)', () => {
  let engine: FlappyEngine;
  let server: FlappyServer;
  const testPort = 15477;

  beforeAll(async () => {
    engine = new FlappyEngine({ dbPath: ':memory:' });
    // Add mock provider
    await engine.registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      data_use_policy: 'no_training',
      display_name: 'Mock Provider',
      enabled: true,
    });
    server = new FlappyServer(engine, { port: testPort, host: '127.0.0.1' });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    engine.close();
  });

  const postCommand = async (cmd: Record<string, any>) => {
    const res = await fetch(`http://127.0.0.1:${testPort}/v1/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.bearerToken}`,
      },
      body: JSON.stringify(cmd),
    });
    const body = (await res.json()) as any;
    return { status: res.status, body };
  };

  it('rejects malformed JSON payload with 400 and structured error', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/v1/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.bearerToken}`,
      },
      body: 'this is not valid json',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error).toContain('Invalid JSON');
    expect(body.error_details).toBeDefined();
    expect(body.error_details.code).toBe('COMMAND_INVALID');
  });

  it('rejects schema-invalid command with 400 and structured error', async () => {
    const { status, body } = await postCommand({ type: 'unknown_command_type_xyz' });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Invalid command payload');
    expect(body.error_details).toBeDefined();
    expect(body.error_details.code).toBe('COMMAND_INVALID');
  });

  it('handles submitPrompt, approvePlan, and rejectPlan honestly', async () => {
    // 1. submitPrompt
    const resPrompt = await postCommand({
      type: 'submitPrompt',
      prompt: 'Refactor math module',
    });
    expect(resPrompt.status).toBe(200);
    expect(resPrompt.body.success).toBe(true);
    expect(resPrompt.body.plan).toBeDefined();
    const runId = resPrompt.body.plan.run_id;

    // 2. approvePlan
    const resApprove = await postCommand({
      type: 'approvePlan',
      run_id: runId,
    });
    expect(resApprove.status).toBe(200);
    expect(resApprove.body.success).toBe(true);

    // 3. submitPrompt again to test rejectPlan
    const resPrompt2 = await postCommand({
      type: 'submitPrompt',
      prompt: 'Another task to reject',
    });
    const runId2 = resPrompt2.body.plan.run_id;

    const resReject = await postCommand({
      type: 'rejectPlan',
      run_id: runId2,
      reason: 'Not required anymore',
    });
    expect(resReject.status).toBe(200);
    expect(resReject.body.success).toBe(true);
  });

  it('handles executePlan honestly', async () => {
    // Attempt execute on nonexistent run -> 400
    const resNonExistent = await postCommand({
      type: 'executePlan',
      run_id: 'nonexistent-run-99',
    });
    expect(resNonExistent.status).toBe(400);
    expect(resNonExistent.body.success).toBe(false);
    expect(resNonExistent.body.error_details?.code).toBe('RUN_NOT_FOUND');

    // Submit prompt and execute valid run
    const resPrompt = await postCommand({
      type: 'submitPrompt',
      prompt: 'Execute plan test',
    });
    const runId = resPrompt.body.plan.run_id;
    await postCommand({ type: 'approvePlan', run_id: runId });

    const resExec = await postCommand({
      type: 'executePlan',
      run_id: runId,
    });
    expect(resExec.status).toBe(200);
    expect(resExec.body.success).toBe(true);
    expect(resExec.body.run_id).toBe(runId);
  });

  it('handles cancelRun honestly', async () => {
    const res = await postCommand({
      type: 'cancelRun',
      run_id: 'any-run-id',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('handles answerQuestion, approveDiff, rejectDiff, grantPermission honestly', async () => {
    // 1. answerQuestion for unknown question -> 400 with INVALID_STATE
    const resQ = await postCommand({
      type: 'answerQuestion',
      question_id: 'question-unknown',
      answer: 'Yes',
    });
    expect(resQ.status).toBe(400);
    expect(resQ.body.success).toBe(false);
    expect(resQ.body.error_details?.code).toBe('INVALID_STATE');

    // 2. approveDiff for non-pending diff -> 400 with INVALID_STATE
    const resDiff = await postCommand({
      type: 'approveDiff',
      run_id: 'run-unknown',
    });
    expect(resDiff.status).toBe(400);
    expect(resDiff.body.success).toBe(false);
    expect(resDiff.body.error_details?.code).toBe('INVALID_STATE');

    // 3. rejectDiff for non-pending diff -> 400 with INVALID_STATE
    const resDiffReject = await postCommand({
      type: 'rejectDiff',
      run_id: 'run-unknown',
    });
    expect(resDiffReject.status).toBe(400);
    expect(resDiffReject.body.success).toBe(false);
    expect(resDiffReject.body.error_details?.code).toBe('INVALID_STATE');

    // 4. grantPermission for non-pending permission -> 400 with INVALID_STATE
    const resPerm = await postCommand({
      type: 'grantPermission',
      permission_id: 'perm-unknown',
      approved: true,
      always_allow: false,
    });
    expect(resPerm.status).toBe(400);
    expect(resPerm.body.success).toBe(false);
    expect(resPerm.body.error_details?.code).toBe('INVALID_STATE');
  });

  it('handles refreshProviders and pinModel commands', async () => {
    const resRefresh = await postCommand({ type: 'refreshProviders' });
    expect(resRefresh.status).toBe(200);
    expect(resRefresh.body.success).toBe(true);

    const resPin = await postCommand({
      type: 'pinModel',
      agent_name: 'Coder',
      model_id: 'mock-coder-free',
    });
    expect(resPin.status).toBe(200);
    expect(resPin.body.success).toBe(true);
  });
});
