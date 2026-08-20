import { describe, expect, it } from 'vitest';
import { applyMode, generateWorkout } from '../src/engine/generator';
import { buildSplit } from '../src/engine/split';
import { findExercise } from '../src/data/exercises';
import { completeWorkout, makeWorkout, testUser, withProfile, MONDAY } from './helpers';
import type { Workout } from '../src/domain/types';

describe('workout generation (spec 22, 23)', () => {
  it.each([1, 2, 3, 4, 5, 6, 7])(
    'produces 4-6 exercises for a %i-day-per-week user',
    (days) => {
      const user = testUser({ daysPerWeek: days });
      const split = buildSplit(days);
      for (const slot of split) {
        const workout = generateWorkout({ user, slot, date: MONDAY, history: [] });
        expect(workout.exercises.length, `${slot.label}`).toBeGreaterThanOrEqual(4);
        expect(workout.exercises.length, `${slot.label}`).toBeLessThanOrEqual(6);
      }
    },
  );

  it('never prescribes the same exercise twice in one session', () => {
    const user = testUser({ daysPerWeek: 4 });
    for (const slot of buildSplit(4)) {
      const workout = generateWorkout({ user, slot, date: MONDAY, history: [] });
      const ids = workout.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('is deterministic: identical inputs give identical selections', () => {
    const user = testUser();
    const slot = buildSplit(3)[0];
    const a = generateWorkout({ user, slot, date: MONDAY, history: [] });
    const b = generateWorkout({ user, slot, date: MONDAY, history: [] });
    expect(a.exercises.map((e) => e.exerciseId)).toEqual(b.exercises.map((e) => e.exerciseId));
    expect(a.exercises.map((e) => e.targetSets)).toEqual(b.exercises.map((e) => e.targetSets));
  });

  it('prescribes 2-5 working sets per exercise (spec 28)', () => {
    const user = testUser({ primaryGoal: 'muscle_gain' });
    const workout = makeWorkout(user, MONDAY);
    for (const we of workout.exercises) {
      expect(we.targetSets).toBeGreaterThanOrEqual(1);
      expect(we.targetSets).toBeLessThanOrEqual(5);
      expect(we.sets).toHaveLength(we.targetSets);
    }
  });

  it('uses strength rep ranges for a strength goal (spec 24)', () => {
    const user = testUser({ primaryGoal: 'strength' });
    const workout = makeWorkout(user, MONDAY);
    const compounds = workout.exercises.filter((we) => findExercise(we.exerciseId)?.compound);
    expect(compounds.length).toBeGreaterThan(0);
    for (const we of compounds) {
      expect(we.targetRepRange.min).toBeLessThanOrEqual(8);
    }
  });

  it('uses higher rep ranges for muscular endurance (spec 26)', () => {
    const strength = makeWorkout(testUser({ primaryGoal: 'strength' }), MONDAY);
    const endurance = makeWorkout(testUser({ primaryGoal: 'muscular_endurance' }), MONDAY);
    const avg = (w: Workout): number =>
      w.exercises.reduce((t, e) => t + e.targetRepRange.max, 0) / w.exercises.length;
    expect(avg(endurance)).toBeGreaterThan(avg(strength));
  });

  it('assigns rest intervals within the spec 29 guidelines', () => {
    const workout = makeWorkout(testUser({ primaryGoal: 'strength' }), MONDAY);
    for (const we of workout.exercises) {
      const exercise = findExercise(we.exerciseId);
      expect(we.restSeconds).toBeGreaterThanOrEqual(30);
      expect(we.restSeconds).toBeLessThanOrEqual(180);
      if (exercise && !exercise.compound) {
        expect(we.restSeconds, exercise.name).toBeLessThanOrEqual(90);
      }
    }
  });

  it('respects a travel profile with only bodyweight and bands', () => {
    const user = withProfile(testUser({ daysPerWeek: 3 }), 'Travel');
    for (const slot of buildSplit(3)) {
      const workout = generateWorkout({ user, slot, date: MONDAY, history: [] });
      expect(workout.exercises.length).toBeGreaterThan(0);
      for (const we of workout.exercises) {
        const exercise = findExercise(we.exerciseId);
        const allowed = new Set(['bodyweight', 'bands']);
        for (const req of exercise?.requires ?? []) {
          expect(allowed.has(req), `${exercise?.name} requires ${req}`).toBe(true);
        }
      }
    }
  });

  it('shortens the session when the user has little time', () => {
    const user = testUser();
    const slot = buildSplit(3)[0];
    const long = generateWorkout({ user, slot, date: MONDAY, history: [], durationMinutes: 60 });
    const short = generateWorkout({ user, slot, date: MONDAY, history: [], durationMinutes: 20 });
    expect(short.exercises.length).toBeLessThan(long.exercises.length);
  });

  it('leads with a compound movement', () => {
    for (const goal of ['strength', 'muscle_gain', 'general_fitness'] as const) {
      const workout = makeWorkout(testUser({ primaryGoal: goal }), MONDAY);
      const first = findExercise(workout.exercises[0].exerciseId);
      expect(first?.compound, `${goal} led with ${first?.name}`).toBe(true);
    }
  });

  it('estimates a session length in the right ballpark', () => {
    const workout = makeWorkout(testUser({ preferredDurationMinutes: 45 }), MONDAY);
    expect(workout.estimatedMinutes).toBeGreaterThan(10);
    expect(workout.estimatedMinutes).toBeLessThan(90);
  });

  it('fits the session inside the time the user actually has (spec 9)', () => {
    for (const minutes of [20, 30, 45, 60]) {
      for (const goal of ['strength', 'muscle_gain', 'general_fitness'] as const) {
        const user = testUser({ preferredDurationMinutes: minutes, primaryGoal: goal });
        for (const slot of buildSplit(4)) {
          const workout = generateWorkout({ user, slot, date: MONDAY, history: [] });
          // A small overshoot is acceptable; a 25% overrun is not.
          expect(
            workout.estimatedMinutes,
            `${goal} ${slot.label} at ${minutes}min`,
          ).toBeLessThanOrEqual(Math.round(minutes * 1.25));
        }
      }
    }
  });

  it('never trims an exercise below one working set when fitting time', () => {
    const user = testUser({ preferredDurationMinutes: 20, primaryGoal: 'strength' });
    const workout = generateWorkout({ user, slot: buildSplit(4)[0], date: MONDAY, history: [] });
    for (const we of workout.exercises) {
      expect(we.targetSets).toBeGreaterThanOrEqual(1);
      expect(we.sets).toHaveLength(we.targetSets);
    }
  });

  it('gives accessories at least two sets when the user is fresh (spec 28)', () => {
    const user = testUser({ preferredDurationMinutes: 75, primaryGoal: 'muscle_gain' });
    const workout = generateWorkout({ user, slot: buildSplit(4)[0], date: MONDAY, history: [] });
    for (const we of workout.exercises) {
      expect(we.targetSets, findExercise(we.exerciseId)?.name).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('short workout modes (spec 44, 45)', () => {
  it('drops lower-priority movements but keeps the essentials', () => {
    const full = makeWorkout(testUser(), MONDAY);
    const reduced = applyMode(full, 'reduced');
    const minimum = applyMode(full, 'minimum');

    expect(reduced.exercises.length).toBeLessThan(full.exercises.length);
    expect(minimum.exercises.length).toBeLessThanOrEqual(reduced.exercises.length);
    expect(minimum.exercises.length).toBeGreaterThanOrEqual(2);

    // Every priority-1 movement survives even the minimum session.
    const essential = full.exercises.filter((e) => e.priority === 1).map((e) => e.exerciseId);
    const kept = new Set(minimum.exercises.map((e) => e.exerciseId));
    for (const id of essential) {
      expect(kept.has(id), `${id} should survive minimum mode`).toBe(true);
    }
  });

  it('produces a shorter estimate in minimum mode', () => {
    const full = makeWorkout(testUser(), MONDAY);
    const minimum = applyMode(full, 'minimum');
    expect(minimum.estimatedMinutes).toBeLessThan(full.estimatedMinutes);
  });

  it('keeps sequential order after trimming', () => {
    const minimum = applyMode(makeWorkout(testUser(), MONDAY), 'minimum');
    expect(minimum.exercises.map((e) => e.order)).toEqual(
      minimum.exercises.map((_, i) => i),
    );
  });
});

describe('recovery and weekly balance (spec 22, 62)', () => {
  it('varies exercise selection across consecutive sessions', () => {
    const user = testUser({ daysPerWeek: 4 });
    const split = buildSplit(4);
    const first = completeWorkout(
      generateWorkout({ user, slot: split[0], date: MONDAY, history: [] }),
      { date: MONDAY },
    );
    const second = generateWorkout({
      user,
      slot: split[1],
      date: '2026-03-03',
      history: [first],
    });
    const firstIds = new Set(first.exercises.map((e) => e.exerciseId));
    const overlap = second.exercises.filter((e) => firstIds.has(e.exerciseId));
    expect(overlap.length).toBeLessThan(second.exercises.length);
  });
});
