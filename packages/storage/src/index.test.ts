import { describe, it, expect } from 'vitest';
import { STORAGE_VERSION } from './index.js';

describe('storage', () => {
  it('exports STORAGE_VERSION', () => {
    expect(STORAGE_VERSION).toBe('1.0.0');
  });
});
