import type { Muscle, Workout } from '../domain/types';
import { findExercise } from '../data/exercises';

/**
 * Muscle coverage and weekly volume tracking (spec 62).
 *
 * Volume is counted in hard sets. A muscle worked as a secondary mover counts
 * for half a set, which is a coarse but stable way to keep the balance honest
 * without pretending to more precision than the data supports.
 */

export type MuscleVolume = Partial<Record<Muscle, number>>;

export function setsPerMuscle(workouts: Workout[]): MuscleVolume {
  const totals: MuscleVolume = {};
  for (const workout of workouts) {
    if (workout.status !== 'completed') continue;
    for (const we of workout.exercises) {
      const exercise = findExercise(we.exerciseId);
      if (!exercise) continue;
      const completedSets = we.sets.filter((s) => s.completed).length;
      if (completedSets === 0) continue;
      for (const m of exercise.primaryMuscles) {
        totals[m] = (totals[m] ?? 0) + completedSets;
      }
      for (const m of exercise.secondaryMuscles) {
        totals[m] = (totals[m] ?? 0) + completedSets * 0.5;
      }
    }
  }
  return totals;
}

/** Total tonnage (load × reps) across completed sets, for the volume graph. */
export function totalTonnage(workout: Workout): number {
  let total = 0;
  for (const we of workout.exercises) {
    for (const set of we.sets) {
      if (!set.completed) continue;
      const load = set.actualLoad ?? 0;
      const reps = set.actualReps ?? 0;
      total += load * reps;
    }
  }
  return Math.round(total);
}

/**
 * Weekly set targets used to spot under-trained muscles. These are coarse
 * planning defaults, not prescriptive minimums.
 */
const WEEKLY_TARGET: Record<Muscle, number> = {
  quads: 10,
  glutes: 10,
  hamstrings: 8,
  calves: 6,
  adductors: 4,
  abductors: 4,
  chest: 10,
  front_delts: 6,
  side_delts: 6,
  rear_delts: 6,
  lats: 10,
  mid_back: 10,
  traps: 4,
  biceps: 6,
  triceps: 6,
  forearms: 4,
  abs: 6,
  obliques: 4,
  lower_back: 4,
  hip_flexors: 2,
};

/**
 * How far each muscle is below its weekly target, normalised 0–1.
 * The generator uses this to bias selection toward what the week is missing.
 */
export function muscleDeficit(weekWorkouts: Workout[]): MuscleVolume {
  const done = setsPerMuscle(weekWorkouts);
  const deficit: MuscleVolume = {};
  for (const key of Object.keys(WEEKLY_TARGET) as Muscle[]) {
    const target = WEEKLY_TARGET[key];
    const actual = done[key] ?? 0;
    const gap = Math.max(0, target - actual) / target;
    if (gap > 0) deficit[key] = Math.round(gap * 100) / 100;
  }
  return deficit;
}

/** 0–1 coverage per muscle for the user-facing weekly display. */
export function coverageRatio(weekWorkouts: Workout[]): MuscleVolume {
  const done = setsPerMuscle(weekWorkouts);
  const ratio: MuscleVolume = {};
  for (const key of Object.keys(WEEKLY_TARGET) as Muscle[]) {
    ratio[key] = Math.min(1, (done[key] ?? 0) / WEEKLY_TARGET[key]);
  }
  return ratio;
}

export { WEEKLY_TARGET };
