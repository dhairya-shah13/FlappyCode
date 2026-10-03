import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlappyEngine } from '../../packages/core/src/engine';
import { MockProviderConnector } from '../../packages/providers/src/mock';

describe('GAP-REM-03: Provider connector lookup by type instead of id', () => {
  let tmpDir: string;
  let engine: FlappyEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-gap-rem-03-'));
    engine = new FlappyEngine({
      projectRoot: tmpDir,
      dbPath: path.join(tmpDir, 'test.db'),
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('registers a provider with a custom id and type mock successfully using MockProviderConnector', async () => {
    const customId = 'my-local-mock';
    const models = await engine.addProvider({
      id: customId,
      type: 'mock',
      display_name: 'My Custom Local Mock',
      enabled: true,
      data_use_policy: 'unknown',
    });

    expect(models.length).toBeGreaterThan(0);
    expect(models[0].provider_id).toBe(customId);

    // Verify connector resolved for this custom provider is the MockProviderConnector
    const connector = engine.registry.getConnector(customId);
    expect(connector).toBeInstanceOf(MockProviderConnector);
  });

  it('registers two providers of the same type with different custom ids and both resolve correctly', async () => {
    const models1 = await engine.addProvider({
      id: 'custom-mock-primary',
      type: 'mock',
      display_name: 'Mock Primary',
      enabled: true,
      data_use_policy: 'unknown',
    });

    const models2 = await engine.addProvider({
      id: 'custom-mock-secondary',
      type: 'mock',
      display_name: 'Mock Secondary',
      enabled: true,
      data_use_policy: 'unknown',
    });

    expect(models1.length).toBeGreaterThan(0);
    expect(models2.length).toBeGreaterThan(0);

    const conn1 = engine.registry.getConnector('custom-mock-primary');
    const conn2 = engine.registry.getConnector('custom-mock-secondary');

    expect(conn1).toBeInstanceOf(MockProviderConnector);
    expect(conn2).toBeInstanceOf(MockProviderConnector);
  });

  it('fails with a clear error naming the unknown type and listing supported types when cfg.type is unregistered', async () => {
    await expect(
      engine.addProvider({
        id: 'bad-provider',
        type: 'unregistered-dummy-llm',
        display_name: 'Bad Provider',
        enabled: true,
        data_use_policy: 'unknown',
      })
    ).rejects.toThrowError(/Unknown provider connector 'unregistered-dummy-llm'\. Supported connector types: .*mock/);
  });

  it('stores API keys securely via secretStore without logging or plaintext exposure', async () => {
    const secretKey = 'super-secret-custom-token-xyz123';
    await engine.addProvider(
      {
        id: 'secure-custom-mock',
        type: 'mock',
        display_name: 'Secure Mock',
        enabled: true,
        data_use_policy: 'unknown',
      },
      secretKey
    );

    // Verify secret was stored in secretStore
    const resolved = await engine.secretStore.getSecret('secure-custom-mock');
    expect(resolved).toBe(secretKey);

    // Verify SecretGuard redacts this secret
    expect(engine.secretGuard.redact(`Authorization: Bearer ${secretKey}`)).toBe(
      'Authorization: Bearer [REDACTED_SECRET]'
    );
  });
});
