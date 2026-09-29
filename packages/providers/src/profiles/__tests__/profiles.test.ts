import { describe, expect, it } from 'vitest';
import {
  generateProvidersMarkdownTable,
  getNeedsHumanVerificationList,
  loadAllProfiles,
  loadProfile,
  ProviderProfileSchema,
} from '../index.js';

describe('Provider Profiles & Verification Matrix', () => {
  it('loads and validates all 10 day-one provider profiles', () => {
    const profiles = loadAllProfiles();
    expect(profiles.length).toBe(10);

    const expectedIds = [
      'anthropic',
      'google_ai_studio',
      'groq',
      'kilocode',
      'lm_studio',
      'ollama_cloud',
      'ollama_local',
      'openai',
      'openrouter',
      'together',
    ];

    for (const id of expectedIds) {
      const p = profiles.find((prof) => prof.id === id);
      expect(p, `Profile ${id} must exist`).toBeDefined();
      expect(() => ProviderProfileSchema.parse(p)).not.toThrow();
    }
  });

  it('validates Groq provider properties and zero-training policy', () => {
    const groq = loadProfile('groq');
    expect(groq).not.toBeNull();
    expect(groq?.type).toBe('openai_compatible');
    expect(groq?.authScheme).toBe('bearer');
    expect(groq?.dataUsePolicy.trainsOnData).toBe('no');
    expect(groq?.supportsToolCalls).toBe(true);
    expect(groq?.discovery.supported).toBe(true);
  });

  it('validates Google AI Studio transparent data-use policy', () => {
    const google = loadProfile('google_ai_studio');
    expect(google).not.toBeNull();
    expect(google?.dataUsePolicy.trainsOnData).toBe('yes');
    expect(google?.envKeyName).toBe('GEMINI_API_KEY');
  });

  it('validates local offline providers (LM Studio & Ollama)', () => {
    const lm = loadProfile('lm_studio');
    const ollama = loadProfile('ollama_local');

    expect(lm?.authScheme).toBe('none');
    expect(lm?.baseUrl).toContain('localhost');
    expect(lm?.dataUsePolicy.trainsOnData).toBe('no');

    expect(ollama?.authScheme).toBe('none');
    expect(ollama?.baseUrl).toContain('localhost');
  });

  it('flags unverified providers in NEEDS_HUMAN_VERIFICATION', () => {
    const unverified = getNeedsHumanVerificationList();
    expect(unverified.map((u) => u.id)).toContain('kilocode');
  });

  it('generates markdown comparison table matching documentation', () => {
    const md = generateProvidersMarkdownTable();
    expect(md).toContain('| Provider | Type |');
    expect(md).toContain('GroqCloud');
    expect(md).toContain('Google AI Studio');
    expect(md).toContain('NEEDS_HUMAN_VERIFICATION');
  });
});
