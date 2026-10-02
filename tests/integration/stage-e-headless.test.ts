import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { spawnSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { StructuredErrorSchema } from '@flappycode/protocol';
import { FlappyEngine } from '@flappycode/core';

const CLI_PATH = path.resolve(__dirname, '../../packages/cli/dist/cli.js');

describe('Stage E: Headless CLI Correctness (GAP-024, GAP-051, GAP-056)', () => {
  let tempDir: string;
  let tempLogDir: string;
  let testDbPath: string;
  let testEnv: Record<string, string>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappycode-headless-test-'));
    tempLogDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappycode-headless-log-'));
    testDbPath = path.join(tempDir, 'flappycode.db');
    testEnv = {
      ...(process.env as Record<string, string>),
      FLAPPYCODE_DB_PATH: testDbPath,
      FLAPPYCODE_LOG_DIR: tempLogDir,
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch { /* ignore */ }
    try {
      fs.rmSync(tempLogDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  // ---------------------------------------------------------------------------
  // GAP-024: Exit Code 2 (Usage Errors)
  // ---------------------------------------------------------------------------

  it('exits with code 2 on missing prompt argument', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, 'run'], {
      cwd: tempDir,
      env: testEnv,
      encoding: 'utf8',
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('USAGE_MISSING_PROMPT');
    expect(res.stderr).toContain('Missing required argument');
  });

  it('exits with code 2 on invalid CLI option', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, 'run', 'test task', '--invalid-option-xyz'], {
      cwd: tempDir,
      env: testEnv,
      encoding: 'utf8',
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("unknown option '--invalid-option-xyz'");
  });

  it('exits with code 2 on unknown subcommand', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, 'nonexistent-command'], {
      cwd: tempDir,
      env: testEnv,
      encoding: 'utf8',
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("Unknown command: 'nonexistent-command'");
  });

  // ---------------------------------------------------------------------------
  // GAP-024: Exit Code 5 (No Providers Available)
  // ---------------------------------------------------------------------------

  it('exits with code 5 when no providers are configured', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, 'run', 'create a function', '--cwd', tempDir], {
      cwd: tempDir,
      env: testEnv,
      encoding: 'utf8',
    });
    expect(res.status).toBe(5);
    expect(res.stderr).toContain('NO_PROVIDERS');
  });

  // ---------------------------------------------------------------------------
  // GAP-024: Exit Code 3 (Approval Required)
  // ---------------------------------------------------------------------------

  it('exits with code 3 when --approve-plan is missing (headless mode requires explicit approval)', async () => {
    // Seed database with mock provider
    const engine = new FlappyEngine({ projectRoot: tempDir, dbPath: testDbPath });
    await engine.registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      data_use_policy: 'no_training',
      display_name: 'Mock Provider',
      enabled: true,
    });
    engine.close();

    const res = spawnSync(process.execPath, [CLI_PATH, 'run', 'create hello.ts', '--cwd', tempDir], {
      cwd: tempDir,
      env: testEnv,
      encoding: 'utf8',
    });
    expect(res.status).toBe(3);
    expect(res.stderr).toContain('APPROVAL_REQUIRED');
  });

  // ---------------------------------------------------------------------------
  // GAP-051: Structured run.failed in JSON mode & Valid NDJSON stream
  // ---------------------------------------------------------------------------

  it('emits valid NDJSON events with structured error_details on failure in --json mode', async () => {
    // Seed database with mock provider
    const engine = new FlappyEngine({ projectRoot: tempDir, dbPath: testDbPath });
    await engine.registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      data_use_policy: 'no_training',
      display_name: 'Mock Provider',
      enabled: true,
    });
    engine.close();

    // Run without --approve-plan in --json mode
    const res = spawnSync(
      process.execPath,
      [CLI_PATH, 'run', 'create hello.ts', '--json', '--cwd', tempDir],
      {
        cwd: tempDir,
        env: testEnv,
        encoding: 'utf8',
      }
    );

    expect(res.status).toBe(3);

    // Verify stdout contains ONLY valid JSON lines (pure NDJSON)
    const stdoutLines = res.stdout.trim().split('\n').filter(Boolean);
    expect(stdoutLines.length).toBeGreaterThan(0);

    const parsedEvents: any[] = [];
    for (const line of stdoutLines) {
      let parsed: any;
      expect(() => {
        parsed = JSON.parse(line);
      }).not.toThrow();
      parsedEvents.push(parsed);
    }

    // Must find run.failed event with error_details conforming to StructuredErrorSchema
    const failedEvent = parsedEvents.find((e) => e.type === 'run.failed');
    expect(failedEvent).toBeDefined();
    expect(failedEvent.error_details).toBeDefined();
    expect(failedEvent.error_details.code).toBe('APPROVAL_REQUIRED');
    expect(failedEvent.error_details.category).toBe('approval_required');
    expect(StructuredErrorSchema.safeParse(failedEvent.error_details).success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // GAP-024: Exit Code 0 (Successful Complete Run)
  // ---------------------------------------------------------------------------

  it('exits with code 0 on complete successful headless run with --approve-plan', async () => {
    // Seed database with mock provider
    const engine = new FlappyEngine({ projectRoot: tempDir, dbPath: testDbPath });
    await engine.registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      data_use_policy: 'no_training',
      display_name: 'Mock Provider',
      enabled: true,
    });
    engine.close();

    const res = spawnSync(
      process.execPath,
      [CLI_PATH, 'run', 'create greeting.ts', '--approve-plan', '--cwd', tempDir],
      {
        cwd: tempDir,
        env: testEnv,
        encoding: 'utf8',
        timeout: 20000,
      }
    );

    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Done');
  });

  // ---------------------------------------------------------------------------
  // GAP-056: Local Debug Logging with --debug
  // ---------------------------------------------------------------------------

  it('writes debug records to local flappycode.log when --debug is passed', async () => {
    const res = spawnSync(
      process.execPath,
      [CLI_PATH, 'run', '--debug'],
      {
        cwd: tempDir,
        env: testEnv,
        encoding: 'utf8',
      }
    );
    expect(res.status).toBe(2);

    const logFile = path.join(tempLogDir, 'flappycode.log');
    expect(fs.existsSync(logFile)).toBe(true);

    const logContent = fs.readFileSync(logFile, 'utf8');
    expect(logContent).toContain('"level":"debug"');
  });

  // ---------------------------------------------------------------------------
  // GAP-024: Exit Code 130 (Cancellation via SIGINT)
  // ---------------------------------------------------------------------------

  it('exits with code 130 when cancelled via SIGINT', async () => {
    // Seed database with mock provider
    const engine = new FlappyEngine({ projectRoot: tempDir, dbPath: testDbPath });
    await engine.registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      data_use_policy: 'no_training',
      display_name: 'Mock Provider',
      enabled: true,
    });
    engine.close();

    // Spawn long running task and send SIGINT
    const child = spawn(
      process.execPath,
      [CLI_PATH, 'run', 'long running task', '--approve-plan', '--json', '--cwd', tempDir],
      {
        cwd: tempDir,
        env: testEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    let stdoutData = '';
    child.stdout.on('data', (d) => {
      stdoutData += d.toString();
      // As soon as run.started is seen, send SIGINT
      if (stdoutData.includes('run.started')) {
        child.kill('SIGINT');
      }
    });

    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('close', (code) => {
        resolve(code);
      });
    });

    // In Windows or POSIX, child killed or handling SIGINT exits with 130
    expect([130, null]).toContain(exitCode);
  });

  // ---------------------------------------------------------------------------
  // Exit Code 1: Operational / Domain Errors
  // ---------------------------------------------------------------------------

  it('exits with code 1 when agents show is called for an unknown agent', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, 'agents', 'show', 'unknown-agent-xyz'], {
      cwd: tempDir,
      env: testEnv,
      encoding: 'utf8',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not found');
  });

  it('exits with code 1 when providers test is called for an unknown provider', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, 'providers', 'test', 'nonexistent-provider-xyz'], {
      cwd: tempDir,
      env: testEnv,
      encoding: 'utf8',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not found');
  });

  // ---------------------------------------------------------------------------
  // Exit Code 0: Info and Health Commands
  // ---------------------------------------------------------------------------

  it('exits with code 0 on --version', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, '--version'], {
      cwd: tempDir,
      env: testEnv,
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it('exits with code 0 on --help', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, '--help'], {
      cwd: tempDir,
      env: testEnv,
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('flappycode');
    expect(res.stdout).toContain('Commands:');
  });

  it('exits with code 0 on doctor command', () => {
    const res = spawnSync(process.execPath, [CLI_PATH, 'doctor'], {
      cwd: tempDir,
      env: testEnv,
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('Diagnostics');
  });
});

