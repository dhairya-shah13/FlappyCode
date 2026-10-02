import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlappyEngine } from '@flappycode/core';

/**
 * GAP-025 / GAP-054: Session persistence, listing, resume, and deletion.
 */
describe('GAP-025/054 — Sessions', () => {
  let engine: FlappyEngine;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-sessions-'));
    engine = new FlappyEngine({
      projectRoot: tmpDir,
      dbPath: path.join(tmpDir, 'sessions.db'),
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

  it('creates a session when a run starts', async () => {
    const plan = await engine.submitPrompt('test task', { model: 'test-model' });

    const sessions = engine.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    // The session should be associated with the current project
    const latest = sessions[0];
    expect(latest.project_path).toBe(engine.projectRoot);
  });

  it('persists messages to the session', async () => {
    await engine.submitPrompt('hello world', { model: 'test-model' });

    const sessions = engine.listSessions();
    const messages = engine.sessionRepo.getMessages(sessions[0].id);
    // At minimum, the user prompt should be stored
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('hello world');
  });

  it('deletes a session and its data', async () => {
    await engine.submitPrompt('task to delete', { model: 'test-model' });
    const sessions = engine.listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    engine.deleteSession(sessions[0].id);

    const afterDelete = engine.listSessions();
    const found = afterDelete.find((s) => s.id === sessions[0].id);
    expect(found).toBeUndefined();
  });

  it('getResumableRun returns null for completed sessions', async () => {
    const plan = await engine.submitPrompt('complete me', { model: 'test-model' });
    const sessions = engine.listSessions();
    const sid = sessions[0].id;

    // Mark the run as completed
    engine.taskRepo.setRunStatus(plan.run_id, 'completed');

    const resumable = engine.getResumableRun(sid);
    expect(resumable).toBeNull();
  });

  it('getLatestResumableSession finds an interrupted run', async () => {
    const plan = await engine.submitPrompt('interrupted', { model: 'test-model' });
    // The run status should be 'created' (not completed), which is resumable
    const resumable = engine.getLatestResumableSession();
    expect(resumable).toBeTruthy();
    expect(resumable!.prompt).toBe('interrupted');
  });

  it('resumeSession returns session details and message history', async () => {
    await engine.submitPrompt('history check', { model: 'test-model' });
    const sessions = engine.listSessions();
    const sid = sessions[0].id;

    const res = engine.resumeSession(sid);
    expect(res).not.toBeNull();
    expect(res!.session.id).toBe(sid);
    expect(res!.messages.length).toBeGreaterThanOrEqual(1);
    expect(res!.messages[0].content).toBe('history check');
  });
});
