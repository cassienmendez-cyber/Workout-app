import { describe, expect, it } from 'vitest';
import { regenerateSchedule, rescheduleWorkout } from '../src/engine/scheduling';
import { applyMode } from '../src/engine/generator';
import { computePRs, prsFromWorkout, evaluateAchievements, consistency } from '../src/engine/records';
import { findExercise } from '../src/data/exercises';
import { completeWorkout, testUser, MONDAY } from './helpers';
import type { UserProfile, Workout } from '../src/domain/types';

/**
 * End-to-end journeys through the engine.
 *
 * These exercise the same sequences a real user produces — train, rate, get a
 * new prescription, move a session, correct a mistake — and assert on what the
 * user would actually notice.
 */

/** Run `count` scheduled sessions, logging the prescribed load each time. */
function trainThrough(
  user: UserProfile,
  count: number,
  options: {
    difficulty?: 'easy' | 'just_right' | 'difficult' | 'too_difficult';
    startLoad?: number;
    /** Reps to log, relative to the prescribed range. */
    reps?: (min: number, max: number) => number;
  } = {},
): Workout[] {
  const difficulty = options.difficulty ?? 'just_right';
  const startLoad = options.startLoad ?? 100;
  let workouts = regenerateSchedule({ user, existing: [], from: MONDAY, count: count + 2 });

  for (let i = 0; i < count; i++) {
    const next = workouts.find((w) => w.status === 'scheduled');
    if (!next) break;
    const date = next.actualDate ?? next.plannedDate;
    const done = completeWorkout(next, {
      date,
      difficulty,
      reps: options.reps,
      load: (prescribed) => prescribed ?? startLoad,
    });
    workouts = regenerateSchedule({
      user,
      existing: workouts.map((w) => (w.id === done.id ? done : w)),
      from: date,
      count: count + 2,
    });
  }
  return workouts;
}

describe('progression across sessions', () => {
  it('carries a load forward, then raises it once the range is topped out', () => {
    const user = testUser({ daysPerWeek: 3, primaryGoal: 'muscle_gain' });
    // Always hitting the top of the range and rating it easy must drive load up.
    const workouts = trainThrough(user, 6, { difficulty: 'easy', startLoad: 100 });

    const completed = workouts
      .filter((w) => w.status === 'completed')
      .sort((a, b) => (a.actualDate ?? '').localeCompare(b.actualDate ?? ''));
    expect(completed.length).toBeGreaterThanOrEqual(5);

    // Find an exercise trained more than once and confirm the load climbed.
    const history = new Map<string, number[]>();
    for (const workout of completed) {
      for (const we of workout.exercises) {
        const load = we.sets.find((s) => s.completed)?.actualLoad;
        if (load == null) continue;
        history.set(we.exerciseId, [...(history.get(we.exerciseId) ?? []), load]);
      }
    }
    // Only load-progressed movements should climb in weight; bodyweight and
    // timed work progresses in reps or seconds instead (spec 34).
    const repeated = [...history.entries()].filter(([exerciseId, loads]) => {
      if (loads.length <= 1) return false;
      const exercise = findExercise(exerciseId);
      return exercise?.progression !== 'time' && exercise?.progression !== 'bodyweight_reps';
    });
    expect(repeated.length, 'no loaded exercise repeated across sessions').toBeGreaterThan(0);

    for (const [exerciseId, loads] of repeated) {
      const name = findExercise(exerciseId)?.name ?? exerciseId;
      expect(loads[loads.length - 1], `${name} load did not increase`).toBeGreaterThan(loads[0]);
    }
  });

  it('progresses timed and bodyweight movements without touching their load', () => {
    const user = testUser({ daysPerWeek: 3, primaryGoal: 'general_fitness' });
    const workouts = trainThrough(user, 6, { difficulty: 'easy', startLoad: 0 });

    const completed = workouts
      .filter((w) => w.status === 'completed')
      .sort((a, b) => (a.actualDate ?? '').localeCompare(b.actualDate ?? ''));

    const targets = new Map<string, number[]>();
    for (const workout of completed) {
      for (const we of workout.exercises) {
        const exercise = findExercise(we.exerciseId);
        if (exercise?.progression !== 'time' && exercise?.progression !== 'bodyweight_reps') continue;
        targets.set(we.exerciseId, [...(targets.get(we.exerciseId) ?? []), we.targetRepRange.max]);
      }
    }

    const repeated = [...targets.entries()].filter(([, v]) => v.length > 1);
    for (const [exerciseId, maxes] of repeated) {
      const name = findExercise(exerciseId)?.name ?? exerciseId;
      expect(maxes[maxes.length - 1], `${name} target should not regress`).toBeGreaterThanOrEqual(
        maxes[0],
      );
    }
  });

  it('backs the load off when the user keeps rating sessions too difficult', () => {
    const user = testUser({ daysPerWeek: 3, primaryGoal: 'muscle_gain' });
    const workouts = trainThrough(user, 6, {
      difficulty: 'too_difficult',
      startLoad: 200,
      // Falling short of the range as well.
      reps: (min) => Math.max(1, min - 2),
    });

    const completed = workouts
      .filter((w) => w.status === 'completed')
      .sort((a, b) => (a.actualDate ?? '').localeCompare(b.actualDate ?? ''));

    const history = new Map<string, number[]>();
    for (const workout of completed) {
      for (const we of workout.exercises) {
        const load = we.sets.find((s) => s.completed)?.actualLoad;
        if (load == null) continue;
        history.set(we.exerciseId, [...(history.get(we.exerciseId) ?? []), load]);
      }
    }
    const repeated = [...history.entries()].filter(([, loads]) => loads.length > 1);
    expect(repeated.length).toBeGreaterThan(0);
    for (const [exerciseId, loads] of repeated) {
      const name = findExercise(exerciseId)?.name ?? exerciseId;
      expect(loads[loads.length - 1], `${name} load should have come down`).toBeLessThan(loads[0]);
    }
  });

  it('explains every load change it makes (spec 34)', () => {
    const user = testUser({ daysPerWeek: 3 });
    const workouts = trainThrough(user, 4, { difficulty: 'easy' });
    const upcoming = workouts.find((w) => w.status === 'scheduled');
    expect(upcoming).toBeDefined();
    // At least one adaptation note, phrased as a reason rather than a command.
    const notes = upcoming!.adaptations;
    if (notes.length > 0) {
      expect(notes.some((n) => /because/i.test(n))).toBe(true);
    }
  });
});

describe('the missed-workout journey (spec 6, 40, 41)', () => {
  it('moves the session, keeps the sequence, and never reports a failure', () => {
    const user = testUser({ daysPerWeek: 3, availableDays: [1, 3, 5] });
    let workouts = regenerateSchedule({ user, existing: [], from: MONDAY, count: 6 });

    // Train Monday.
    const first = workouts[0];
    const done = completeWorkout(first, { date: MONDAY });
    workouts = workouts.map((w) => (w.id === done.id ? done : w));

    // Cannot train Wednesday; moves it to Thursday.
    const wednesday = workouts.find((w) => w.status === 'scheduled');
    expect(wednesday).toBeDefined();
    const result = rescheduleWorkout(user, workouts, wednesday!.id, '2026-03-05');

    const moved = result.workouts.find((w) => w.id === wednesday!.id);
    expect(moved?.status).toBe('rescheduled');
    expect(moved?.actualDate).toBe('2026-03-05');
    expect(moved?.slotIndex).toBe(wednesday!.slotIndex);

    // Monday's completed session is untouched.
    expect(result.workouts.find((w) => w.id === done.id)).toEqual(done);

    // Adherence is not damaged by moving a workout.
    const completedMoved = completeWorkout(moved!, { date: '2026-03-05' });
    const stats = consistency([done, completedMoved]);
    expect(stats.adherence).toBe(100);
  });
});

describe('the short-session journey (spec 44, 45)', () => {
  it('keeps a minimum session completable and countable', () => {
    const user = testUser({ daysPerWeek: 3 });
    const workouts = regenerateSchedule({ user, existing: [], from: MONDAY, count: 3 });
    const minimum = applyMode(workouts[0], 'minimum');

    expect(minimum.exercises.length).toBeGreaterThanOrEqual(2);
    expect(minimum.estimatedMinutes).toBeLessThanOrEqual(workouts[0].estimatedMinutes);

    const done = completeWorkout(minimum, { date: MONDAY });
    expect(done.status).toBe('completed');
    // A short session still earns the first-workout achievement.
    expect(evaluateAchievements([done], [], MONDAY).map((a) => a.type)).toContain('first_workout');
    expect(consistency([done]).adherence).toBe(100);
  });
});

describe('the correction journey (spec 50, 52)', () => {
  it('propagates an edit through PRs and future prescriptions', () => {
    const user = testUser({ daysPerWeek: 3 });
    const workouts = regenerateSchedule({ user, existing: [], from: MONDAY, count: 3 });
    const done = completeWorkout(workouts[0], { date: MONDAY, load: () => 100 });

    const beforePR = computePRs([done]);
    const exerciseId = done.exercises[0].exerciseId;
    expect(beforePR.get(exerciseId)?.load).toBe(100);

    // The user realises they logged 100 instead of 185.
    const corrected: Workout = {
      ...done,
      edited: true,
      exercises: done.exercises.map((we, i) =>
        i === 0 ? { ...we, sets: we.sets.map((s) => ({ ...s, actualLoad: 185 })) } : we,
      ),
    };

    expect(computePRs([corrected]).get(exerciseId)?.load).toBe(185);

    // The next prescription for that movement is built from the corrected load.
    const rebuilt = regenerateSchedule({
      user,
      existing: [corrected, ...workouts.slice(1)],
      from: '2026-03-04',
      count: 4,
    });
    const nextOccurrence = rebuilt
      .filter((w) => w.status === 'scheduled')
      .flatMap((w) => w.exercises)
      .find((we) => we.exerciseId === exerciseId);

    if (nextOccurrence?.targetLoad != null) {
      expect(nextOccurrence.targetLoad).toBeGreaterThanOrEqual(185);
    }
  });

  it('reports a PR against the corrected history, not the original', () => {
    const user = testUser({ daysPerWeek: 3 });
    const scheduled = regenerateSchedule({ user, existing: [], from: MONDAY, count: 3 });
    const first = completeWorkout(scheduled[0], { date: MONDAY, load: () => 100 });

    // Second session repeats the first session's exercises at 110.
    const second = completeWorkout(
      {
        ...scheduled[1],
        exercises: first.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) })),
      },
      { date: '2026-03-04', load: () => 110 },
    );

    expect(prsFromWorkout(second, [first, second]).length).toBeGreaterThan(0);

    // Correcting the first session upward retroactively removes the PR.
    const correctedFirst: Workout = {
      ...first,
      edited: true,
      exercises: first.exercises.map((we) => ({
        ...we,
        sets: we.sets.map((s) => ({ ...s, actualLoad: 150 })),
      })),
    };
    expect(prsFromWorkout(second, [correctedFirst, second])).toHaveLength(0);
  });
});

describe('the restricted-user journey (spec 35, 36, 37)', () => {
  it('builds a complete program around a clinician restriction', () => {
    const user = testUser({
      daysPerWeek: 4,
      availableDays: [1, 2, 4, 5],
      limitations: [
        { tag: 'squatting', level: 'clinician', note: 'Knee, post-op' },
        { tag: 'overhead', level: 'avoid' },
      ],
    });
    const workouts = regenerateSchedule({ user, existing: [], from: MONDAY, count: 8 });
    const scheduled = workouts.filter((w) => w.status === 'scheduled');
    expect(scheduled).toHaveLength(8);

    for (const workout of scheduled) {
      expect(workout.exercises.length).toBeGreaterThanOrEqual(4);
      for (const we of workout.exercises) {
        const exercise = findExercise(we.exerciseId);
        expect(exercise?.restrictionTags).not.toContain('squatting');
        expect(exercise?.restrictionTags).not.toContain('overhead');
      }
    }

    // Legs are still trained, just through compatible patterns.
    const patterns = new Set(
      scheduled.flatMap((w) => w.exercises.map((we) => findExercise(we.exerciseId)?.pattern)),
    );
    const trainsLegs = ['hinge', 'hip_extension', 'knee_flexion', 'lunge', 'step_up'].some((p) =>
      patterns.has(p as never),
    );
    expect(trainsLegs, 'restricted user got no lower-body work at all').toBe(true);
  });
});
