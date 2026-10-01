import { DataUsePolicy } from '@flappycode/protocol';

export interface ProviderProfile {
  id: string;
  type: string;
  displayName: string;
  defaultBaseUrl: string;
  discoveryPath: string;
  authHeaderPrefix: string;
  defaultDataUsePolicy: DataUsePolicy;
  isLocal: boolean;
  rateLimitRpm?: number;
  freeClassifierRule?: (modelId: string, raw: any) => boolean;
}

export const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
  openrouter: {
    id: 'openrouter',
    type: 'openai-compatible',
    displayName: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    discoveryPath: '/models',
    authHeaderPrefix: 'Bearer',
    defaultDataUsePolicy: 'trains_on_prompts', // many free models train
    isLocal: false,
    rateLimitRpm: 20,
    freeClassifierRule: (id, raw) => {
      if (id.endsWith(':free')) return true;
      if (raw?.pricing) {
        const prompt = parseFloat(raw.pricing.prompt || '0');
        const completion = parseFloat(raw.pricing.completion || '0');
        return prompt === 0 && completion === 0;
      }
      return false;
    },
  },
  groq: {
    id: 'groq',
    type: 'openai-compatible',
    displayName: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    discoveryPath: '/models',
    authHeaderPrefix: 'Bearer',
    defaultDataUsePolicy: 'no_training',
    isLocal: false,
    rateLimitRpm: 30,
    freeClassifierRule: (id) => {
      // Groq provides a generous free tier for all developer inference language models.
      // Audio transcription models (whisper) and safety guardrails are excluded.
      const lower = id.toLowerCase();
      if (lower.startsWith('whisper') || lower.includes('prompt-guard') || lower.includes('safeguard')) {
        return false;
      }
      return true;
    },
  },
  together: {
    id: 'together',
    type: 'openai-compatible',
    displayName: 'Together AI',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    discoveryPath: '/models',
    authHeaderPrefix: 'Bearer',
    defaultDataUsePolicy: 'no_training',
    isLocal: false,
    rateLimitRpm: 60,
  },
  fireworks: {
    id: 'fireworks',
    type: 'openai-compatible',
    displayName: 'Fireworks AI',
    defaultBaseUrl: 'https://api.fireworks.ai/inference/v1',
    discoveryPath: '/models',
    authHeaderPrefix: 'Bearer',
    defaultDataUsePolicy: 'no_training',
    isLocal: false,
  },
  kilocode: {
    id: 'kilocode',
    type: 'openai-compatible',
    displayName: 'Kilocode',
    defaultBaseUrl: 'https://api.kilocode.com/v1',
    discoveryPath: '/models',
    authHeaderPrefix: 'Bearer',
    defaultDataUsePolicy: 'no_training',
    isLocal: false,
  },
  'lm-studio': {
    id: 'lm-studio',
    type: 'openai-compatible',
    displayName: 'LM Studio',
    defaultBaseUrl: 'http://localhost:1234/v1',
    discoveryPath: '/models',
    authHeaderPrefix: 'Bearer',
    defaultDataUsePolicy: 'no_training',
    isLocal: true,
    freeClassifierRule: () => true, // Local models are free by definition
  },
  'llama-cpp': {
    id: 'llama-cpp',
    type: 'openai-compatible',
    displayName: 'llama.cpp',
    defaultBaseUrl: 'http://localhost:8080/v1',
    discoveryPath: '/models',
    authHeaderPrefix: 'Bearer',
    defaultDataUsePolicy: 'no_training',
    isLocal: true,
    freeClassifierRule: () => true, // Local models are free by definition
  },
  openai: {
    id: 'openai',
    type: 'openai-compatible',
    displayName: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    discoveryPath: '/models',
    authHeaderPrefix: 'Bearer',
    defaultDataUsePolicy: 'no_training',
    isLocal: false,
  },
  anthropic: {
    id: 'anthropic',
    type: 'anthropic',
    displayName: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    discoveryPath: '/models',
    authHeaderPrefix: 'x-api-key',
    defaultDataUsePolicy: 'no_training',
    isLocal: false,
  },
  google: {
    id: 'google',
    type: 'google',
    displayName: 'Google AI Studio',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    discoveryPath: '/models',
    authHeaderPrefix: 'x-goog-api-key',
    defaultDataUsePolicy: 'trains_on_prompts',
    isLocal: false,
    freeClassifierRule: (id) => {
      // Gemini models on Google AI Studio have free rate-limited tiers
      return id.includes('gemini-1.5-flash') || id.includes('gemini-2.0-flash') || id.includes('gemini-1.5-pro');
    },
  },
  ollama: {
    id: 'ollama',
    type: 'ollama',
    displayName: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434',
    discoveryPath: '/api/tags',
    authHeaderPrefix: 'Bearer',
    defaultDataUsePolicy: 'no_training',
    isLocal: true,
    freeClassifierRule: () => true, // Local models are free by definition
  },
  mock: {
    id: 'mock',
    type: 'mock',
    displayName: 'Mock Provider',
    defaultBaseUrl: 'http://localhost/mock',
    discoveryPath: '/models',
    authHeaderPrefix: 'Bearer',
    defaultDataUsePolicy: 'no_training',
    isLocal: true,
    freeClassifierRule: (id) => !id.includes('paid'),
  },
};
