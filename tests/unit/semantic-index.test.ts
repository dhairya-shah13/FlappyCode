import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlappyDatabase } from '@flappycode/storage';
import { FsJail } from '../../packages/core/src/tools/fs-jail.js';
import { PlanGate } from '../../packages/core/src/rules/plan-gate.js';
import { SemanticIndex } from '../../packages/core/src/tools/semantic-index.js';

describe('SemanticIndex (P1-D8)', () => {
  let tempDir: string;
  let fsJail: FsJail;
  let flappyDb: FlappyDatabase;
  let index: SemanticIndex;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-semantic-'));
    fsJail = new FsJail(tempDir, new PlanGate());
    flappyDb = new FlappyDatabase({ path: ':memory:' });
    index = new SemanticIndex(fsJail, flappyDb.db);
  });

  afterEach(() => {
    try {
      flappyDb.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('builds an index from project files and finds relevant code via BM25', () => {
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'src', 'auth.ts'),
      `export function authenticateUser(token: string) {\n  // Verify JWT session\n  return jwt.verify(token);\n}\n`
    );
    fs.writeFileSync(
      path.join(tempDir, 'src', 'payment.ts'),
      `export function processStripePayment(amount: number) {\n  // Handle billing checkout\n  return stripe.charges.create({ amount });\n}\n`
    );

    const indexedCount = index.buildIndex();
    expect(indexedCount).toBe(2);

    // Search query for auth
    const results = index.search('authenticate user token session');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].file).toBe('src/auth.ts');
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].preview).toContain('authenticateUser');

    // Search query for payment
    const paymentResults = index.search('billing checkout stripe payment');
    expect(paymentResults.length).toBeGreaterThan(0);
    expect(paymentResults[0].file).toBe('src/payment.ts');
  });

  it('handles incremental file updates and deletions', () => {
    fs.mkdirSync(path.join(tempDir, 'lib'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'lib', 'router.ts'),
      `export class Router { route(req: Request) { return 200; } }`
    );

    index.buildIndex();
    let res = index.search('router route request');
    expect(res.length).toBe(1);

    // Update file with new content
    fs.writeFileSync(
      path.join(tempDir, 'lib', 'router.ts'),
      `export class FastRouter { dispatch(url: string) { return url; } }`
    );
    index.updateFile('lib/router.ts');

    const oldRes = index.search('route request');
    expect(oldRes.length).toBe(0);

    const newRes = index.search('dispatch url fastrouter');
    expect(newRes.length).toBe(1);
    expect(newRes[0].preview).toContain('FastRouter');

    // Delete file
    index.removeFile('lib/router.ts');
    const delRes = index.search('dispatch url');
    expect(delRes.length).toBe(0);
  });

  it('respects FsJail boundaries and ignores files outside jail', () => {
    const res = index.search('../outside/secret.txt');
    expect(res).toEqual([]);
  });

  it('skips binary and hidden files or git directories', () => {
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.git', 'config'), 'core git config data');
    fs.mkdirSync(path.join(tempDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'dep.js'), 'external package code');

    const count = index.buildIndex();
    expect(count).toBe(0);
  });

  it('redacts sensitive secret patterns so they are never indexed', () => {
    fs.writeFileSync(
      path.join(tempDir, 'config.ts'),
      `const config = {\n  apiKey: "sk-ant-api03-abcdefghijklmnop1234567890abcdef",\n  serverPort: 8080\n};`
    );

    index.buildIndex();
    const results = index.search('sk-ant-api03');
    for (const r of results) {
      expect(r.preview).not.toContain('sk-ant-api03-abcdefghijklmnop1234567890abcdef');
    }
  });

  it('returns empty array when no matches exist', () => {
    fs.writeFileSync(path.join(tempDir, 'hello.txt'), 'hello world');
    index.buildIndex();

    const results = index.search('quantum physics astrophysics');
    expect(results).toEqual([]);
  });
});
