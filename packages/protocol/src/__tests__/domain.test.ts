import { describe, it, expect } from 'vitest';
import {
  TierSchema,
  FREE_TIERS,
  ModelSchema,
  ProviderConfigSchema,
  AgentDefinitionSchema,
  TaskNodeSchema,
  ConfigSchema,
} from '../domain.js';

describe('TierSchema', () => {
  it('accepts valid tiers', () => {
    expect(TierSchema.parse('free')).toBe('free');
    expect(TierSchema.parse('rate_limited_free')).toBe('rate_limited_free');
    expect(TierSchema.parse('paid')).toBe('paid');
    expect(TierSchema.parse('disabled')).toBe('disabled');
    expect(TierSchema.parse('unavailable')).toBe('unavailable');
  });

  it('rejects invalid tiers', () => {
    expect(() => TierSchema.parse('cheap')).toThrow();
    expect(() => TierSchema.parse('')).toThrow();
  });

  it('correctly defines FREE_TIERS set', () => {
    expect(FREE_TIERS.has('free')).toBe(true);
    expect(FREE_TIERS.has('rate_limited_free')).toBe(true);
    expect(FREE_TIERS.has('paid')).toBe(false);
  });
});

describe('ModelSchema', () => {
  it('validates valid model definitions', () => {
    const valid = {
      id: 'openrouter/qwen-2.5-coder',
      providerId: 'openrouter',
      name: 'Qwen 2.5 Coder',
      tier: 'free',
      contextLength: 32768,
      supportsTools: true,
      pricing: { in: 0, out: 0 },
    };
    const parsed = ModelSchema.parse(valid);
    expect(parsed.id).toBe('openrouter/qwen-2.5-coder');
    expect(parsed.contextLength).toBe(32768);
    expect(parsed.supportsTools).toBe(true);
  });

  it('rejects invalid model definitions', () => {
    expect(() => ModelSchema.parse({ id: '', providerId: 'openrouter', tier: 'free' })).toThrow();
    expect(() => ModelSchema.parse({ id: 'm1', providerId: 'openrouter', tier: 'invalid' })).toThrow();
  });
});

describe('ProviderConfigSchema', () => {
  it('validates provider config with defaults', () => {
    const config = {
      id: 'groq',
      type: 'openai-compatible',
      displayName: 'Groq Cloud',
      baseUrl: 'https://api.groq.com/openai/v1',
    };
    const parsed = ProviderConfigSchema.parse(config);
    expect(parsed.enabled).toBe(true);
    expect(parsed.maxConcurrency).toBe(4);
    expect(parsed.dataUsePolicy).toBe('unknown');
  });

  it('rejects invalid baseUrl', () => {
    expect(() =>
      ProviderConfigSchema.parse({
        id: 'groq',
        type: 'openai-compatible',
        displayName: 'Groq',
        baseUrl: 'not-a-url',
      }),
    ).toThrow();
  });
});

describe('AgentDefinitionSchema', () => {
  it('validates agent definition', () => {
    const agent = {
      name: 'coder',
      description: 'Generates precision code edits',
      allowedTools: ['fs_read', 'fs_write'],
      model: 'flappyauto',
      fallbackPolicy: 'ask_user',
    };
    const parsed = AgentDefinitionSchema.parse(agent);
    expect(parsed.name).toBe('coder');
    expect(parsed.allowedTools).toHaveLength(2);
  });

  it('rejects missing fields', () => {
    expect(() => AgentDefinitionSchema.parse({ name: 'coder' })).toThrow();
  });
});

describe('TaskNodeSchema', () => {
  it('validates task node with defaults', () => {
    const node = {
      id: 'node-1',
      agent: 'file-finder',
      description: 'Search for failing tests',
    };
    const parsed = TaskNodeSchema.parse(node);
    expect(parsed.status).toBe('pending');
    expect(parsed.dependsOn).toEqual([]);
  });
});

describe('ConfigSchema', () => {
  it('validates default config shape', () => {
    const parsed = ConfigSchema.parse({});
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.modelPolicy.preferFree).toBe(true);
    expect(parsed.sandbox.mode).toBe('host');
  });
});
