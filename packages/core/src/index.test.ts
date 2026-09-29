import { describe, it, expect } from 'vitest';
import { CORE_VERSION } from './index.js';

describe('core', () => {
  it('exports CORE_VERSION', () => {
    expect(CORE_VERSION).toBe('1.0.0');
  });
});
