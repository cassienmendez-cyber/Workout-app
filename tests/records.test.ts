import { describe, expect, it } from 'vitest';
import {
  computePRs,
  consistency,
  countPRMilestones,
  evaluateAchievements,
  prsFromWorkout,
} from '../src/engine/records';
import { setsPerMuscle, totalTonnage, muscleDeficit } from '../src/engine/volume';
import { assessFatigue, consecutiveTrainingDays } from '../src/engine/fatigue';
import { regenerateSchedule } from '../src/engine/scheduling';
import { completeWorkout, testUser, MONDAY } from './helpers';
import type { Workout } from '../src/domain/types';

function scheduleFor(days = 3, count = 6): Workout[] {
  const user = testUser({ daysPerWeek: days });
  return regenerateSchedule({ user, existing: [], from: MONDAY, count });
}

describe('personal records (spec 57)', () => {
  it('detects a PR the first time an exercise beats its previous best', () => {
    const [first, second] = scheduleFor();
    const w1 = completeWorkout(first, { date: MONDAY, load: () => 100 });
    // Same exercises, heavier load.
    const w2 = completeWorkout(
      { ...second, exercises: first.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) })) },
      { date: '2026-03-04', load: () => 120 },
    );
    const prs = prsFromWorkout(w2, [w1, w2]);
    expect(prs.length).toBeGreaterThan(0);
    expect(prs[0].previousLoad).toBe(100);
    expect(prs[0].load).toBe(120);
    expect(prs[0].improvement).toBeGreaterThan(0);
  });

  it('does not report a PR when performance did not improve', () => {
    const [first, second] = scheduleFor();
    const w1 = completeWorkout(first, { date: MONDAY, load: () => 100 });
    const w2 = completeWorkout(
      { ...second, exercises: first.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) })) },
      { date: '2026-03-04', load: () => 90 },
    );
    expect(prsFromWorkout(w2, [w1, w2])).toHaveLength(0);
  });

  it('treats the first loaded session as a baseline, not a PR milestone', () => {
    const w1 = completeWorkout(scheduleFor()[0], { date: MONDAY, load: () => 100 });
    expect(countPRMilestones([w1])).toBe(0);
  });

  it('excludes unloaded bodyweight work from strength PRs', () => {
    const w1 = completeWorkout(scheduleFor()[0], { date: MONDAY, load: () => 0 });
    expect(computePRs([w1]).size).toBe(0);
  });

  it('recalculates PRs when historical data is edited (spec 50, 52)', () => {
    const [first] = scheduleFor();
    const original = completeWorkout(first, { date: MONDAY, load: () => 100 });
    const before = computePRs([original]);
    const exerciseId = original.exercises[0].exerciseId;
    expect(before.get(exerciseId)?.load).toBe(100);

    // The user corrects a mistyped weight.
    const edited: Workout = {
      ...original,
      edited: true,
      exercises: original.exercises.map((we, i) =>
        i === 0
          ? { ...we, sets: we.sets.map((s) => ({ ...s, actualLoad: 145 })) }
          : we,
      ),
    };
    const after = computePRs([edited]);
    expect(after.get(exerciseId)?.load).toBe(145);
    expect(after.get(exerciseId)?.estimatedOneRepMax).toBeGreaterThan(
      before.get(exerciseId)!.estimatedOneRepMax,
    );
  });

  it('drops a PR when the edit removes the qualifying set', () => {
    const [first] = scheduleFor();
    const original = completeWorkout(first, { date: MONDAY, load: () => 200 });
    const exerciseId = original.exercises[0].exerciseId;

    const edited: Workout = {
      ...original,
      edited: true,
      exercises: original.exercises.map((we, i) =>
        i === 0 ? { ...we, sets: we.sets.map((s) => ({ ...s, completed: false })) } : we,
      ),
    };
    expect(computePRs([edited]).has(exerciseId)).toBe(false);
  });
});

describe('consistency metric (spec 59)', () => {
  it('reports adherence as completed over planned', () => {
    const scheduled = scheduleFor(3, 4);
    const workouts: Workout[] = [
      completeWorkout(scheduled[0], { date: MONDAY }),
      completeWorkout(scheduled[1], { date: '2026-03-04' }),
      { ...scheduled[2], status: 'skipped' },
      completeWorkout(scheduled[3], { date: '2026-03-09' }),
    ];
    const stats = consistency(workouts);
    expect(stats.plannedRecent).toBe(4);
    expect(stats.completedRecent).toBe(3);
    expect(stats.adherence).toBe(75);
  });

  it('counts a rescheduled-then-completed workout as completed (spec 43)', () => {
    const scheduled = scheduleFor(3, 2);
    const moved: Workout = { ...scheduled[0], status: 'rescheduled', actualDate: '2026-03-05' };
    const done = completeWorkout(moved, { date: '2026-03-05' });
    const stats = consistency([done]);
    expect(stats.adherence).toBe(100);
  });

  it('is 100% with no history rather than 0%', () => {
    expect(consistency([]).adherence).toBe(100);
  });
});

describe('achievements (spec 58)', () => {
  it('awards the first workout', () => {
    const done = completeWorkout(scheduleFor()[0], { date: MONDAY });
    const earned = evaluateAchievements([done], [], MONDAY);
    expect(earned.map((a) => a.type)).toContain('first_workout');
  });

  it('does not award the same achievement twice', () => {
    const done = completeWorkout(scheduleFor()[0], { date: MONDAY });
    const first = evaluateAchievements([done], [], MONDAY);
    const second = evaluateAchievements([done], first, MONDAY);
    expect(second).toHaveLength(0);
  });

  it('rewards a comeback after a skipped session', () => {
    const scheduled = scheduleFor(3, 4);
    const workouts: Workout[] = [
      completeWorkout(scheduled[0], { date: MONDAY }),
      { ...scheduled[1], status: 'skipped', plannedDate: '2026-03-04' },
      completeWorkout(scheduled[2], { date: '2026-03-06' }),
    ];
    const earned = evaluateAchievements(workouts, [], '2026-03-06');
    expect(earned.map((a) => a.type)).toContain('comeback');
  });
});

describe('volume and coverage (spec 60, 62)', () => {
  it('counts hard sets per muscle, with secondaries at half weight', () => {
    const done = completeWorkout(scheduleFor()[0], { date: MONDAY });
    const volume = setsPerMuscle([done]);
    const total = Object.values(volume).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeGreaterThan(0);
  });

  it('ignores workouts that were not completed', () => {
    const scheduled = scheduleFor()[0];
    expect(Object.keys(setsPerMuscle([scheduled]))).toHaveLength(0);
  });

  it('computes tonnage from load times reps', () => {
    const done = completeWorkout(scheduleFor()[0], { date: MONDAY, load: () => 100, reps: () => 10 });
    const setCount = done.exercises.reduce((t, e) => t + e.sets.length, 0);
    expect(totalTonnage(done)).toBe(setCount * 1000);
  });

  it('reports a deficit for muscles the week has not trained', () => {
    const deficit = muscleDeficit([]);
    expect(deficit.chest).toBe(1);
    expect(deficit.quads).toBe(1);
  });
});

describe('adaptive fatigue (spec 63)', () => {
  it('reports no fatigue with no history', () => {
    expect(assessFatigue([], MONDAY).index).toBe(0);
  });

  it('counts consecutive training days', () => {
    const scheduled = scheduleFor(7, 4);
    const workouts = [
      completeWorkout(scheduled[0], { date: '2026-03-02' }),
      completeWorkout(scheduled[1], { date: '2026-03-03' }),
      completeWorkout(scheduled[2], { date: '2026-03-04' }),
    ];
    expect(consecutiveTrainingDays(workouts, '2026-03-05')).toBe(3);
  });

  it('raises the fatigue index after repeated very hard sessions', () => {
    const scheduled = scheduleFor(7, 6);
    const workouts = scheduled.map((w, i) =>
      completeWorkout(w, {
        date: `2026-03-0${i + 2}`,
        difficulty: 'too_difficult',
      }),
    );
    const assessment = assessFatigue(workouts, '2026-03-08');
    expect(assessment.index).toBeGreaterThan(0.5);
    expect(assessment.reasons.length).toBeGreaterThan(0);
  });

  it('lowers the fatigue index after a rest gap', () => {
    const scheduled = scheduleFor(3, 3);
    const workouts = scheduled.map((w, i) =>
      completeWorkout(w, { date: `2026-03-0${i + 2}`, difficulty: 'difficult' }),
    );
    const tired = assessFatigue(workouts, '2026-03-05');
    const rested = assessFatigue(workouts, '2026-03-12');
    expect(rested.index).toBeLessThan(tired.index);
  });

  it('reduces prescribed volume when fatigue is high', () => {
    const user = testUser({ daysPerWeek: 7, availableDays: [0, 1, 2, 3, 4, 5, 6] });
    const scheduled = regenerateSchedule({ user, existing: [], from: '2026-03-02', count: 6 });
    const hardHistory = scheduled.map((w, i) =>
      completeWorkout(w, { date: `2026-03-0${i + 2}`, difficulty: 'too_difficult' }),
    );

    const fresh = regenerateSchedule({ user, existing: [], from: '2026-03-09', count: 1 }).filter(
      (w) => w.status === 'scheduled',
    )[0];
    const fatigued = regenerateSchedule({
      user,
      existing: hardHistory,
      from: '2026-03-08',
      count: 1,
    }).filter((w) => w.status === 'scheduled')[0];

    const setsOf = (w: Workout): number => w.exercises.reduce((t, e) => t + e.targetSets, 0);
    expect(setsOf(fatigued)).toBeLessThan(setsOf(fresh));
  });
});
