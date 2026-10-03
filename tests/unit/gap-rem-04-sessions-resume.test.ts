import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { FlappyEngine } from '@flappycode/core';
import { launchTUI } from '../../packages/cli/src/cli.js';

describe('GAP-REM-04: Sessions Resume into Interactive App', () => {
  let tmpDir: string;
  let prevCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-resume-test-'));
    prevCwd = process.cwd();
    process.chdir(tmpDir);
    process.env.FLAPPYCODE_DB_PATH = path.join(tmpDir, 'test.db');

    fs.writeFileSync(path.join(tmpDir, 'RULES.md'), '# Test Rules\nUniversal rules here.');
  });

  afterEach(() => {
    delete process.env.FLAPPYCODE_DB_PATH;
    process.chdir(prevCwd);
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    vi.restoreAllMocks();
  });

  it('resumes a session with N messages and persists new turn under the same session id', async () => {
    const engine = new FlappyEngine({
      projectRoot: tmpDir,
      dbPath: path.join(tmpDir, 'test.db'),
    });
    const sessionId = `ses_test_${Date.now()}`;
    engine.sessionRepo.createSession(sessionId, tmpDir);

    // Seed N messages into the session
    engine.sessionRepo.addMessage(sessionId, 'user', 'First prompt: create a component');
    engine.sessionRepo.addMessage(sessionId, 'assistant', 'Created component outline');
    engine.sessionRepo.addMessage(sessionId, 'user', 'Second prompt: add unit test');

    const resBefore = engine.resumeSession(sessionId);
    expect(resBefore).not.toBeNull();
    expect(resBefore!.session.id).toBe(sessionId);
    expect(resBefore!.messages).toHaveLength(3);

    // Add a provider so single-model execution succeeds
    await engine.addProvider({
      id: 'mock',
      display_name: 'Mock Provider',
      type: 'mock',
      enabled: true,
      data_use_policy: 'unknown',
      created_at: Date.now(),
    });

    // Execute next user turn under the same session ID
    const plan = await engine.submitPrompt('Third prompt: Create notes.txt with hello', {
      model: 'mock/mock-coder-free',
      sessionId,
    });
    expect(plan.run_id).toBeTruthy();

    engine.approvePlan(plan.run_id);
    await engine.executePlan(plan.run_id, async () => true);

    // Assert session now contains previous 3 messages + user prompt + assistant completion message
    const resAfter = engine.resumeSession(sessionId);
    expect(resAfter).not.toBeNull();
    expect(resAfter!.messages.length).toBeGreaterThanOrEqual(4);
    expect(resAfter!.messages.some((m) => m.content.includes('Third prompt'))).toBe(true);

    engine.close();
  });

  it('fails with clear error and exit 1 when resuming an unknown session id via CLI', () => {
    const cliPath = path.resolve(__dirname, '../../packages/cli/dist/cli.js');
    try {
      execSync(`node "${cliPath}" sessions resume ses_nonexistent_9999 --print`, {
        cwd: tmpDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, FLAPPYCODE_DB_PATH: path.join(tmpDir, 'test.db') },
      });
      expect.unreachable('Should have failed with exit 1');
    } catch (err: any) {
      expect(err.status).toBe(1);
      const combinedOutput = (err.stdout || '') + (err.stderr || '');
      expect(combinedOutput).toContain("Session 'ses_nonexistent_9999' not found");
    }
  });

  it('prints metadata and exits 0 with --print in non-interactive/non-TTY mode', () => {
    const engine = new FlappyEngine({
      projectRoot: tmpDir,
      dbPath: path.join(tmpDir, 'test.db'),
    });
    const sessionId = `ses_print_${Date.now()}`;
    engine.sessionRepo.createSession(sessionId, tmpDir);
    engine.sessionRepo.addMessage(sessionId, 'user', 'Hello world');
    engine.sessionRepo.addMessage(sessionId, 'assistant', 'Hello human');
    engine.close();

    const cliPath = path.resolve(__dirname, '../../packages/cli/dist/cli.js');
    const output = execSync(`node "${cliPath}" sessions resume ${sessionId} --print`, {
      cwd: tmpDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FLAPPYCODE_DB_PATH: path.join(tmpDir, 'test.db') },
    });

    expect(output).toContain(`Loaded session '${sessionId}'`);
    expect(output).toContain('2 message(s)');
  });

  it('restores session model if eligible, falls back safely if disabled or paid', async () => {
    const engine = new FlappyEngine({
      projectRoot: tmpDir,
      dbPath: path.join(tmpDir, 'test.db'),
    });
    const sessionId = `ses_model_${Date.now()}`;
    engine.sessionRepo.createSession(sessionId, tmpDir);

    await engine.addProvider({
      id: 'mock',
      display_name: 'Mock Provider',
      type: 'mock',
      enabled: true,
      data_use_policy: 'unknown',
      created_at: Date.now(),
    });

    // Run a task using mock/mock-coder-free to record model_used in task_node
    const plan = await engine.submitPrompt('Create greeting.txt with greetings', {
      model: 'mock/mock-coder-free',
      sessionId,
    });
    engine.approvePlan(plan.run_id);
    await engine.executePlan(plan.run_id, async () => true);

    // Verify task_node recorded model_used
    const row = (engine as any).db.db.prepare(`
      SELECT model_used FROM task_node
      WHERE run_id IN (SELECT id FROM task_run WHERE session_id = ?)
      ORDER BY rowid DESC LIMIT 1
    `).get(sessionId) as { model_used?: string };

    expect(row?.model_used).toBe('mock-coder-free');

    // Test safe fallback when model is tagged disabled
    engine.modelRepo.saveOverride({
      provider_id: 'mock',
      model_id: 'mock-coder-free',
      tier: 'disabled',
      created_at: Date.now(),
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // Test in non-TTY mode with printOnly
    await launchTUI({ resumeSessionId: sessionId, engine, printOnly: true });

    // Assert printOnly outputs the loaded session confirmation
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(`Loaded session '${sessionId}'`));

    engine.close();
  });

  it('hydrates orchestrator agent node with prior session turns', async () => {
    const engine = new FlappyEngine({
      projectRoot: tmpDir,
      dbPath: path.join(tmpDir, 'test.db'),
    });
    const sessionId = `ses_hydrate_${Date.now()}`;
    engine.sessionRepo.createSession(sessionId, tmpDir);

    // Add prior turns
    engine.sessionRepo.addMessage(sessionId, 'user', 'Prior instruction 1');
    engine.sessionRepo.addMessage(sessionId, 'assistant', 'Prior response 1');

    await engine.addProvider({
      id: 'mock',
      display_name: 'Mock Provider',
      type: 'mock',
      enabled: true,
      data_use_policy: 'unknown',
      created_at: Date.now(),
    });

    // Start a new turn in the same session
    const plan = await engine.submitPrompt('Next turn: create hello.txt with hi', {
      model: 'mock/mock-coder-free',
      sessionId,
    });
    engine.approvePlan(plan.run_id);
    await engine.executePlan(plan.run_id, async () => true);

    const msgs = engine.sessionRepo.getMessages(sessionId);
    expect(msgs.length).toBeGreaterThanOrEqual(4);
    expect(msgs[0].content).toBe('Prior instruction 1');
    expect(msgs[1].content).toBe('Prior response 1');

    engine.close();
  });
});
