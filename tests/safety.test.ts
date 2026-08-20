import { describe, expect, it } from 'vitest';
import { checkEligibility, eligibleExercises, expandEquipment } from '../src/engine/safety';
import { substitute, substitutionCandidates } from '../src/engine/substitution';
import { EXERCISES, getExercise } from '../src/data/exercises';
import { generateWorkout } from '../src/engine/generator';
import { buildSplit } from '../src/engine/split';
import { testUser, withProfile, MONDAY } from './helpers';
import { activeProfile } from '../src/engine/safety';
import type { MovementLimitation } from '../src/domain/types';

describe('equipment availability', () => {
  it('treats adjustable dumbbells as satisfying dumbbell requirements', () => {
    const expanded = expandEquipment(['adjustable_dumbbell']);
    expect(expanded.has('dumbbell')).toBe(true);
  });

  it('always includes bodyweight', () => {
    expect(expandEquipment([]).has('bodyweight')).toBe(true);
  });

  it('requires every item in `requires` (AND semantics)', () => {
    const user = testUser();
    const profile = { id: 'x', name: 'Bar only', equipment: ['barbell' as const], loadIncrement: 5 };
    // Bench press needs barbell AND bench.
    expect(checkEligibility(getExercise('barbell_bench_press'), user, profile).allowed).toBe(false);
  });

  it('accepts any single item in `anyOf` (OR semantics)', () => {
    const user = testUser();
    const kettlebellOnly = { id: 'x', name: 'KB', equipment: ['kettlebell' as const], loadIncrement: 4 };
    expect(checkEligibility(getExercise('goblet_squat'), user, kettlebellOnly).allowed).toBe(true);
  });
});

describe('movement limitations (spec 35, 36)', () => {
  const user = testUser();
  const profile = activeProfile(user);

  it('excludes exercises the user asked to avoid', () => {
    const restricted = testUser({
      limitations: [{ tag: 'overhead', level: 'avoid' } satisfies MovementLimitation],
    });
    const overhead = getExercise('overhead_press');
    expect(checkEligibility(overhead, restricted, profile).allowed).toBe(false);
  });

  it('treats clinician restrictions as absolute and flags them as such', () => {
    const restricted = testUser({
      limitations: [{ tag: 'squatting', level: 'clinician', note: 'Post-op' }],
    });
    const result = checkEligibility(getExercise('back_squat'), restricted, profile);
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.clinician).toBe(true);
  });

  it('allows but flags movements marked "modify"', () => {
    const restricted = testUser({ limitations: [{ tag: 'overhead', level: 'modify' }] });
    const result = checkEligibility(getExercise('overhead_press'), restricted, profile);
    expect(result.allowed).toBe(true);
    expect(result.allowed === true && result.modified).toBe(true);
  });

  it('holds back exercises above the user experience level', () => {
    const beginner = testUser({ experience: 'beginner' });
    expect(checkEligibility(getExercise('nordic_curl'), beginner, profile).allowed).toBe(false);
    const advanced = testUser({ experience: 'advanced' });
    expect(checkEligibility(getExercise('nordic_curl'), advanced, profile).allowed).toBe(true);
  });

  it('never generates a restricted movement into a workout', () => {
    const restricted = testUser({
      daysPerWeek: 4,
      limitations: [
        { tag: 'squatting', level: 'clinician' },
        { tag: 'overhead', level: 'avoid' },
      ],
    });
    for (const slot of buildSplit(4)) {
      const workout = generateWorkout({ user: restricted, slot, date: MONDAY, history: [] });
      for (const we of workout.exercises) {
        const exercise = getExercise(we.exerciseId);
        expect(exercise.restrictionTags, exercise.name).not.toContain('squatting');
        expect(exercise.restrictionTags, exercise.name).not.toContain('overhead');
      }
      // The session is still a real workout, not an empty one.
      expect(workout.exercises.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('still produces a full workout for a heavily restricted user', () => {
    const restricted = testUser({
      experience: 'beginner',
      limitations: [
        { tag: 'squatting', level: 'clinician' },
        { tag: 'lunging', level: 'avoid' },
        { tag: 'impact', level: 'avoid' },
        { tag: 'jumping', level: 'avoid' },
        { tag: 'overhead', level: 'clinician' },
      ],
    });
    const eligible = eligibleExercises(EXERCISES, restricted, activeProfile(restricted));
    expect(eligible.length).toBeGreaterThan(15);
    const workout = generateWorkout({
      user: restricted,
      slot: buildSplit(3)[0],
      date: MONDAY,
      history: [],
    });
    expect(workout.exercises.length).toBeGreaterThanOrEqual(4);
  });
});

describe('substitution engine (spec 37, 38)', () => {
  it('prefers a substitute in the same movement pattern', () => {
    const user = testUser();
    const result = substitute('back_squat', user, activeProfile(user));
    expect(result).not.toBeNull();
    expect(result?.exercise.pattern).toBe('squat');
    expect(result?.exercise.id).not.toBe('back_squat');
  });

  it('never returns a restricted movement as a substitute', () => {
    const restricted = testUser({ limitations: [{ tag: 'squatting', level: 'clinician' }] });
    const candidates = substitutionCandidates(
      getExercise('back_squat'),
      restricted,
      activeProfile(restricted),
    );
    for (const candidate of candidates) {
      expect(candidate.restrictionTags).not.toContain('squatting');
    }
  });

  it('finds an equipment-compatible substitute for a travel profile', () => {
    const user = withProfile(testUser(), 'Travel');
    const result = substitute('barbell_bench_press', user, activeProfile(user));
    expect(result).not.toBeNull();
    const allowed = new Set(['bodyweight', 'bands']);
    for (const req of result?.exercise.requires ?? []) {
      expect(allowed.has(req)).toBe(true);
    }
  });

  it('explains why the swap happened, without diagnosing anything', () => {
    const restricted = testUser({ limitations: [{ tag: 'squatting', level: 'clinician' }] });
    const result = substitute('back_squat', restricted, activeProfile(restricted), {
      trigger: 'restriction',
    });
    expect(result?.reason).toMatch(/clinician/i);
    expect(result?.reason).not.toMatch(/injur(y|ies)\b.*(is|are) (fine|safe|harmless)/i);
  });

  it('excludes exercises already in the session', () => {
    const user = testUser();
    const result = substitute('back_squat', user, activeProfile(user), {
      exclude: ['goblet_squat', 'leg_press'],
    });
    expect(['goblet_squat', 'leg_press']).not.toContain(result?.exercise.id);
  });
});

describe('exercise preferences (spec 13, 64)', () => {
  it('avoids exercises the user hates when an alternative exists', () => {
    const base = testUser({ daysPerWeek: 3 });
    const plain = generateWorkout({ user: base, slot: buildSplit(3)[0], date: MONDAY, history: [] });
    const hatedId = plain.exercises[0].exerciseId;

    const picky = testUser({
      daysPerWeek: 3,
      exercisePreferences: { [hatedId]: 'hate' },
    });
    const adjusted = generateWorkout({
      user: picky,
      slot: buildSplit(3)[0],
      date: MONDAY,
      history: [],
    });
    expect(adjusted.exercises.map((e) => e.exerciseId)).not.toContain(hatedId);
  });

  it('never lets a preference override a required movement pattern', () => {
    // Hating everything must still yield a full, safe workout.
    const preferences: Record<string, 'hate'> = {};
    for (const exercise of EXERCISES) preferences[exercise.id] = 'hate';
    const picky = testUser({ exercisePreferences: preferences });
    const workout = generateWorkout({
      user: picky,
      slot: buildSplit(3)[0],
      date: MONDAY,
      history: [],
    });
    expect(workout.exercises.length).toBeGreaterThanOrEqual(4);
  });
});
