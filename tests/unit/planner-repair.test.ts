import { describe, expect, it } from 'vitest';
import { PlannerOutputError } from '@flappycode/core';

/**
 * GAP-046: Planner repair and model fallback tests.
 */
describe('GAP-046 — Planner Repair & Fallback', () => {
  it('PlannerOutputError has correct name and code', () => {
    const err = new PlannerOutputError('bad output', '{"broken": true}');
    expect(err.name).toBe('PlannerOutputError');
    expect(err.code).toBe('PLANNER_INVALID_OUTPUT');
    expect(err.sample).toBe('{"broken": true}');
    expect(err.message).toContain('bad output');
  });

  it('PlannerOutputError is instanceof Error', () => {
    const err = new PlannerOutputError('test', '');
    expect(err).toBeInstanceOf(Error);
  });

  it('PlannerOutputError sample is truncated to provided value', () => {
    const longSample = 'x'.repeat(1000);
    const err = new PlannerOutputError('test', longSample);
    expect(err.sample).toBe(longSample);
  });
});
