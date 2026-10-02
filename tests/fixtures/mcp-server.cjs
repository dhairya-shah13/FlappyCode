#!/usr/bin/env node

/**
 * Deterministic local MCP fixture server for Vitest.
 * Communicates via JSON-RPC 2.0 (newline-delimited) over stdio.
 */

const readline = require('node:readline');

const args = process.argv.slice(2);
if (args.includes('--hang')) {
  // Deliberately hang - do not process any stdin
  setInterval(() => {}, 10000);
  return;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function send(msgObj) {
  process.stdout.write(JSON.stringify(msgObj) + '\n');
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  if (args.includes('--malformed')) {
    process.stdout.write('INVALID_JSON_RPC_LINE\n');
    return;
  }

  try {
    const msg = JSON.parse(trimmed);
    handleMessage(msg);
  } catch {
    // ignore parse error
  }
});

function handleMessage(msg) {
  // initialize
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'mock-mcp-server',
          version: '1.0.0',
        },
      },
    });
    return;
  }

  // notifications/initialized
  if (msg.method === 'notifications/initialized') {
    return;
  }

  // tools/list
  if (msg.method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        tools: [
          {
            name: 'echo_tool',
            description: 'Echoes the provided message',
            inputSchema: {
              type: 'object',
              properties: {
                message: { type: 'string', description: 'Message to echo' },
              },
              required: ['message'],
            },
          },
          {
            name: 'calculate_tool',
            description: 'Adds two numbers',
            inputSchema: {
              type: 'object',
              properties: {
                a: { type: 'number' },
                b: { type: 'number' },
              },
              required: ['a', 'b'],
            },
          },
        ],
      },
    });
    return;
  }

  // tools/call
  if (msg.method === 'tools/call') {
    if (args.includes('--crash-on-call')) {
      process.exit(1);
    }

    const { name, arguments: toolArgs } = msg.params || {};

    if (toolArgs?.trigger_error) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: 'Tool execution failed: intentional error triggered',
            },
          ],
        },
      });
      return;
    }

    if (name === 'echo_tool') {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [
            {
              type: 'text',
              text: `echo: ${toolArgs?.message}`,
            },
          ],
        },
      });
      return;
    }

    if (name === 'calculate_tool') {
      const sum = (toolArgs?.a || 0) + (toolArgs?.b || 0);
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          content: [
            {
              type: 'text',
              text: `result: ${sum}`,
            },
          ],
        },
      });
      return;
    }

    send({
      jsonrpc: '2.0',
      id: msg.id,
      error: {
        code: -32601,
        message: `Unknown tool: ${name}`,
      },
    });
  }
}
