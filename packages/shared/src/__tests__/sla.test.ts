import { describe, expect, it } from 'vitest';
import { PRIORITIES, SLA_RESPONSE_MS, isSlaBreached, msUntilBreach, slaDeadline } from '../index.js';

const HOUR = 60 * 60 * 1000;
const base = new Date('2026-01-01T00:00:00.000Z');

describe('SLA windows', () => {
  it('matches the documented response targets', () => {
    expect(SLA_RESPONSE_MS.URGENT).toBe(1 * HOUR);
    expect(SLA_RESPONSE_MS.HIGH).toBe(4 * HOUR);
    expect(SLA_RESPONSE_MS.MEDIUM).toBe(24 * HOUR);
    expect(SLA_RESPONSE_MS.LOW).toBe(72 * HOUR);
  });

  it('shrinks the window monotonically as priority rises (LOW -> URGENT)', () => {
    const ordered = [...PRIORITIES].map((p) => SLA_RESPONSE_MS[p]);
    expect(ordered).toEqual([...ordered].sort((a, b) => b - a));
    expect(new Set(ordered).size).toBe(PRIORITIES.length);
  });

  it('computes a deadline relative to creation', () => {
    expect(slaDeadline(base, 'URGENT').toISOString()).toBe('2026-01-01T01:00:00.000Z');
  });
});

describe('isSlaBreached', () => {
  it('does not breach before the deadline with no response', () => {
    const now = new Date(base.getTime() + 30 * 60 * 1000);
    expect(isSlaBreached({ createdAt: base, priority: 'URGENT', firstResponseAt: null, now })).toBe(
      false,
    );
  });

  it('breaches after the deadline with no response', () => {
    const now = new Date(base.getTime() + 2 * HOUR);
    expect(isSlaBreached({ createdAt: base, priority: 'URGENT', firstResponseAt: null, now })).toBe(
      true,
    );
  });

  it('does not breach when the agent answered in time, however late it is now', () => {
    const firstResponseAt = new Date(base.getTime() + 45 * 60 * 1000);
    const now = new Date(base.getTime() + 500 * HOUR);
    expect(
      isSlaBreached({ createdAt: base, priority: 'URGENT', firstResponseAt, now }),
    ).toBe(false);
  });

  it('breaches when the agent answered after the deadline', () => {
    const firstResponseAt = new Date(base.getTime() + 90 * 60 * 1000);
    expect(
      isSlaBreached({ createdAt: base, priority: 'URGENT', firstResponseAt, now: firstResponseAt }),
    ).toBe(true);
  });

  it('treats the exact deadline instant as not yet breached', () => {
    const now = slaDeadline(base, 'HIGH');
    expect(isSlaBreached({ createdAt: base, priority: 'HIGH', firstResponseAt: null, now })).toBe(
      false,
    );
  });
});

describe('msUntilBreach', () => {
  it('is positive before and negative after the deadline', () => {
    expect(msUntilBreach(base, 'HIGH', new Date(base.getTime() + HOUR))).toBe(3 * HOUR);
    expect(msUntilBreach(base, 'HIGH', new Date(base.getTime() + 5 * HOUR))).toBe(-1 * HOUR);
  });
});
