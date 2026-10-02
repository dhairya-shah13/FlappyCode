import { describe, expect, it } from 'vitest';
import { ModelClassifier } from '@flappycode/core';
import { RawModel } from '@flappycode/protocol';
import { PROVIDER_PROFILES } from '@flappycode/providers';

describe('ModelClassifier Precedence Tests (FR-MOD-002)', () => {
  const communityCatalog = {
    models: {
      'custom-prov/community-free-model': { tier: 'free' },
      'community-unqualified-free': { tier: 'free' },
    },
  };

  it('Tier Precedence 1: User override wins over everything', () => {
    const classifier = new ModelClassifier(communityCatalog);
    const raw: RawModel = {
      id: 'mock-model-1',
      name: 'Mock Model 1',
      context_length: 8192,
      supports_tools: false,
      supports_vision: false,
      price_in: 0,
      price_out: 0,
    };

    // User override marks it paid despite pricing saying 0
    const res = classifier.classify(
      'openrouter',
      raw,
      { provider_id: 'openrouter', model_id: 'mock-model-1', tier: 'paid', created_at: Date.now() },
      'openrouter'
    );
    expect(res.tier).toBe('paid');
    expect(res.source).toBe('override');
  });

  it('Tier Precedence 2: Community override list wins over metadata and rules', () => {
    const classifier = new ModelClassifier(communityCatalog);
    const raw: RawModel = {
      id: 'community-free-model',
      name: 'Community Model',
      context_length: 8192,
      supports_tools: false,
      supports_vision: false,
      price_in: 0.05, // Pricing says paid
      price_out: 0.1,
    };

    const res = classifier.classify('custom-prov', raw, null, 'openai-compatible');
    expect(res.tier).toBe('free');
    expect(res.source).toBe('community');
  });

  it('Tier Precedence 3: Provider pricing metadata (0 cost)', () => {
    const classifier = new ModelClassifier({});
    const raw: RawModel = {
      id: 'any-provider/free-model',
      name: 'Free Model',
      context_length: 8192,
      supports_tools: false,
      supports_vision: false,
      price_in: 0,
      price_out: 0,
      raw_metadata: { pricing: { prompt: '0', completion: '0' } },
    };

    const res = classifier.classify('some-provider', raw, null, 'openai-compatible');
    expect(res.tier).toBe('free');
    expect(res.source).toBe('metadata');
  });

  it('Tier Precedence 4: Provider-specific rules (Groq free tier models)', () => {
    const classifier = new ModelClassifier({});
    const raw: RawModel = {
      id: 'llama-3.3-70b-versatile',
      name: 'Llama 3.3',
      context_length: 128000,
      supports_tools: true,
      supports_vision: false,
      price_in: 0,
      price_out: 0,
    };

    const res = classifier.classify('groq', raw, null, 'groq');
    expect(res.tier).toBe('rate_limited_free');
    expect(res.source).toBe('rule');
  });

  it('Tier Precedence 4: Local providers are always free (Ollama / LM Studio)', () => {
    const classifier = new ModelClassifier({});
    const raw: RawModel = {
      id: 'deepseek-coder:6.7b',
      name: 'DeepSeek Coder',
      context_length: 16384,
      supports_tools: true,
      supports_vision: false,
      price_in: 0,
      price_out: 0,
    };

    const res = classifier.classify('ollama', raw, null, 'ollama');
    expect(res.tier).toBe('free');
    expect(res.source).toBe('rule');
  });

  it('Tier Precedence 5: Fallback defaults to paid-until-proven', () => {
    const classifier = new ModelClassifier({});
    const raw: RawModel = {
      id: 'unknown-vendor/gpt-5-turbo',
      name: 'GPT 5',
      context_length: 128000,
      supports_tools: true,
      supports_vision: false,
      price_in: 5.0,
      price_out: 15.0,
    };

    const res = classifier.classify('custom-prov', raw, null, 'openai-compatible');
    expect(res.tier).toBe('paid');
    expect(res.source).toBe('metadata');
  });

  it('Tier Precedence 2b: Matches unqualified model ID in community catalog', () => {
    const classifier = new ModelClassifier(communityCatalog);
    const raw: RawModel = {
      id: 'community-unqualified-free',
      name: 'Unqualified Community Model',
      context_length: 8192,
      supports_tools: false,
      supports_vision: false,
      price_in: 1.0,
      price_out: 2.0,
    };

    const res = classifier.classify('other-prov', raw, null, 'openai-compatible');
    expect(res.tier).toBe('free');
    expect(res.source).toBe('community');
  });

  it('updates catalog dynamically using setCommunityCatalog', () => {
    const classifier = new ModelClassifier({});
    classifier.setCommunityCatalog({
      models: {
        'dyn-prov/dyn-model': { tier: 'free' },
      },
    });

    const raw: RawModel = {
      id: 'dyn-model',
      name: 'Dynamic Model',
      context_length: 8192,
      supports_tools: false,
      supports_vision: false,
      price_in: 0,
      price_out: 0,
    };

    const res = classifier.classify('dyn-prov', raw, null, 'openai-compatible');
    expect(res.tier).toBe('free');
    expect(res.source).toBe('community');
  });

  it('classifies local provider model without custom rule as free', () => {
    // Add a temporary local profile without freeClassifierRule to verify fallback
    (PROVIDER_PROFILES as any)['test-local'] = {
      id: 'test-local',
      type: 'openai-compatible',
      displayName: 'Test Local',
      defaultBaseUrl: 'http://localhost:5000',
      discoveryPath: '/models',
      authHeaderPrefix: 'Bearer',
      defaultDataUsePolicy: 'no_training',
      isLocal: true,
    };

    const classifier = new ModelClassifier({});
    const raw: RawModel = {
      id: 'custom-local-model',
      name: 'Local Model',
      context_length: 4096,
      supports_tools: false,
      supports_vision: false,
      price_in: 0,
      price_out: 0,
    };

    const res = classifier.classify('test-local', raw, null);
    expect(res.tier).toBe('free');
    expect(res.source).toBe('rule');

    delete (PROVIDER_PROFILES as any)['test-local'];
  });
});
