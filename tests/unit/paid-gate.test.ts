import { describe, expect, it } from 'vitest';
import { DeterministicRouter, PaidGate } from '@flappycode/core';
import { Model } from '@flappycode/protocol';

describe('PaidGate Zero-Paid Safety & Grant Invariants (FR-ROU-003, FR-ROU-004)', () => {
  it('PaidGate rejects paid model by default when no grant issued', () => {
    const gate = new PaidGate();
    expect(gate.hasGrant('gpt-4o')).toBe(false);
    expect(gate.listGrants()).toHaveLength(0);
  });

  it('PaidGate issues grant with explicit reason and timestamp', () => {
    const gate = new PaidGate();
    const grant = gate.issueGrant('openai', 'gpt-4o', 'pool_exhaustion_authorized');

    expect(grant.provider_id).toBe('openai');
    expect(grant.model_id).toBe('gpt-4o');
    expect(grant.reason).toBe('pool_exhaustion_authorized');
    expect(grant.granted_at).toBeGreaterThan(0);
    expect(gate.hasGrant('gpt-4o')).toBe(true);
  });

  it('PaidGate revokes grants cleanly and can clear all', () => {
    const gate = new PaidGate();
    gate.issueGrant('openai', 'gpt-4o', 'pool_exhaustion_authorized');
    gate.issueGrant('anthropic', 'claude-3-5-sonnet', 'user_pinned');

    expect(gate.listGrants()).toHaveLength(2);
    gate.revokeGrant('gpt-4o');
    expect(gate.hasGrant('gpt-4o')).toBe(false);
    expect(gate.hasGrant('claude-3-5-sonnet')).toBe(true);

    gate.clear();
    expect(gate.listGrants()).toHaveLength(0);
  });

  it('DeterministicRouter strictly excludes paid models without PaidGrant', () => {
    const mockRegistry: any = {
      getModels: () => [
        {
          provider_id: 'openai',
          model_id: 'gpt-4o',
          tier: 'paid',
          context_length: 128000,
          supports_tools: true,
          supports_vision: true,
          tool_probe_passed: true,
        },
      ],
      isAvailable: () => true,
      getLiveState: () => ({ inFlightRequests: 0, recentErrorRate: 0, lastCheckTime: Date.now() }),
    };

    const router = new DeterministicRouter(mockRegistry, { emit: () => {} } as any);

    // Free pool is empty because only paid model is registered, and no grant exists
    const route = router.select({ taskType: 'coding' });
    expect('exhausted' in route).toBe(true);
    if ('exhausted' in route) {
      expect(route.exhausted).toBe(true);
      expect(route.message).toContain('Every free model across your connected providers is currently unavailable');
    }

    // Now issue explicit grant
    router.paidGate.issueGrant('openai', 'gpt-4o', 'pool_exhaustion_authorized');
    const routeAfterGrant = router.select({ taskType: 'coding' });
    expect('selected' in routeAfterGrant).toBe(true);
    if ('selected' in routeAfterGrant) {
      expect(routeAfterGrant.selected.model_id).toBe('gpt-4o');
    }
  });

  it('DeterministicRouter automatically authorizes user-pinned paid model', () => {
    const mockRegistry: any = {
      getModels: () => [
        {
          provider_id: 'anthropic',
          model_id: 'claude-3-5-sonnet',
          tier: 'paid',
          context_length: 200000,
          supports_tools: true,
          supports_vision: true,
          tool_probe_passed: true,
        },
      ],
      isAvailable: () => true,
      getLiveState: () => ({ inFlightRequests: 0, recentErrorRate: 0, lastCheckTime: Date.now() }),
    };

    const router = new DeterministicRouter(mockRegistry, { emit: () => {} } as any);
    const route = router.select({ taskType: 'coding' }, undefined, 'claude-3-5-sonnet');

    expect('selected' in route).toBe(true);
    if ('selected' in route) {
      expect(route.selected.model_id).toBe('claude-3-5-sonnet');
      expect(route.isPinned).toBe(true);
    }
    expect(router.paidGate.hasGrant('claude-3-5-sonnet')).toBe(true);
  });
});
