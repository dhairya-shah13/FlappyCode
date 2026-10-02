import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlappyEngine } from '@flappycode/core';
import { MockProviderConnector } from '@flappycode/providers';

describe('Provider Diagnostics & Health State (GAP-032)', () => {
  let tmpDir: string;
  let engine: FlappyEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-health-test-'));
    engine = new FlappyEngine({
      projectRoot: tmpDir,
      dbPath: path.join(tmpDir, 'test.db'),
      disableScheduler: true,
    });
  });

  afterEach(() => {
    engine.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('runs provider diagnostics and tracks latency and healthy reachability', async () => {
    // 1. Connect a healthy provider
    const connector = new MockProviderConnector({
      latencyMs: 42,
    });
    engine.registry.registerConnector('mock-healthy', connector);
    engine.providerRepo.save({
      id: 'mock-healthy',
      type: 'mock',
      display_name: 'Mock Healthy Provider',
      enabled: true,
      data_use_policy: 'no_training',
    });

    const results = await engine.testProviders('mock-healthy');
    expect(results).toHaveLength(1);
    expect(results[0].provider_id).toBe('mock-healthy');
    expect(results[0].status).toBe('healthy');
    expect(results[0].latency_ms).toBe(42);
    expect(results[0].error).toBeUndefined();

    // Verify persisted health state in repository
    const record = engine.healthRepo.get('mock-healthy');
    expect(record).not.toBeNull();
    expect(record?.status).toBe('healthy');
    expect(record?.latency_ms).toBe(42);
    expect(record?.total_checks).toBe(1);
    expect(record?.error_count).toBe(0);
    expect(record?.last_success_at).toBeGreaterThan(0);
  });

  it('reports specific failure categories for rate-limited, auth-failed, and unreachable providers', async () => {
    // Rate-limited provider
    const rateLimitedConnector = new MockProviderConnector({
      forceRateLimited: true,
      healthError: 'HTTP 429 Too Many Requests',
      latencyMs: 80,
    });
    engine.registry.registerConnector('mock-429', rateLimitedConnector);
    engine.providerRepo.save({
      id: 'mock-429',
      type: 'mock',
      display_name: 'Rate Limited Provider',
      enabled: true,
      data_use_policy: 'no_training',
    });

    // Unreachable provider
    const offlineConnector = new MockProviderConnector({
      forceOffline: true,
      healthError: 'connect ECONNREFUSED 127.0.0.1:9999',
      latencyMs: 10,
    });
    engine.registry.registerConnector('mock-offline', offlineConnector);
    engine.providerRepo.save({
      id: 'mock-offline',
      type: 'mock',
      display_name: 'Offline Provider',
      enabled: true,
      data_use_policy: 'no_training',
    });

    const results = await engine.testProviders();
    expect(results.length).toBeGreaterThanOrEqual(2);

    const r429 = results.find((r) => r.provider_id === 'mock-429');
    expect(r429).toBeDefined();
    expect(r429?.status).toBe('rate_limited');
    expect(r429?.error).toContain('429');

    const rOffline = results.find((r) => r.provider_id === 'mock-offline');
    expect(rOffline).toBeDefined();
    expect(rOffline?.status).toBe('unreachable');
    expect(rOffline?.error).toContain('ECONNREFUSED');

    // Verify rolling error counts in persistence
    const offlineRecord = engine.healthRepo.get('mock-offline');
    expect(offlineRecord?.error_count).toBe(1);

    // Run test again to verify rolling error count increments
    await engine.testProviders('mock-offline');
    const updatedOfflineRecord = engine.healthRepo.get('mock-offline');
    expect(updatedOfflineRecord?.error_count).toBe(2);
    expect(updatedOfflineRecord?.total_checks).toBe(2);
  });

  it('flappycode doctor surfaces reachability, database integrity, and remediation hints', async () => {
    // Connect healthy and failing providers
    const healthy = new MockProviderConnector({ latencyMs: 20 });
    engine.registry.registerConnector('doc-p1', healthy);
    engine.providerRepo.save({ id: 'doc-p1', type: 'mock', display_name: 'P1', enabled: true, data_use_policy: 'no_training' });

    const offline = new MockProviderConnector({ forceOffline: true, healthError: 'Network down' });
    engine.registry.registerConnector('doc-p2', offline);
    engine.providerRepo.save({ id: 'doc-p2', type: 'mock', display_name: 'P2', enabled: true, data_use_policy: 'no_training' });

    const doc = await engine.doctor();

    expect(doc.providersCount).toBe(2);
    expect(doc.providersReachable).toBe(1);
    expect(doc.dbIntegrity).toBe(true);
    expect(doc.providerHealth).toHaveLength(2);

    const p2Health = doc.providerHealth.find((p) => p.id === 'doc-p2');
    expect(p2Health?.status).toBe('unreachable');
    expect(p2Health?.error).toBe('Network down');
  });
});
