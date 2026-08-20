import type {
  Exercise,
  ExperienceLevel,
  Goal,
  RepRange,
  UserProfile,
  EnergyLevel,
} from '../domain/types';

/**
 * Training prescription (spec 24–29).
 *
 * Ranges are starting points, deliberately flexible rather than universal
 * rep counts. Everything here is configurable data rather than hard-coded
 * truth, per the evidence note at the end of the spec.
 */

/** Starting rep ranges per goal (spec 24–27). */
export const GOAL_REP_RANGES: Record<Goal, RepRange> = {
  strength: { min: 3, max: 6 },
  power: { min: 3, max: 6 },
  muscle_gain: { min: 6, max: 15 },
  recomposition: { min: 6, max: 15 },
  muscle_retention: { min: 6, max: 12 },
  general_fitness: { min: 8, max: 15 },
  fat_loss: { min: 8, max: 15 },
  muscular_endurance: { min: 12, max: 20 },
};

/**
 * Blend the goal's range with the exercise's own suggested range. An exercise
 * that only makes sense at 12–20 reps should not be prescribed at 3–6 just
 * because the user picked "strength".
 */
export function resolveRepRange(exercise: Exercise, goal: Goal): RepRange {
  const goalRange = GOAL_REP_RANGES[goal];
  const own = exercise.repRange;

  // Timed movements keep their own scale (seconds, not reps).
  if (exercise.progression === 'time') return own;

  let min = Math.max(goalRange.min, own.min);
  let max = Math.min(goalRange.max, own.max);

  // Ranges that don't overlap: honour the exercise, nudged toward the goal.
  if (min > max) {
    if (goalRange.max < own.min) {
      // Goal is lighter/lower-rep than the movement allows: sit at the
      // exercise's bottom end rather than prescribing reps it cannot support.
      min = own.min;
      max = own.max;
    } else {
      min = Math.max(own.min, goalRange.min);
      max = own.max;
    }
  }

  // Double progression needs somewhere to progress to, so every prescription
  // keeps at least a 3-rep window (spec 30).
  if (max - min < 3) max = min + 3;
  return { min, max };
}

/**
 * Power work needs moderate load and fast intent — and must not be prescribed
 * where experience, equipment, or limitations make it inappropriate (spec 27).
 */
export function isPowerAppropriate(exercise: Exercise, user: UserProfile): boolean {
  if (user.experience === 'beginner') return false;
  if (!exercise.compound) return false;
  if (exercise.difficulty >= 5) return false;
  return (exercise.goalSuitability.power ?? 5) >= 7;
}

const EXPERIENCE_SET_BIAS: Record<ExperienceLevel, number> = {
  beginner: 0,
  intermediate: 0,
  advanced: 1,
};

export interface SetContext {
  user: UserProfile;
  /** Total working sets this muscle group has already had this week. */
  weeklySetsForPrimary?: number;
  /** 0–1, where 1 means heavily fatigued. Reduces volume (spec 63). */
  fatigueIndex?: number;
  energy?: EnergyLevel | null;
  /** Position in the session; later exercises get fewer sets. */
  orderIndex?: number;
}

/**
 * Working sets per exercise (spec 28). Default 2–3; adjusted for goal,
 * experience, accumulated weekly volume, fatigue and time. Volume is never
 * added merely because the user could tolerate it.
 */
export function resolveSets(exercise: Exercise, ctx: SetContext): number {
  const { user } = ctx;
  let sets = exercise.compound ? 3 : 2;

  if (user.primaryGoal === 'strength' || user.primaryGoal === 'muscle_gain') {
    if (exercise.compound) sets += 1;
  }
  if (user.primaryGoal === 'muscle_retention' || user.primaryGoal === 'fat_loss') {
    // Enough stimulus to retain tissue, without piling on fatigue in a deficit.
    sets = exercise.compound ? 3 : 2;
  }

  sets += EXPERIENCE_SET_BIAS[user.experience];

  // Back off when this muscle group has already had a lot of work this week.
  const weekly = ctx.weeklySetsForPrimary ?? 0;
  if (weekly >= 18) sets -= 2;
  else if (weekly >= 12) sets -= 1;

  // Accumulated fatigue trims volume before it trims load (spec 63).
  const fatigue = ctx.fatigueIndex ?? 0;
  if (fatigue >= 0.7) sets -= 2;
  else if (fatigue >= 0.45) sets -= 1;

  if (ctx.energy === 'exhausted' || ctx.energy === 'unwell') sets -= 1;
  else if (ctx.energy === 'tired') sets -= exercise.compound ? 0 : 1;

  // Accessories late in a session earn their keep at lower volume.
  if ((ctx.orderIndex ?? 0) >= 4 && !exercise.compound) sets -= 1;

  return Math.max(1, Math.min(5, sets));
}

/**
 * Rest intervals (spec 29). Heavy compounds 2–3 min, moderate compounds
 * 90–150 s, isolation 60–90 s, conditioning 30–60 s.
 */
export function resolveRest(exercise: Exercise, goal: Goal, repRange: RepRange): number {
  if (goal === 'muscular_endurance' && !exercise.compound) return 45;

  if (exercise.compound) {
    const heavy = exercise.fatigueRating >= 4 || repRange.max <= 6;
    if (heavy) return goal === 'strength' || goal === 'power' ? 180 : 150;
    return 120;
  }
  return repRange.max >= 15 ? 60 : 75;
}

/**
 * Rest can stretch when the user is struggling, so the next set is still
 * productive rather than merely survivable (spec 29).
 */
export function adaptRest(baseRest: number, lastDifficulty: string | null): number {
  if (lastDifficulty === 'too_difficult') return Math.round(baseRest * 1.35);
  if (lastDifficulty === 'difficult') return Math.round(baseRest * 1.15);
  if (lastDifficulty === 'easy') return Math.round(baseRest * 0.9);
  return baseRest;
}

/** Rough time cost of an exercise, used to fit a session into the user's window. */
export function estimateExerciseMinutes(sets: number, restSeconds: number, unilateral: boolean): number {
  const secondsPerSet = unilateral ? 75 : 45;
  const working = sets * secondsPerSet;
  const resting = Math.max(0, sets - 1) * restSeconds;
  return (working + resting) / 60;
}
