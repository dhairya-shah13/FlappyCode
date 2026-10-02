import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { checkUpgrade, compareSemver } from '@flappycode/core';

describe('NEW-003: Upgrade command and version check logic', () => {
  let server: http.Server;
  let serverPort: number;
  let serverHandler: (req: http.IncomingMessage, res: http.ServerResponse) => void;
  let tempDir: string;
  const cliBin = path.resolve(process.cwd(), 'packages/cli/dist/cli.js');

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-upgrade-test-'));
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        if (serverHandler) {
          serverHandler(req, res);
        } else {
          res.writeHead(404);
          res.end();
        }
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('compareSemver correctly compares semantic versions', () => {
    expect(compareSemver('0.2.0', '0.1.0')).toBeGreaterThan(0);
    expect(compareSemver('0.1.0', '0.2.0')).toBeLessThan(0);
    expect(compareSemver('0.1.0', '0.1.0')).toBe(0);
    expect(compareSemver('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareSemver('0.1.1', '0.1.0')).toBeGreaterThan(0);
  });

  it('detects when an update is available against mock registry', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: '0.2.0' }));
    };

    const result = await checkUpgrade({
      currentVersion: '0.1.0',
      registryUrl: `http://127.0.0.1:${serverPort}/flappycode/latest`,
    });

    expect(result.status).toBe('update_available');
    expect(result.latestVersion).toBe('0.2.0');
    expect(result.message).toContain('0.2.0');
  });

  it('detects when flappycode is up to date', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: '0.1.0' }));
    };

    const result = await checkUpgrade({
      currentVersion: '0.1.0',
      registryUrl: `http://127.0.0.1:${serverPort}/flappycode/latest`,
    });

    expect(result.status).toBe('up_to_date');
    expect(result.message).toContain('up to date');
  });

  it('handles package 404 gracefully without unhandled errors', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(404);
      res.end();
    };

    const result = await checkUpgrade({
      currentVersion: '0.1.0',
      registryUrl: `http://127.0.0.1:${serverPort}/flappycode/latest`,
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('not found');
  });

  it('respects enabled: false and avoids network calls', async () => {
    let called = false;
    serverHandler = (_req, res) => {
      called = true;
      res.writeHead(200);
      res.end();
    };

    const result = await checkUpgrade({
      currentVersion: '0.1.0',
      registryUrl: `http://127.0.0.1:${serverPort}/flappycode/latest`,
      enabled: false,
    });

    expect(result.status).toBe('disabled');
    expect(called).toBe(false);
  });

  it('executes flappycode upgrade --check against mock registry', async () => {
    serverHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: '0.5.0' }));
    };

    const { exec } = await import('node:child_process');
    const out = await new Promise<string>((resolve, reject) => {
      exec(
        `node "${cliBin}" upgrade --check --registry http://127.0.0.1:${serverPort}/flappycode/latest`,
        {
          cwd: tempDir,
          env: { ...process.env, HOME: tempDir, APPDATA: tempDir, LOCALAPPDATA: tempDir },
          encoding: 'utf8',
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(`Command failed: ${error.message}\n${stderr || stdout}`));
          } else {
            resolve(stdout);
          }
        }
      );
    });

    expect(out).toContain('Checking for updates...');
    expect(out).toContain('0.5.0');
  });
});
