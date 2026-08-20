import { describe, expect, it } from 'vitest';
import { EXERCISES, findExercise } from '../src/data/exercises';
import {
  CORE_PATTERNS,
  LOWER_PATTERNS,
  UPPER_PATTERNS,
  type MovementPattern,
} from '../src/domain/types';

describe('exercise database integrity', () => {
  it('has unique ids', () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only references substitutions that exist', () => {
    const missing: string[] = [];
    for (const exercise of EXERCISES) {
      for (const sub of exercise.substitutions) {
        if (!findExercise(sub)) missing.push(`${exercise.id} -> ${sub}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('never lists itself as a substitution', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.substitutions).not.toContain(exercise.id);
    }
  });

  it('covers every movement pattern in the spec', () => {
    const all: MovementPattern[] = [...LOWER_PATTERNS, ...UPPER_PATTERNS, ...CORE_PATTERNS];
    for (const pattern of all) {
      const matches = EXERCISES.filter((e) => e.pattern === pattern);
      expect(matches.length, `no exercises for pattern ${pattern}`).toBeGreaterThan(0);
    }
  });

  it('gives every exercise a usable rep range and at least one primary muscle', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.repRange.max, exercise.id).toBeGreaterThan(exercise.repRange.min);
      expect(exercise.primaryMuscles.length, exercise.id).toBeGreaterThan(0);
      expect(exercise.fatigueRating).toBeGreaterThanOrEqual(1);
      expect(exercise.fatigueRating).toBeLessThanOrEqual(5);
    }
  });

  it('offers a bodyweight-only option for the major patterns', () => {
    const bodyweightOnly = EXERCISES.filter(
      (e) =>
        e.requires.every((r) => r === 'bodyweight') &&
        (e.anyOf.length === 0 || e.anyOf.includes('bodyweight')),
    );
    const patterns = new Set(bodyweightOnly.map((e) => e.pattern));
    for (const pattern of ['squat', 'horizontal_push', 'hip_extension', 'anti_extension'] as const) {
      expect(patterns.has(pattern), `no bodyweight option for ${pattern}`).toBe(true);
    }
  });
});
