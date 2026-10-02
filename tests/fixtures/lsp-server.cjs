#!/usr/bin/env node

/**
 * Deterministic local LSP fixture server for Vitest.
 * Pure CommonJS, runs natively with node without any loader.
 */

const args = process.argv.slice(2);
if (args.includes('--hang')) {
  // Deliberately hang to test timeout - do not process any stdin
  setInterval(() => {}, 10000);
  return;
}

let buffer = Buffer.alloc(0);

function send(msgObj) {
  const json = JSON.stringify(msgObj);
  const len = Buffer.byteLength(json, 'utf8');
  process.stdout.write(`Content-Length: ${len}\r\n\r\n${json}`);
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const idx = buffer.indexOf('\r\n\r\n');
    if (idx === -1) break;

    const header = buffer.slice(0, idx).toString('ascii');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.slice(idx + 4);
      continue;
    }

    const len = parseInt(match[1], 10);
    if (buffer.length < idx + 4 + len) break;

    const body = buffer.slice(idx + 4, idx + 4 + len);
    buffer = buffer.slice(idx + 4 + len);

    try {
      const msg = JSON.parse(body.toString('utf8'));
      handleMessage(msg);
    } catch {
      // ignore
    }
  }
});

function handleMessage(msg) {
  if (args.includes('--malformed-response')) {
    process.stdout.write('Content-Length: 15\r\n\r\nINVALID_JSON_RPC');
    return;
  }

  // Request: initialize
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        capabilities: {
          textDocumentSync: 1,
        },
        serverInfo: {
          name: 'mock-lsp-fixture',
          version: '1.0.0',
        },
      },
    });
    return;
  }

  // Request: shutdown
  if (msg.method === 'shutdown') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: null,
    });
    return;
  }

  // Notification: exit
  if (msg.method === 'exit') {
    process.exit(0);
  }

  // Document notifications: didOpen / didChange
  if (msg.method === 'textDocument/didOpen' || msg.method === 'textDocument/didChange') {
    if (args.includes('--crash-on-open')) {
      process.exit(1);
    }

    const uri = msg.params?.textDocument?.uri;
    const text =
      msg.params?.textDocument?.text ||
      (msg.params?.contentChanges && msg.params.contentChanges[0]?.text) ||
      '';

    const hasError = text.includes('intentional_type_error') || text.includes('const x: number = "string";');
    const diagnostics = hasError
      ? [
          {
            range: {
              start: { line: 1, character: 0 },
              end: { line: 1, character: 10 },
            },
            severity: 1, // Error
            code: 'TS2322',
            source: 'mock-lsp',
            message: "Type 'string' is not assignable to type 'number'.",
          },
        ]
      : [];

    send({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: {
        uri,
        diagnostics,
      },
    });
  }
}
