import { describe, expect, it } from 'vitest';
import { PlanGate } from '@flappycode/core';

describe('PlanGate PlanToken Authorization Tests (RULES.md Section 2)', () => {
  it('Issues a valid PlanToken upon plan approval and validates authorized operations', () => {
    const gate = new PlanGate();
    const token = gate.issueToken('run-123', ['src/feature.ts', 'src/feature.test.ts']);

    expect(token.run_id).toBe('run-123');
    expect(token.allowed_files).toEqual(['src/feature.ts', 'src/feature.test.ts']);
    expect(token.issued_at).toBeGreaterThan(0);
    expect(token.expires_at).toBeGreaterThan(token.issued_at);

    // Authorized files validate successfully
    expect(gate.validateOperation('run-123', 'src/feature.ts')).toBe(true);
    expect(gate.validateOperation('run-123', 'src/feature.test.ts')).toBe(true);
  });

  it('Rejects operations for files not authorized in the token', () => {
    const gate = new PlanGate();
    gate.issueToken('run-123', ['src/feature.ts']);

    expect(gate.validateOperation('run-123', 'secrets.json')).toBe(false);
    expect(gate.validateOperation('run-123', 'unauthorized.ts')).toBe(false);
  });

  it('Rejects operations when run_id does not match', () => {
    const gate = new PlanGate();
    gate.issueToken('run-123', ['src/feature.ts']);

    expect(gate.validateOperation('run-999', 'src/feature.ts')).toBe(false);
  });

  it('Revoking a token causes immediate validation failure', () => {
    const gate = new PlanGate();
    gate.issueToken('run-123', ['src/feature.ts']);

    expect(gate.validateOperation('run-123', 'src/feature.ts')).toBe(true);
    gate.revokeToken('run-123');
    expect(gate.validateOperation('run-123', 'src/feature.ts')).toBe(false);
  });

  it('Expired token fails validation and is cleaned up', () => {
    const gate = new PlanGate();
    // Issue token with -1ms TTL (already expired)
    gate.issueToken('run-expired', ['src/feature.ts'], -1);

    expect(gate.validateOperation('run-expired', 'src/feature.ts')).toBe(false);
  });
});
