import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadConfig,
  getConfigValue,
  setConfigValue,
  resolveEnvRef,
  maskSecrets,
  writeConfigFile,
  DeterministicRouter,
  ModelRegistry,
  FlappyEventBus,
} from '@flappycode/core';
import { ProviderRepository, ModelRepository, HybridSecretStore } from '@flappycode/storage';
import { FlappyDatabase } from '@flappycode/storage';

describe('Configuration System & Routing Policies (GAP-033)', () => {
  let tmpDir: string;
  let userConfigFile: string;
  let projectConfigFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flappy-config-test-'));
    userConfigFile = path.join(tmpDir, 'user-config.json');
    projectConfigFile = path.join(tmpDir, 'project-config.json');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('adheres to strict precedence: CLI > Project > User > Defaults', () => {
    // 1. User config specifies revalidate_every_hours = 12
    writeConfigFile(userConfigFile, {
      version: 1,
      providers: [],
      model_policy: {
        default_tier: 'free',
        allow_paid_models: false,
        revalidate_every_hours: 12,
        privacy_mode: 'standard',
      },
      agents: [],
      permissions: { shell_allow: [], shell_deny: [], shell_ask: [] },
      sandbox: { mode: 'host', timeout_ms: 60000, output_max_bytes: 200000 },
      git: { protected_branches: ['main', 'master'] },
    });

    // 2. Project config overrides revalidate_every_hours = 8
    writeConfigFile(projectConfigFile, {
      version: 1,
      providers: [],
      model_policy: {
        default_tier: 'free',
        allow_paid_models: false,
        revalidate_every_hours: 8,
        privacy_mode: 'standard',
      },
      agents: [],
      permissions: { shell_allow: [], shell_deny: [], shell_ask: [] },
      sandbox: { mode: 'host', timeout_ms: 60000, output_max_bytes: 200000 },
      git: { protected_branches: ['main', 'master'] },
    });

    // Without CLI override: project config wins over user config
    const loadedProj = loadConfig({
      projectRoot: tmpDir,
      userPath: userConfigFile,
      projectPath: projectConfigFile,
    });
    expect(loadedProj.config.model_policy.revalidate_every_hours).toBe(8);

    // 3. CLI override revalidate_every_hours = 2: CLI wins over project config
    const loadedCli = loadConfig({
      projectRoot: tmpDir,
      userPath: userConfigFile,
      projectPath: projectConfigFile,
      cliOverrides: {
        model_policy: {
          revalidate_every_hours: 2,
        },
      },
    });
    expect(loadedCli.config.model_policy.revalidate_every_hours).toBe(2);
  });

  it('rejects invalid configuration schema with clear diagnostics', () => {
    // Write invalid model_policy.default_tier ('invalid_tier')
    fs.writeFileSync(
      projectConfigFile,
      JSON.stringify({
        model_policy: { default_tier: 'super_premium_tier' },
      }),
      'utf8'
    );

    expect(() =>
      loadConfig({
        projectRoot: tmpDir,
        userPath: userConfigFile,
        projectPath: projectConfigFile,
      })
    ).toThrow(/Configuration validation failed/);
  });

  it('resolves env:NAME references correctly', () => {
    process.env['TEST_SECRET_KEY'] = 'sk-live-123456789';
    try {
      expect(resolveEnvRef('env:TEST_SECRET_KEY')).toBe('sk-live-123456789');
      expect(resolveEnvRef('literal_value')).toBe('literal_value');
      expect(resolveEnvRef('env:NON_EXISTENT_VAR')).toBeUndefined();
    } finally {
      delete process.env['TEST_SECRET_KEY'];
    }
  });

  it('getConfigValue and setConfigValue handle nested dot-paths safely', () => {
    const config = loadConfig({ projectRoot: tmpDir }).config;

    const tier = getConfigValue(config, 'model_policy.default_tier');
    expect(tier).toBe('free');

    const updated = setConfigValue(config, 'model_policy.allow_paid_models', true);
    expect(updated.model_policy.allow_paid_models).toBe(true);

    // Cannot set invalid schema property
    expect(() => setConfigValue(config, 'sandbox.timeout_ms', -100)).toThrow();
  });

  it('maskSecrets masks sensitive keys in output', () => {
    const raw = {
      name: 'test',
      api_key: 'sk-abcdef123456',
      auth_token: 'secret_token_value',
      safe_param: 'public',
      nested: {
        password: 'supersecretpassword',
      },
    };

    const masked = maskSecrets(raw);
    expect(masked.safe_param).toBe('public');
    expect(masked.api_key).toContain('***');
    expect(masked.api_key).not.toBe('sk-abcdef123456');
    expect(masked.auth_token).toContain('***');
    expect(masked.nested.password).toContain('***');
  });

  it('DeterministicRouter interprets auto:* policies consistently without error', () => {
    const db = new FlappyDatabase({ path: path.join(tmpDir, 'router.db') });
    const bus = new FlappyEventBus();
    const provRepo = new ProviderRepository(db.db);
    const modelRepo = new ModelRepository(db.db);
    const secretStore = new HybridSecretStore(path.join(tmpDir, 'secrets.enc'));
    const registry = new ModelRegistry(provRepo, modelRepo, secretStore, bus);

    provRepo.save({ id: 'p1', type: 'mock', display_name: 'P1', enabled: true, data_use_policy: 'no_training' });
    modelRepo.saveModel({
      provider_id: 'p1',
      model_id: 'fast-model',
      tier: 'free',
      tier_source: 'metadata',
      context_length: 16000,
      modality: 'text->text',
      supports_tools: true,
      supports_vision: false,
      tool_probe_passed: true,
      data_use_policy: 'no_training',
      is_local: true,
      is_pinned: false,
      price_in: 0,
      price_out: 0,
      avg_latency_ms: 50,
      last_validated_at: Date.now(),
    });

    modelRepo.saveModel({
      provider_id: 'p1',
      model_id: 'slow-model',
      tier: 'free',
      tier_source: 'metadata',
      context_length: 32000,
      modality: 'text->text',
      supports_tools: true,
      supports_vision: false,
      tool_probe_passed: true,
      data_use_policy: 'no_training',
      is_local: true,
      is_pinned: false,
      price_in: 0,
      price_out: 0,
      avg_latency_ms: 2000,
      last_validated_at: Date.now(),
    });

    const router = new DeterministicRouter(registry, bus);

    // auto:free-fast should select the fast model
    const resFast = router.select({ taskType: 'coding', minContext: 8000 }, undefined, 'auto:free-fast');
    expect('selected' in resFast).toBe(true);
    if ('selected' in resFast) {
      expect(resFast.selected.model_id).toBe('fast-model');
    }

    // flappyauto and auto:best-fit-free should select best fit without throwing unpinned error
    const resAuto = router.select({ taskType: 'coding', minContext: 8000 }, undefined, 'auto:best-fit-free');
    expect('selected' in resAuto).toBe(true);

    db.close();
  });
});
