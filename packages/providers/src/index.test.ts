import { describe, it, expect } from 'vitest';
import { PROVIDERS_VERSION } from './index.js';

describe('providers', () => {
  it('exports PROVIDERS_VERSION', () => {
    expect(PROVIDERS_VERSION).toBe('1.0.0');
  });
});
