import { describe, it, expect } from 'vitest';
import { TUI_VERSION } from './index.js';

describe('tui', () => {
  it('exports TUI_VERSION', () => {
    expect(TUI_VERSION).toBe('1.0.0');
  });
});
