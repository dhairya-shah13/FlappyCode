import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { McpClient } from '@flappycode/core';

describe('GAP-017: Real MCP Client', () => {
  let client: McpClient;
  const fixtureServerPath = path.resolve(__dirname, '../fixtures/mcp-server.cjs');

  beforeEach(() => {
    client = new McpClient();
  });

  afterEach(async () => {
    await client.shutdown();
  });

  it('registers MCP servers and enumerates tools with schema preservation and namespacing', async () => {
    client.registerServer({
      name: 'calc_server',
      command: 'node',
      args: [fixtureServerPath],
      permissionTier: 'read',
    });

    const tools = await client.listTools();
    expect(tools.length).toBe(2);

    const names = tools.map((t) => t.function.name);
    expect(names).toContain('mcp__calc_server__echo_tool');
    expect(names).toContain('mcp__calc_server__calculate_tool');

    const echoTool = tools.find((t) => t.function.name === 'mcp__calc_server__echo_tool')!;
    expect(echoTool.function.description).toContain('[MCP: calc_server]');
    expect(echoTool.function.parameters.properties).toHaveProperty('message');
  });

  it('invokes MCP tool successfully and normalizes result', async () => {
    client.registerServer({
      name: 'calc_server',
      command: 'node',
      args: [fixtureServerPath],
    });

    await client.listTools();

    // Call using namespaced name
    const result = await client.callTool('mcp__calc_server__calculate_tool', { a: 15, b: 27 });
    expect(result).toBe('result: 42');

    // Call using unique short name
    const echoResult = await client.callTool('echo_tool', { message: 'hello world' });
    expect(echoResult).toBe('echo: hello world');
  });

  it('enforces permission gate before invoking MCP tools', async () => {
    client.registerServer({
      name: 'secured_server',
      command: 'node',
      args: [fixtureServerPath],
      permissionTier: 'execute',
    });

    await client.listTools();

    // 1. Permission Denied
    await expect(
      client.callTool(
        'mcp__secured_server__calculate_tool',
        { a: 1, b: 2 },
        async (meta) => {
          expect(meta.serverName).toBe('secured_server');
          expect(meta.permissionTier).toBe('execute');
          return false; // Deny
        }
      )
    ).rejects.toThrow('Permission denied');

    // 2. Permission Approved
    const approvedRes = await client.callTool(
      'mcp__secured_server__calculate_tool',
      { a: 5, b: 5 },
      async () => true // Allow
    );
    expect(approvedRes).toBe('result: 10');
  });

  it('handles MCP tool errors cleanly', async () => {
    client.registerServer({
      name: 'err_server',
      command: 'node',
      args: [fixtureServerPath],
    });

    await client.listTools();

    await expect(
      client.callTool('mcp__err_server__echo_tool', { trigger_error: true })
    ).rejects.toThrow('MCP tool error');
  });

  it('handles multiple servers and resolves tool name collisions cleanly', async () => {
    client.registerServer({
      name: 'server_one',
      command: 'node',
      args: [fixtureServerPath],
    });
    client.registerServer({
      name: 'server_two',
      command: 'node',
      args: [fixtureServerPath],
    });

    const tools = await client.listTools();
    // 2 tools per server = 4 tools
    expect(tools.length).toBe(4);

    const names = tools.map((t) => t.function.name);
    expect(names).toContain('mcp__server_one__echo_tool');
    expect(names).toContain('mcp__server_two__echo_tool');

    // Because 'echo_tool' is in both, short name should not be ambiguously callable
    await expect(client.callTool('echo_tool', { message: 'test' })).rejects.toThrow('not found');

    // Namespaced calls work independently
    const res1 = await client.callTool('mcp__server_one__echo_tool', { message: 'first' });
    const res2 = await client.callTool('mcp__server_two__echo_tool', { message: 'second' });
    expect(res1).toBe('echo: first');
    expect(res2).toBe('echo: second');
  });

  it('handles MCP server crash cleanly', async () => {
    client.registerServer({
      name: 'crash_server',
      command: 'node',
      args: [fixtureServerPath, '--crash-on-call'],
    });

    await client.listTools();

    await expect(
      client.callTool('mcp__crash_server__echo_tool', { message: 'test' })
    ).rejects.toThrow();

    expect(client.isAvailable('crash_server')).toBe(false);
  });

  it('handles MCP server timeout cleanly', async () => {
    client.registerServer({
      name: 'hang_server',
      command: 'node',
      args: [fixtureServerPath, '--hang'],
      timeoutMs: 500, // short timeout
    });

    const tools = await client.listTools();
    // Failed server is omitted from tools without breaking client
    expect(tools.length).toBe(0);
    expect(client.isAvailable('hang_server')).toBe(false);
  });
});
