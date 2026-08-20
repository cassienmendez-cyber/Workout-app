import { describe, expect, it } from 'vitest';
import { buildSplit } from '../src/engine/split';

describe('split construction (spec 14-17)', () => {
  it('gives one full-body session for a single training day', () => {
    const split = buildSplit(1);
    expect(split).toHaveLength(1);
    expect(split[0].kind).toBe('full_body');
    expect(split[0].label).toBe('Full Body');
  });

  it('gives complementary A/B full-body sessions for two days', () => {
    const split = buildSplit(2);
    expect(split.map((s) => s.label)).toEqual(['Full Body A', 'Full Body B']);
    // Complementary, not duplicated (spec 15).
    expect(split[0].patterns).not.toEqual(split[1].patterns);
  });

  it('gives three distinct full-body sessions for three days', () => {
    const split = buildSplit(3);
    expect(split.map((s) => s.label)).toEqual(['Full Body A', 'Full Body B', 'Full Body C']);
    const signatures = split.map((s) => s.patterns.join(','));
    expect(new Set(signatures).size).toBe(3);
  });

  it.each([4, 5, 6, 7])('alternates anterior and posterior for %i days', (days) => {
    const split = buildSplit(days);
    expect(split).toHaveLength(days);
    expect(split.every((s) => s.kind === 'anterior' || s.kind === 'posterior')).toBe(true);
    for (let i = 1; i < split.length; i++) {
      expect(split[i].kind, `slot ${i} should alternate`).not.toBe(split[i - 1].kind);
    }
  });

  it('clamps out-of-range frequencies', () => {
    expect(buildSplit(0)).toHaveLength(1);
    expect(buildSplit(99)).toHaveLength(7);
  });
});
