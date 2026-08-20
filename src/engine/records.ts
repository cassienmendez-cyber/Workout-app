import type {
  Achievement,
  AchievementType,
  PersonalRecord,
  Workout,
} from '../domain/types';
import { findExercise } from '../data/exercises';
import { estimatedOneRepMax } from './progression';
import { daysBetween } from '../lib/dates';
import { uid } from '../lib/uid';

/**
 * Personal records, achievements and consistency (spec 57–59).
 *
 * Every figure here is derived from the workout log rather than stored, so
 * editing historical data automatically corrects PRs, graphs and stats
 * (spec 50, 52, 61).
 */

/** Best estimated 1RM per exercise across all completed work. */
export function computePRs(workouts: Workout[]): Map<string, PersonalRecord> {
  const best = new Map<string, PersonalRecord>();
  const completed = workouts
    .filter((w) => w.status === 'completed')
    .sort((a, b) => (a.actualDate ?? a.plannedDate).localeCompare(b.actualDate ?? b.plannedDate));

  for (const workout of completed) {
    for (const we of workout.exercises) {
      for (const set of we.sets) {
        if (!set.completed || set.actualReps === null) continue;
        const load = set.actualLoad ?? 0;
        const reps = set.actualReps;
        // Bodyweight and timed work have no load to rank, so they are excluded
        // from strength PRs rather than compared against loaded movements.
        if (load <= 0) continue;
        const e1rm = estimatedOneRepMax(load, reps);
        const current = best.get(we.exerciseId);
        if (!current || e1rm > current.estimatedOneRepMax) {
          best.set(we.exerciseId, {
            exerciseId: we.exerciseId,
            estimatedOneRepMax: e1rm,
            load,
            reps,
            date: workout.actualDate ?? workout.plannedDate,
            workoutId: workout.id,
          });
        }
      }
    }
  }
  return best;
}

export interface PRResult {
  exerciseId: string;
  exerciseName: string;
  load: number;
  reps: number;
  previousLoad: number | null;
  previousReps: number | null;
  improvement: number;
}

/**
 * PRs set *by* a specific workout: compare that session's best sets against
 * the best of everything that came before it.
 */
export function prsFromWorkout(workout: Workout, allWorkouts: Workout[]): PRResult[] {
  const workoutDate = workout.actualDate ?? workout.plannedDate;
  const priorWorkouts = allWorkouts.filter((w) => {
    if (w.id === workout.id) return false;
    if (w.status !== 'completed') return false;
    const d = w.actualDate ?? w.plannedDate;
    return d < workoutDate || (d === workoutDate && w.id < workout.id);
  });
  const priorBest = computePRs(priorWorkouts);

  const results: PRResult[] = [];
  for (const we of workout.exercises) {
    let bestSet: { load: number; reps: number; e1rm: number } | null = null;
    for (const set of we.sets) {
      if (!set.completed || set.actualReps === null) continue;
      const load = set.actualLoad ?? 0;
      if (load <= 0) continue;
      const e1rm = estimatedOneRepMax(load, set.actualReps);
      if (!bestSet || e1rm > bestSet.e1rm) bestSet = { load, reps: set.actualReps, e1rm };
    }
    if (!bestSet) continue;

    const previous = priorBest.get(we.exerciseId);
    if (previous && bestSet.e1rm <= previous.estimatedOneRepMax) continue;

    const exercise = findExercise(we.exerciseId);
    results.push({
      exerciseId: we.exerciseId,
      exerciseName: exercise?.name ?? we.exerciseId,
      load: bestSet.load,
      reps: bestSet.reps,
      previousLoad: previous?.load ?? null,
      previousReps: previous?.reps ?? null,
      improvement: previous
        ? Math.round((bestSet.e1rm - previous.estimatedOneRepMax) * 10) / 10
        : bestSet.e1rm,
    });
  }
  return results;
}

/* --------------------------------------------------------- consistency --- */

export interface ConsistencyStats {
  /** Completed ÷ planned, as a percentage. */
  adherence: number;
  completedRecent: number;
  plannedRecent: number;
  totalCompleted: number;
  window: number;
}

/**
 * Schedule adherence (spec 59). Rescheduled sessions that were completed count
 * as completed — moving a workout is not a failure (spec 43).
 */
export function consistency(workouts: Workout[], window = 25): ConsistencyStats {
  const resolved = workouts
    .filter((w) => w.status === 'completed' || w.status === 'skipped')
    .sort((a, b) => (a.actualDate ?? a.plannedDate).localeCompare(b.actualDate ?? b.plannedDate));

  const recent = resolved.slice(-window);
  const completedRecent = recent.filter((w) => w.status === 'completed').length;
  const plannedRecent = recent.length;
  const totalCompleted = workouts.filter((w) => w.status === 'completed').length;

  return {
    adherence: plannedRecent > 0 ? Math.round((completedRecent / plannedRecent) * 100) : 100,
    completedRecent,
    plannedRecent,
    totalCompleted,
    window,
  };
}

/* -------------------------------------------------------- achievements --- */

export const ACHIEVEMENT_META: Record<AchievementType, { title: string; description: string; icon: string }> = {
  first_workout: { title: 'First Workout', description: 'You showed up and did the work.', icon: '🎯' },
  workouts_10: { title: '10 Workouts', description: 'Ten sessions in the bank.', icon: '💪' },
  workouts_25: { title: '25 Workouts', description: 'This is a habit now.', icon: '🔥' },
  workouts_50: { title: '50 Workouts', description: 'Fifty sessions completed.', icon: '⭐' },
  workouts_100: { title: '100 Workouts', description: 'Triple digits.', icon: '🏆' },
  first_pr: { title: 'First PR', description: 'Your first personal record.', icon: '📈' },
  prs_5: { title: '5 PRs', description: 'Five personal records set.', icon: '🚀' },
  prs_10: { title: '10 PRs', description: 'Ten personal records set.', icon: '👑' },
  consistency: { title: 'Consistency', description: '90%+ schedule adherence over your last 10 sessions.', icon: '📅' },
  comeback: { title: 'Comeback', description: 'You came back after a missed session. That is the whole game.', icon: '🌅' },
};

/**
 * Achievements newly earned as of the given workout list.
 * Comeback rewards returning after a gap rather than punishing the gap itself.
 */
export function evaluateAchievements(
  workouts: Workout[],
  existing: Achievement[],
  date: string,
): Achievement[] {
  const earned = new Set(existing.map((a) => a.type));
  const fresh: Achievement[] = [];
  const award = (type: AchievementType): void => {
    if (earned.has(type)) return;
    earned.add(type);
    fresh.push({ id: uid('ach'), type, earnedDate: date });
  };

  const completed = workouts
    .filter((w) => w.status === 'completed')
    .sort((a, b) => (a.actualDate ?? a.plannedDate).localeCompare(b.actualDate ?? b.plannedDate));

  if (completed.length >= 1) award('first_workout');
  if (completed.length >= 10) award('workouts_10');
  if (completed.length >= 25) award('workouts_25');
  if (completed.length >= 50) award('workouts_50');
  if (completed.length >= 100) award('workouts_100');

  const prCount = countPRMilestones(completed);
  if (prCount >= 1) award('first_pr');
  if (prCount >= 5) award('prs_5');
  if (prCount >= 10) award('prs_10');

  const stats = consistency(workouts, 10);
  if (stats.plannedRecent >= 10 && stats.adherence >= 90) award('consistency');

  // Comeback: a completed session following a skipped one or a 10+ day gap.
  if (completed.length >= 2) {
    const last = completed[completed.length - 1];
    const previous = completed[completed.length - 2];
    const gap = daysBetween(previous.actualDate ?? previous.plannedDate, last.actualDate ?? last.plannedDate);
    const skippedBefore = workouts.some(
      (w) =>
        w.status === 'skipped' &&
        w.plannedDate < (last.actualDate ?? last.plannedDate) &&
        w.plannedDate > (previous.actualDate ?? previous.plannedDate),
    );
    if (gap >= 10 || skippedBefore) award('comeback');
  }

  return fresh;
}

/** Total number of distinct PR events across the whole history. */
export function countPRMilestones(workouts: Workout[]): number {
  const completed = workouts
    .filter((w) => w.status === 'completed')
    .sort((a, b) => (a.actualDate ?? a.plannedDate).localeCompare(b.actualDate ?? b.plannedDate));

  const best = new Map<string, number>();
  let count = 0;
  for (const workout of completed) {
    for (const we of workout.exercises) {
      for (const set of we.sets) {
        if (!set.completed || set.actualReps === null) continue;
        const load = set.actualLoad ?? 0;
        if (load <= 0) continue;
        const e1rm = estimatedOneRepMax(load, set.actualReps);
        const current = best.get(we.exerciseId);
        if (current === undefined) {
          // The first time an exercise is logged establishes a baseline
          // rather than counting as a record.
          best.set(we.exerciseId, e1rm);
        } else if (e1rm > current) {
          best.set(we.exerciseId, e1rm);
          count++;
        }
      }
    }
  }
  return count;
}
