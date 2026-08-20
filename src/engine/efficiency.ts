import type {
  Exercise,
  Goal,
  MovementPattern,
  Muscle,
  UserProfile,
  EquipmentProfile,
} from '../domain/types';
import { PREFERENCE_WEIGHT } from '../domain/types';
import { checkEligibility } from './safety';

/**
 * Exercise Efficiency Score (spec 20, 21).
 *
 * A single comparable number expressing "how much useful training does this
 * movement buy for this user, right now, per unit of time and fatigue".
 *
 * Inputs, per spec: relevant muscles trained, movement patterns addressed,
 * goal relevance, time efficiency, equipment availability, skill requirements,
 * fatigue cost, injury compatibility, and progression potential.
 *
 * Scores are only ever compared against each other, never shown to the user.
 */

export interface EfficiencyContext {
  user: UserProfile;
  profile: EquipmentProfile;
  /** Muscles already under-trained this week; raises relevance. */
  muscleDeficit?: Partial<Record<Muscle, number>>;
  /** Patterns still unfilled in the current session. */
  neededPattern?: MovementPattern;
  /** Exercise ids used recently; lightly penalised to keep variety. */
  recentExerciseIds?: string[];
  /** When true the user is short on time, so time efficiency matters more. */
  timeConstrained?: boolean;
}

export interface EfficiencyBreakdown {
  total: number;
  muscleValue: number;
  goalRelevance: number;
  timeEfficiency: number;
  skillPenalty: number;
  fatigueCost: number;
  preference: number;
  progressionPotential: number;
  deficitBonus: number;
  varietyPenalty: number;
}

/** Goal suitability defaults to neutral when an exercise does not declare one. */
function goalScore(exercise: Exercise, goal: Goal | null, weight: number): number {
  if (!goal) return 0;
  const raw = exercise.goalSuitability[goal] ?? 5;
  return (raw - 5) * weight;
}

/**
 * How much useful muscle a movement covers. Compounds score higher because
 * they train more relevant tissue per unit of session time (spec 21).
 */
function muscleValue(exercise: Exercise): number {
  const primary = exercise.primaryMuscles.length * 4;
  const secondary = exercise.secondaryMuscles.length * 1.5;
  const compoundBonus = exercise.compound ? 6 : 0;
  return primary + secondary + compoundBonus;
}

/**
 * Time efficiency: stimulus per minute. Compounds cover more per set, but
 * heavy compounds also demand long rest, which costs session time.
 */
function timeEfficiency(exercise: Exercise, timeConstrained: boolean): number {
  const coverage = exercise.compound ? 8 : 3;
  const restCost = exercise.fatigueRating >= 4 ? 3 : exercise.fatigueRating >= 3 ? 1.5 : 0;
  const setupCost = exercise.unilateral ? 1.5 : 0;
  const multiplier = timeConstrained ? 1.6 : 1;
  return (coverage - restCost - setupCost) * multiplier;
}

/** Skill/stability demand relative to the user's experience. */
function skillPenalty(exercise: Exercise, user: UserProfile): number {
  const tolerance = user.experience === 'advanced' ? 5 : user.experience === 'intermediate' ? 3.5 : 2;
  const excess = Math.max(0, exercise.difficulty - tolerance);
  const stabilityExcess = Math.max(0, exercise.stability - tolerance);
  return excess * 3 + stabilityExcess * 1.5;
}

/** Room left to progress: a movement you can load for months beats one you can't. */
function progressionPotential(exercise: Exercise): number {
  switch (exercise.progression) {
    case 'double_progression':
      return 6;
    case 'load_only':
      return 5;
    case 'bodyweight_reps':
      return 3;
    case 'reps_only':
      return 2;
    case 'time':
      return 2;
  }
}

export function scoreExercise(
  exercise: Exercise,
  ctx: EfficiencyContext,
): EfficiencyBreakdown | null {
  const eligibility = checkEligibility(exercise, ctx.user, ctx.profile);
  if (!eligibility.allowed) return null;

  const { user } = ctx;
  const timeConstrained = ctx.timeConstrained ?? false;

  const mv = muscleValue(exercise);
  const goalRelevance =
    goalScore(exercise, user.primaryGoal, 2.2) + goalScore(exercise, user.secondaryGoal, 1.0);
  const te = timeEfficiency(exercise, timeConstrained);
  const sp = skillPenalty(exercise, user);
  const fatigueCost = exercise.fatigueRating * 1.6;
  const preference = PREFERENCE_WEIGHT[user.exercisePreferences[exercise.id] ?? 'neutral'];
  const pp = progressionPotential(exercise);

  // Reward movements that hit muscles the week is short on (spec 62).
  let deficitBonus = 0;
  if (ctx.muscleDeficit) {
    for (const m of exercise.primaryMuscles) deficitBonus += (ctx.muscleDeficit[m] ?? 0) * 2;
    for (const m of exercise.secondaryMuscles) deficitBonus += (ctx.muscleDeficit[m] ?? 0) * 0.6;
  }

  // Mild variety pressure so consecutive sessions don't repeat identically.
  const varietyPenalty = ctx.recentExerciseIds?.includes(exercise.id) ? 4 : 0;

  // A movement flagged "modify" is usable but should lose to a clean option.
  const modifiedPenalty = eligibility.modified ? 8 : 0;

  const total =
    mv +
    goalRelevance +
    te +
    pp +
    preference +
    deficitBonus -
    sp -
    fatigueCost -
    varietyPenalty -
    modifiedPenalty;

  return {
    total,
    muscleValue: mv,
    goalRelevance,
    timeEfficiency: te,
    skillPenalty: sp,
    fatigueCost,
    preference,
    progressionPotential: pp,
    deficitBonus,
    varietyPenalty,
  };
}

export interface ScoredExercise {
  exercise: Exercise;
  score: number;
  breakdown: EfficiencyBreakdown;
}

/** Score and rank a candidate list, best first. Ineligible entries drop out. */
export function rankExercises(candidates: Exercise[], ctx: EfficiencyContext): ScoredExercise[] {
  const scored: ScoredExercise[] = [];
  for (const exercise of candidates) {
    const breakdown = scoreExercise(exercise, ctx);
    if (!breakdown) continue;
    scored.push({ exercise, score: breakdown.total, breakdown });
  }
  // Ties break on id so generation stays deterministic (spec 69).
  scored.sort((a, b) => b.score - a.score || a.exercise.id.localeCompare(b.exercise.id));
  return scored;
}
