import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AbortedError,
  MockProvider,
  scenario,
} from '@flappycode/providers';
import {
  getAgent,
  loadAllAgents,
  parseAgentDefinition,
  runAgent,
} from '../index.js';

describe('Agent Definition Loader', () => {
  let tmpProjectDir: string;

  beforeEach(() => {
    tmpProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-agents-proj-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpProjectDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('loads all 8 built-in specialist agents', () => {
    const agents = loadAllAgents({ projectRoot: tmpProjectDir });
    expect(agents.size).toBeGreaterThanOrEqual(8);

    const expectedNames = [
      'planner',
      'coder',
      'reviewer',
      'tester',
      'file-finder',
      'executor',
      'analyst',
      'general',
    ];

    for (const name of expectedNames) {
      const agent = agents.get(name);
      expect(agent, `Agent ${name} should be loaded`).toBeDefined();
      expect(agent?.allowedTools.length).toBeGreaterThan(0);
      expect(agent?.systemPrompt).toBeDefined();
    }
  });

  it('verifies coder agent configuration', () => {
    const coder = getAgent('coder', { projectRoot: tmpProjectDir });
    expect(coder).not.toBeNull();
    expect(coder?.model).toBe('auto:best-fit-free');
    expect(coder?.allowedTools).toContain('write_file');
    expect(coder?.allowedTools).toContain('read_file');
    expect(coder?.systemPrompt).toContain('Coder specialist agent');
  });

  it('allows project-local agent to override built-in agent', () => {
    const projectAgentsDir = path.join(tmpProjectDir, '.flappycode', 'agents');
    fs.mkdirSync(projectAgentsDir, { recursive: true });

    fs.writeFileSync(
      path.join(projectAgentsDir, 'coder.md'),
      `---
name: "coder"
description: "Custom project coder"
allowedTools:
  - "read_file"
model: "openai:gpt-4o"
fallbackPolicy: "abort"
---
Custom prompt for project coder.
`
    );

    const overridden = getAgent('coder', { projectRoot: tmpProjectDir });
    expect(overridden).not.toBeNull();
    expect(overridden?.description).toBe('Custom project coder');
    expect(overridden?.model).toBe('openai:gpt-4o');
    expect(overridden?.allowedTools).toEqual(['read_file']);
    expect(overridden?.systemPrompt).toContain('Custom prompt for project coder.');
  });

  it('throws on invalid agent schema', () => {
    const invalidYaml = `---
name: ""
description: 123
allowedTools: "not-an-array"
---
`;
    expect(() => parseAgentDefinition(invalidYaml, 'invalid.md')).toThrow();
  });
});

describe('Agent Runtime Loop', () => {
  it('executes simple text response without tools in 1 step', async () => {
    const mock = new MockProvider();
    mock.queueActions(scenario.ok('Here is the plan.'));

    const agent = {
      name: 'planner',
      description: 'Planner',
      allowedTools: ['read_file'],
      model: 'flappyauto',
      fallbackPolicy: 'ask_user' as const,
    };

    const res = await runAgent({
      agent,
      connector: mock,
      modelId: 'mock:planner',
      messages: [{ role: 'user', content: 'Plan the authentication feature' }],
    });

    expect(res.stepsCount).toBe(1);
    expect(res.toolCallsCount).toBe(0);
    expect(res.finalText).toBe('Here is the plan.');
    expect(res.messages).toHaveLength(2); // user + assistant
    expect(res.tokensUsed.total).toBe(14); // 10 prompt + 4 words
  });

  it('executes multi-step tool call loop with verbatim tool outputs', async () => {
    const mock = new MockProvider();

    // Step 1: Model issues tool call
    mock.queueActions(scenario.okToolCall('read_file', { path: 'src/main.ts' }));

    // Step 2: Model finishes with final text after seeing tool result
    mock.queueActions(scenario.ok('File content analyzed successfully.'));

    const agent = {
      name: 'coder',
      description: 'Coder',
      allowedTools: ['read_file', 'write_file'],
      model: 'auto:best-fit-free',
      fallbackPolicy: 'next_free' as const,
    };

    const toolExecutionLogs: string[] = [];

    const res = await runAgent({
      agent,
      connector: mock,
      modelId: 'mock:coder',
      messages: [{ role: 'user', content: 'Read src/main.ts' }],
      toolHandler: async (call) => {
        toolExecutionLogs.push(`${call.name}:${call.arguments}`);
        return { result: 'export const main = 1;' };
      },
    });

    expect(res.stepsCount).toBe(2);
    expect(res.toolCallsCount).toBe(1);
    expect(toolExecutionLogs).toEqual(['read_file:{"path":"src/main.ts"}']);

    // Check conversation structure: user -> assistant (tool_call) -> tool (verbatim) -> assistant (final text)
    expect(res.messages).toHaveLength(4);
    expect(res.messages[1].role).toBe('assistant');
    expect(res.messages[1].toolCalls).toHaveLength(1);
    expect(res.messages[2].role).toBe('tool');
    expect(res.messages[2].content).toBe('export const main = 1;');
    expect(res.messages[3].role).toBe('assistant');
    expect(res.messages[3].content).toBe('File content analyzed successfully.');
  });

  it('rejects disallowed tool call and appends verbatim error', async () => {
    const mock = new MockProvider();

    mock.queueActions(
      scenario.okToolCall('execute_command', { cmd: 'rm -rf /' }),
      scenario.ok('Understood, tool was not permitted.')
    );

    const agent = {
      name: 'reviewer',
      description: 'Reviewer',
      allowedTools: ['read_file'], // execute_command NOT allowed
      model: 'flappyauto',
      fallbackPolicy: 'abort' as const,
    };

    const res = await runAgent({
      agent,
      connector: mock,
      modelId: 'mock:reviewer',
      messages: [{ role: 'user', content: 'Review changes' }],
    });

    expect(res.toolCallsCount).toBe(1);
    const toolMsg = res.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('Tool "execute_command" is not permitted for agent "reviewer"');
  });

  it('detects malformed JSON arguments and returns repair hint', async () => {
    const mock = new MockProvider();

    mock.queueActions(
      scenario.malformedToolCall('read_file', '{"path": invalid-json}'),
      scenario.ok('I will retry with valid JSON.')
    );

    const agent = {
      name: 'coder',
      description: 'Coder',
      allowedTools: ['read_file'],
      model: 'auto:best-fit-free',
      fallbackPolicy: 'abort' as const,
    };

    const res = await runAgent({
      agent,
      connector: mock,
      modelId: 'mock:coder',
      messages: [{ role: 'user', content: 'Read file' }],
    });

    const toolMsg = res.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('Malformed JSON arguments for tool "read_file"');
  });

  it('respects abort signal', async () => {
    const mock = new MockProvider();
    mock.queueActions(scenario.slowStream(50, 'Part 1 Part 2'));

    const controller = new AbortController();
    controller.abort();

    const agent = {
      name: 'general',
      description: 'General',
      allowedTools: [],
      model: 'flappyauto',
      fallbackPolicy: 'abort' as const,
    };

    await expect(
      runAgent({
        agent,
        connector: mock,
        modelId: 'mock:general',
        messages: [{ role: 'user', content: 'Test' }],
        signal: controller.signal,
      })
    ).rejects.toThrow(AbortedError);
  });
});
