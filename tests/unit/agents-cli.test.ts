import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { FlappyEngine } from '@flappycode/core';

describe('NEW-002: agents show and agents bind CLI subcommands', () => {
  let tempDir: string;
  const cliBin = path.resolve(process.cwd(), 'packages/cli/dist/cli.js');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-agents-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('flappycode agents list lists all built-in agents', () => {
    const out = execSync(`node "${cliBin}" agents list`, {
      cwd: tempDir,
      env: { ...process.env, HOME: tempDir, APPDATA: tempDir, LOCALAPPDATA: tempDir, FLAPPYCODE_DB_PATH: path.join(tempDir, 'test.db') },
      encoding: 'utf8',
    });

    expect(out).toContain('Available Agents');
    expect(out).toContain('Coder');
    expect(out).toContain('Reviewer');
    expect(out).toContain('Tester');
    expect(out).toContain('File-Finder');
  });

  it('flappycode agents list --json returns valid JSON object of agents', () => {
    const out = execSync(`node "${cliBin}" agents list --json`, {
      cwd: tempDir,
      env: { ...process.env, HOME: tempDir, APPDATA: tempDir, LOCALAPPDATA: tempDir, FLAPPYCODE_DB_PATH: path.join(tempDir, 'test.db') },
      encoding: 'utf8',
    });

    const parsed = JSON.parse(out);
    expect(parsed).toBeTypeOf('object');
    expect(parsed.Coder).toBeDefined();
    expect(parsed.Coder.system_prompt).toBeDefined();
    expect(Array.isArray(parsed.Coder.allowed_tools)).toBe(true);
  });

  it('flappycode agents show <name> displays full system prompt and properties', () => {
    const out = execSync(`node "${cliBin}" agents show Coder`, {
      cwd: tempDir,
      env: { ...process.env, HOME: tempDir, APPDATA: tempDir, LOCALAPPDATA: tempDir, FLAPPYCODE_DB_PATH: path.join(tempDir, 'test.db') },
      encoding: 'utf8',
    });

    expect(out).toContain('Agent:');
    expect(out).toContain('Coder');
    expect(out).toContain('Model Binding:');
    expect(out).toContain('Fallback Policy:');
    expect(out).toContain('Allowed Tools:');
    expect(out).toContain('System Prompt:');
    expect(out).toContain('lead implementation and editing agent');
  });

  it('flappycode agents show <name> --json returns full agent definition', () => {
    const out = execSync(`node "${cliBin}" agents show Coder --json`, {
      cwd: tempDir,
      env: { ...process.env, HOME: tempDir, APPDATA: tempDir, LOCALAPPDATA: tempDir, FLAPPYCODE_DB_PATH: path.join(tempDir, 'test.db') },
      encoding: 'utf8',
    });

    const parsed = JSON.parse(out);
    expect(parsed.name).toBe('Coder');
    expect(parsed.allowed_tools).toContain('fs_write');
    expect(parsed.preferred_model_ref).toBe('flappyauto');
  });

  it('flappycode agents show <unknown> prints error with what/why/next and exits with code 1', () => {
    let failed = false;
    try {
      execSync(`node "${cliBin}" agents show NonExistentAgent`, {
        cwd: tempDir,
        env: { ...process.env, HOME: tempDir, APPDATA: tempDir, LOCALAPPDATA: tempDir, FLAPPYCODE_DB_PATH: path.join(tempDir, 'test.db') },
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err: any) {
      failed = true;
      expect(err.status).toBe(1);
      const stderr = err.stderr ? err.stderr.toString() : err.stdout.toString();
      expect(stderr).toContain("Agent 'NonExistentAgent' does not exist");
      expect(stderr).toContain('Why:');
      expect(stderr).toContain('Next:');
    }
    expect(failed).toBe(true);
  });

  it('engine.bindAgent persists binding and unbind restores flappyauto', async () => {
    const engine = new FlappyEngine({ projectRoot: tempDir });

    // Register a mock provider directly via registry
    await engine.registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      display_name: 'Mock Provider',
      enabled: true,
      data_use_policy: 'no_training',
    });

    const models = engine.getModels();
    expect(models.length).toBeGreaterThan(0);
    const targetModel = models[0].model_id;

    // Bind agent
    engine.bindAgent('Coder', targetModel);

    // Verify in engine
    const coderDef = engine.getAgent('Coder');
    expect(coderDef?.preferred_model_ref).toBe(targetModel);

    // Verify in another engine instance (persistence across processes)
    const engine2 = new FlappyEngine({ projectRoot: tempDir });
    const coderDef2 = engine2.getAgent('Coder');
    expect(coderDef2?.preferred_model_ref).toBe(targetModel);

    // Unbind
    engine2.unbindAgent('Coder');
    const coderDef3 = engine2.getAgent('Coder');
    expect(coderDef3?.preferred_model_ref).toBe('flappyauto');
  });
});
