import type {
  Difficulty,
  UserProfile,
  Weekday,
  Workout,
} from '../src/domain/types';
import { makeDefaultUser } from '../src/data/defaults';
import { generateWorkout } from '../src/engine/generator';
import { buildSplit } from '../src/engine/split';

export function testUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return makeDefaultUser({
    name: 'Test',
    onboardingComplete: true,
    experience: 'intermediate',
    ...overrides,
  });
}

/** Use a specific named equipment profile. */
export function withProfile(user: UserProfile, name: string): UserProfile {
  const profile = user.equipmentProfiles.find((p) => p.name === name);
  if (!profile) throw new Error(`No profile named ${name}`);
  return { ...user, activeProfileId: profile.id };
}

export function makeWorkout(user: UserProfile, date: string, cycleIndex = 0, history: Workout[] = []): Workout {
  const split = buildSplit(user.daysPerWeek);
  return generateWorkout({
    user,
    slot: split[cycleIndex % split.length],
    date,
    history,
  });
}

/**
 * Simulate performing a workout: fill in every set at the prescribed target
 * and attach the given difficulty rating to each exercise.
 */
export function completeWorkout(
  workout: Workout,
  options: {
    date?: string;
    difficulty?: Difficulty;
    /** Reps to log per set; defaults to the top of the target range. */
    reps?: (targetMin: number, targetMax: number) => number;
    /** Load to log; defaults to the prescribed load or a nominal 100. */
    load?: (prescribed: number | null) => number;
  } = {},
): Workout {
  const date = options.date ?? workout.plannedDate;
  const difficulty: Difficulty = options.difficulty ?? 'just_right';
  const repsFor = options.reps ?? ((_min: number, max: number) => max);
  const loadFor = options.load ?? ((prescribed: number | null) => prescribed ?? 100);

  return {
    ...workout,
    status: 'completed',
    actualDate: date,
    completedAt: `${date}T12:00:00.000Z`,
    durationSeconds: workout.estimatedMinutes * 60,
    exercises: workout.exercises.map((we) => ({
      ...we,
      sets: we.sets.map((s) => ({
        ...s,
        actualReps: repsFor(we.targetRepRange.min, we.targetRepRange.max),
        actualLoad: loadFor(we.targetLoad),
        completed: true,
        timestamp: `${date}T12:00:00.000Z`,
      })),
      feedback: { difficulty },
    })),
  };
}

export const MONDAY = '2026-03-02';
export const WEEKDAYS: Record<string, Weekday> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};
