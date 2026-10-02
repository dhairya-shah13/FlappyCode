import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { LspClient } from '@flappycode/core';

describe('GAP-016: Real LSP Integration', () => {
  let tempDir: string;
  let client: LspClient;
  const fixtureServerPath = path.resolve(__dirname, '../fixtures/lsp-server.cjs');

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-lsp-test-'));
    client = new LspClient();
    // Register our deterministic mock LSP fixture for typescript
    client.registerLanguageServer('typescript', {
      command: 'node',
      args: [fixtureServerPath],
      timeoutMs: 3000,
    });
  });

  afterEach(async () => {
    await client.shutdown();
    await new Promise((r) => setTimeout(r, 100));
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('detects supported languages based on file extensions', () => {
    expect(client.detectLanguage('src/app.ts')).toBe('typescript');
    expect(client.detectLanguage('src/component.tsx')).toBe('typescript');
    expect(client.detectLanguage('index.js')).toBe('javascript');
    expect(client.detectLanguage('script.py')).toBe('python');
    expect(client.detectLanguage('main.rs')).toBe('rust');
    expect(client.detectLanguage('server.go')).toBe('go');
    expect(client.detectLanguage('notes.txt')).toBeNull();
  });

  it('starts LSP session, receives didOpen, and normalizes diagnostics', async () => {
    const testFile = path.join(tempDir, 'error.ts');
    const content = 'const x: number = "string"; // intentional_type_error';
    fs.writeFileSync(testFile, content, 'utf8');

    await client.notifyChange(testFile, content, tempDir);

    // Wait a brief moment for async diagnostics notification over stdio
    await new Promise((r) => setTimeout(r, 300));

    expect(client.isAvailable('typescript')).toBe(true);

    const diags = await client.getDiagnostics(tempDir, testFile);
    expect(diags.length).toBe(1);
    expect(diags[0].severity).toBe('error');
    expect(diags[0].line).toBe(2);
    expect(diags[0].message).toContain("Type 'string' is not assignable to type 'number'");
    expect(diags[0].code).toBe('TS2322');
    expect(diags[0].source).toBe('mock-lsp');
  });

  it('clears diagnostics when a corrective edit is sent', async () => {
    const testFile = path.join(tempDir, 'fixable.ts');
    const badContent = 'const x: number = "string";';
    fs.writeFileSync(testFile, badContent, 'utf8');

    await client.notifyChange(testFile, badContent, tempDir);
    await new Promise((r) => setTimeout(r, 300));
    expect((await client.getDiagnostics(tempDir, testFile)).length).toBe(1);

    // Corrective edit
    const fixedContent = 'const x: number = 42;';
    fs.writeFileSync(testFile, fixedContent, 'utf8');
    await client.notifyChange(testFile, fixedContent, tempDir);
    await new Promise((r) => setTimeout(r, 300));

    const diagsAfter = await client.getDiagnostics(tempDir, testFile);
    expect(diagsAfter.length).toBe(0);
  });

  it('handles multiple files simultaneously', async () => {
    const file1 = path.join(tempDir, 'file1.ts');
    const file2 = path.join(tempDir, 'file2.ts');
    fs.writeFileSync(file1, 'const x: number = "string";', 'utf8');
    fs.writeFileSync(file2, 'const y: number = 100;', 'utf8');

    await client.notifyChange(file1, 'const x: number = "string";', tempDir);
    await client.notifyChange(file2, 'const y: number = 100;', tempDir);
    await new Promise((r) => setTimeout(r, 300));

    const diags1 = await client.getDiagnostics(tempDir, file1);
    const diags2 = await client.getDiagnostics(tempDir, file2);
    expect(diags1.length).toBe(1);
    expect(diags2.length).toBe(0);

    const allDiags = await client.getDiagnostics(tempDir);
    expect(allDiags.length).toBe(1);
  });

  it('degrades gracefully when language server command does not exist without throwing', async () => {
    const deadClient = new LspClient();
    deadClient.registerLanguageServer('typescript', {
      command: 'non_existent_binary_flappy_lsp_12345',
      args: [],
    });

    const file = path.join(tempDir, 'test.ts');
    // Should not throw
    await deadClient.notifyChange(file, 'const a = 1;', tempDir);
    expect(deadClient.isAvailable('typescript')).toBe(false);

    const diags = await deadClient.getDiagnostics(tempDir, file);
    expect(diags).toEqual([]);
    await deadClient.shutdown();
  });

  it('handles server crash gracefully and marks session terminated', async () => {
    const crashClient = new LspClient();
    crashClient.registerLanguageServer('typescript', {
      command: 'node',
      args: [fixtureServerPath, '--crash-on-open'],
      timeoutMs: 2000,
    });

    const file = path.join(tempDir, 'crash.ts');
    await crashClient.notifyChange(file, 'const x = 1;', tempDir);
    await new Promise((r) => setTimeout(r, 400));

    expect(crashClient.isAvailable('typescript')).toBe(false);
    const diags = await crashClient.getDiagnostics(tempDir, file);
    expect(diags).toEqual([]);
    await crashClient.shutdown();
  });

  it('handles server timeout gracefully', async () => {
    const timeoutClient = new LspClient();
    timeoutClient.registerLanguageServer('typescript', {
      command: 'node',
      args: [fixtureServerPath, '--hang'],
      timeoutMs: 500, // short timeout for testing
    });

    const file = path.join(tempDir, 'hang.ts');
    await timeoutClient.notifyChange(file, 'const x = 1;', tempDir);

    expect(timeoutClient.isAvailable('typescript')).toBe(false);
    await timeoutClient.shutdown();
  });
});
