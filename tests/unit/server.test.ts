import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { FlappyEngine } from '@flappycode/core';
import { FlappyServer } from '@flappycode/server';

describe('FlappyServer Loopback HTTP/SSE Security Tests (FR-SRV-001, FR-SRV-002, User Constraint 5)', () => {
  let engine: FlappyEngine;
  let server: FlappyServer;
  const testPort = 14477;

  beforeAll(async () => {
    engine = new FlappyEngine({ dbPath: ':memory:' });
    server = new FlappyServer(engine, { port: testPort, host: '127.0.0.1' });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    engine.db.close();
  });

  it('Strictly rejects non-loopback host binding (e.g. 0.0.0.0)', () => {
    expect(
      () => new FlappyServer(engine, { port: 14478, host: '0.0.0.0' })
    ).toThrow(/Security Violation: flappycode serve only permits loopback binding/);
  });

  it('Serves public health check endpoint', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('ok');
  });

  it('Serves OpenAPI spec without authentication', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/openapi.json`);
    expect(res.status).toBe(200);
    const spec = (await res.json()) as any;
    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info.title).toBe('FlappyCode Local Server API');
  });

  it('Rejects protected endpoint requests without Bearer token (401 Unauthorized)', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/v1/registry`);
    expect(res.status).toBe(401);
  });

  it('Accepts protected endpoint requests with valid Bearer token', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/v1/registry`, {
      headers: {
        Authorization: `Bearer ${server.bearerToken}`,
      },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.total_models).toBeDefined();
  });
});
