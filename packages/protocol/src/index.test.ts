import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSION } from './index.js';

describe('protocol', () => {
  it('exports PROTOCOL_VERSION', () => {
    expect(PROTOCOL_VERSION).toBe('1.0.0');
  });
});
