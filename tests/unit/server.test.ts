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

  it('Rejects resolvePoolExhausted with 409 when no paused run exists (no fake success)', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/v1/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.bearerToken}`,
      },
      body: JSON.stringify({
        type: 'resolvePoolExhausted',
        run_id: 'non-existent-run',
        action: 'add_free_provider',
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/No paused pool-exhausted run/);
  });

  it('Executes setModelOverride and deleteModelOverride through /v1/commands', async () => {
    await engine.registry.addProvider({
      id: 'mock-p1',
      type: 'mock',
      data_use_policy: 'no_training',
      display_name: 'Mock Provider',
      enabled: true,
    });

    // Tag to paid
    const resTag = await fetch(`http://127.0.0.1:${testPort}/v1/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.bearerToken}`,
      },
      body: JSON.stringify({
        type: 'setModelOverride',
        model_id: 'mock-p1/mock-coder-free',
        tier: 'paid',
      }),
    });
    expect(resTag.status).toBe(200);
    const bodyTag = (await resTag.json()) as any;
    expect(bodyTag.success).toBe(true);
    expect(bodyTag.tier).toBe('paid');

    const model = engine.getModels().find((m) => m.model_id === 'mock-coder-free');
    expect(model?.tier).toBe('paid');
    expect(model?.tier_source).toBe('override');

    // Untag
    const resUntag = await fetch(`http://127.0.0.1:${testPort}/v1/commands`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${server.bearerToken}`,
      },
      body: JSON.stringify({
        type: 'deleteModelOverride',
        model_id: 'mock-p1/mock-coder-free',
      }),
    });
    expect(resUntag.status).toBe(200);
    const bodyUntag = (await resUntag.json()) as any;
    expect(bodyUntag.success).toBe(true);

    const modelRestored = engine.getModels().find((m) => m.model_id === 'mock-coder-free');
    expect(modelRestored?.tier).toBe('free');
  });
});
