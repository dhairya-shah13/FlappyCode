import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Logger, SecretGuard, getLogDir } from '@flappycode/core';

describe('Stage E: Logger Subsystem (GAP-056)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappycode-log-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('writes structured JSON log records to flappycode.log', () => {
    const logger = new Logger({ logDir: tempDir, level: 'debug' });
    logger.info('Test info message', { runId: 'run-123', status: 'active' });
    logger.warn('Test warn message');

    const logFile = path.join(tempDir, 'flappycode.log');
    expect(fs.existsSync(logFile)).toBe(true);

    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);

    const record1 = JSON.parse(lines[0]);
    expect(record1.level).toBe('info');
    expect(record1.message).toBe('Test info message');
    expect(record1.context).toEqual({ runId: 'run-123', status: 'active' });
    expect(record1.timestamp).toBeDefined();

    const record2 = JSON.parse(lines[1]);
    expect(record2.level).toBe('warn');
    expect(record2.message).toBe('Test warn message');
  });

  it('respects log levels and ignores records below configured level', () => {
    const logger = new Logger({ logDir: tempDir, level: 'warn' });
    logger.debug('Debug should not be written');
    logger.info('Info should not be written');
    logger.warn('Warn should be written');
    logger.error('Error should be written');

    const logFile = path.join(tempDir, 'flappycode.log');
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);

    expect(JSON.parse(lines[0]).level).toBe('warn');
    expect(JSON.parse(lines[1]).level).toBe('error');
  });

  it('rotates log files when exceeding maxSizeBytes and keeps up to maxFiles', () => {
    // 200 bytes max size, keep 2 backup files
    const logger = new Logger({
      logDir: tempDir,
      maxSizeBytes: 200,
      maxFiles: 2,
      level: 'info',
    });

    for (let i = 0; i < 20; i++) {
      logger.info(`Message index ${i} with substantial padding to exceed rotation limit quickly.`);
    }

    const logFile = path.join(tempDir, 'flappycode.log');
    const backup1 = path.join(tempDir, 'flappycode.log.1');
    const backup2 = path.join(tempDir, 'flappycode.log.2');
    const backup3 = path.join(tempDir, 'flappycode.log.3');

    expect(fs.existsSync(logFile)).toBe(true);
    expect(fs.existsSync(backup1)).toBe(true);
    // backup2 might exist, but backup3 must NOT exist since maxFiles = 2
    expect(fs.existsSync(backup3)).toBe(false);
  });

  it('redacts secrets from messages and context using SecretGuard', () => {
    const secretGuard = new SecretGuard();
    secretGuard.addSecret('sk-openrouter-secret-token-12345');
    secretGuard.addSecret('ghp_myGitHubPersonalAccessToken999');

    const logger = new Logger({
      logDir: tempDir,
      level: 'debug',
      secretGuard,
    });

    logger.info('Calling provider with token sk-openrouter-secret-token-12345 for prompt', {
      authHeader: 'Bearer ghp_myGitHubPersonalAccessToken999',
      safeKey: 'ok-value',
    });

    const logFile = path.join(tempDir, 'flappycode.log');
    const content = fs.readFileSync(logFile, 'utf8');

    expect(content).not.toContain('sk-openrouter-secret-token-12345');
    expect(content).not.toContain('ghp_myGitHubPersonalAccessToken999');
    expect(content).toContain('[REDACTED_SECRET]');
    expect(content).toContain('ok-value');
  });

  it('resolves platform-specific log directory or FLAPPYCODE_LOG_DIR override', () => {
    const origEnv = process.env.FLAPPYCODE_LOG_DIR;
    try {
      process.env.FLAPPYCODE_LOG_DIR = tempDir;
      expect(getLogDir()).toBe(tempDir);
    } finally {
      if (origEnv !== undefined) {
        process.env.FLAPPYCODE_LOG_DIR = origEnv;
      } else {
        delete process.env.FLAPPYCODE_LOG_DIR;
      }
    }
  });
});
