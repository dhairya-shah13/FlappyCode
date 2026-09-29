import { describe, expect, it } from 'vitest';
import { CLI_VERSION, main, parseArgs } from '../cli.js';

describe('CLI Argument Parser', () => {
  it('parses version flags', () => {
    expect(parseArgs(['-v']).flags.version).toBe(true);
    expect(parseArgs(['--version']).flags.version).toBe(true);
  });

  it('parses help flags', () => {
    expect(parseArgs(['-h']).flags.help).toBe(true);
    expect(parseArgs(['--help']).flags.help).toBe(true);
  });

  it('parses commands and positional arguments', () => {
    const parsed = parseArgs(['run', 'fix the login button', '--approve-plan', '--model', 'anthropic:claude-3-5-sonnet']);
    expect(parsed.command).toBe('run');
    expect(parsed.args).toEqual(['fix the login button']);
    expect(parsed.flags.approvePlan).toBe(true);
    expect(parsed.flags.model).toBe('anthropic:claude-3-5-sonnet');
  });

  it('parses replay command with fixture path', () => {
    const parsed = parseArgs(['replay', 'fixtures/home-ready.jsonl']);
    expect(parsed.command).toBe('replay');
    expect(parsed.args).toEqual(['fixtures/home-ready.jsonl']);
  });
});

describe('CLI main execution', () => {
  it('handles --version flag returning exit code 0', async () => {
    const code = await main(['--version']);
    expect(code).toBe(0);
  });

  it('handles --help flag returning exit code 0', async () => {
    const code = await main(['--help']);
    expect(code).toBe(0);
  });

  it('enforces --approve-plan for headless run command', async () => {
    const code = await main(['run', 'refactor auth']);
    expect(code).toBe(3);
  });

  it('allows headless run command with --approve-plan', async () => {
    const code = await main(['run', 'refactor auth', '--approve-plan', '--quiet']);
    expect(code).toBe(0);
  });
});
