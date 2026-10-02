import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { FsJail, SearchTool } from '@flappycode/core';

describe('NEW-007: SearchTool Comprehensive Unit Tests (FR-COD-006)', () => {
  let tempDir: string;
  let fsJail: FsJail;
  let searchTool: SearchTool;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-search-test-'));
    fsJail = new FsJail(tempDir);
    // Injected spawn that reports rg as unavailable to guarantee pure-JS fallback testing
    const noRgSpawn = (() => ({
      error: new Error('rg not found'),
      status: 127,
      stdout: '',
      stderr: 'not found',
    })) as any;
    searchTool = new SearchTool(fsJail, noRgSpawn);

    // Create test files
    fsJail.writeFile('src/app.ts', 'const app = "FlappyCode";\nconsole.log(app);\nexport default app;');
    fsJail.writeFile('src/utils.ts', 'export function helper() {\n  return "FLAPPY_HELPER";\n}');
    fsJail.writeFile('docs/README.md', '# FlappyCode Documentation\nWelcome to FlappyCode architecture.');
    fsJail.writeFile('binary.bin', 'header\0binary_data_FLAPPY\0footer');
    fsJail.writeFile('image.png', 'PNG_FAKE_FLAPPY_DATA');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('pure-JS path finds case-insensitive matches by default', () => {
    const results = searchTool.search('flappycode');
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some((m) => m.file === 'src/app.ts')).toBe(true);
    expect(results.some((m) => m.file === 'docs/README.md')).toBe(true);
  });

  it('pure-JS path honors case-sensitive flag', () => {
    const sensitiveUpper = searchTool.search('FLAPPY_HELPER', 50, { caseSensitive: true });
    expect(sensitiveUpper.length).toBe(1);
    expect(sensitiveUpper[0].file).toBe('src/utils.ts');

    const sensitiveLower = searchTool.search('flappy_helper', 50, { caseSensitive: true });
    expect(sensitiveLower.length).toBe(0);
  });

  it('pure-JS path supports regex matching with /regex/ format and options', () => {
    const regexSlash = searchTool.search('/helper\\(\\)/');
    expect(regexSlash.length).toBe(1);
    expect(regexSlash[0].file).toBe('src/utils.ts');

    const regexOpt = searchTool.search('helper\\(\\)', 50, { isRegex: true });
    expect(regexOpt.length).toBe(1);
    expect(regexOpt[0].file).toBe('src/utils.ts');
  });

  it('pure-JS path handles invalid regex gracefully without throwing', () => {
    const invalidRegex = searchTool.search('/[invalid(/');
    expect(invalidRegex).toEqual([]);

    const invalidRegexOpt = searchTool.search('[invalid(', 50, { isRegex: true });
    expect(invalidRegexOpt).toEqual([]);
  });

  it('pure-JS path returns empty array on empty query', () => {
    expect(searchTool.search('')).toEqual([]);
    expect(searchTool.search('   ')).toEqual([]);
  });

  it('pure-JS path skips binary files and images', () => {
    const results = searchTool.search('FLAPPY');
    // Should NOT contain binary.bin or image.png
    expect(results.some((m) => m.file === 'binary.bin')).toBe(false);
    expect(results.some((m) => m.file === 'image.png')).toBe(false);
  });

  it('pure-JS path respects maxResults limit', () => {
    const results = searchTool.search('FlappyCode', 1);
    expect(results.length).toBe(1);
  });

  it('ripgrep path parses rg --json output correctly', () => {
    // Mock rg returning valid match json
    const mockRgSpawn = ((_cmd: string, args: string[]) => {
      if (args[0] === '--version') {
        return { status: 0, stdout: 'ripgrep 14.1.0', stderr: '', error: undefined };
      }
      const matchOutput = [
        JSON.stringify({
          type: 'match',
          data: {
            path: { text: 'src/app.ts' },
            lines: { text: 'const app = "FlappyCode";\n' },
            line_number: 1,
            absolute_offset: 0,
            submatches: [{ match: { text: 'FlappyCode' }, start: 13, end: 23 }],
          },
        }),
      ].join('\n');
      return { status: 0, stdout: matchOutput, stderr: '', error: undefined };
    }) as any;

    const rgTool = new SearchTool(fsJail, mockRgSpawn);
    expect(rgTool.isRgAvailable()).toBe(true);

    const matches = rgTool.search('FlappyCode');
    expect(matches.length).toBe(1);
    expect(matches[0].file).toBe('src/app.ts');
    expect(matches[0].line).toBe(1);
    expect(matches[0].content).toBe('const app = "FlappyCode";');
  });

  it('ripgrep path falls back to pure-JS when rg fails or errors', () => {
    let callCount = 0;
    const failingRgSpawn = ((_cmd: string, args: string[]) => {
      callCount++;
      if (args[0] === '--version') {
        return { status: 0, stdout: 'ripgrep 14.1.0', stderr: '', error: undefined };
      }
      return { status: 2, stdout: '', stderr: 'rg syntax error', error: new Error('rg failed') };
    }) as any;

    const fallbackTool = new SearchTool(fsJail, failingRgSpawn);
    const matches = fallbackTool.search('FlappyCode');
    // Should fall back to JS and find app.ts and README.md
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.some((m) => m.file === 'src/app.ts')).toBe(true);
  });
});
