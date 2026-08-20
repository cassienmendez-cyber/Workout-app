import type {
  Difficulty,
  EquipmentProfile,
  Exercise,
  RepRange,
  Unit,
  WorkoutExercise,
} from '../domain/types';
import { DIFFICULTY_RIR } from '../domain/types';

/**
 * Progression Engine (spec 30–34).
 *
 * Double progression is the default: hold the load and add reps inside the
 * target range; once the top of the range is reached with appropriate effort,
 * add load and return toward the bottom.
 *
 * No universal percentage is applied to every lift (spec 33). Increments come
 * from the equipment actually available and the size of the movement.
 */

export interface PerformanceSummary {
  /** Load used on the working sets (the modal actual load). */
  load: number | null;
  /** Reps achieved on each completed set. */
  reps: number[];
  difficulty: Difficulty | null;
  failedReps: boolean;
  techniqueBreakdown: boolean;
  discomfort: boolean;
}

export interface ProgressionDecision {
  targetLoad: number | null;
  targetRepRange: RepRange;
  /** Signed change applied to the load, in the user's unit. */
  loadDelta: number;
  action: 'increase_load' | 'add_reps' | 'hold' | 'reduce_load' | 'establish';
  /** User-facing explanation (spec 34 / 38). */
  explanation: string;
}

/**
 * Smallest usable jump for this exercise, in the user's unit.
 *
 * Large compounds move in bigger absolute steps than small isolation work;
 * dumbbells and machines are quantised to what the profile actually has.
 */
export function loadIncrement(
  exercise: Exercise,
  profile: EquipmentProfile,
  unit: Unit,
  currentLoad: number,
): number {
  const base = profile.loadIncrement > 0 ? profile.loadIncrement : unit === 'kg' ? 2.5 : 5;

  // Dumbbell work steps per hand, and racks rarely go below 2.5 kg / 5 lb.
  const isDumbbell =
    exercise.anyOf.includes('dumbbell') || exercise.anyOf.includes('adjustable_dumbbell');
  if (isDumbbell) return unit === 'kg' ? Math.max(base, 2) : Math.max(base, 5);

  // Big compounds tolerate — and need — larger jumps than small movements.
  if (exercise.compound && exercise.fatigueRating >= 4) {
    return unit === 'kg' ? Math.max(base, 2.5) : Math.max(base, 5);
  }
  if (!exercise.compound) {
    // Percentage-aware floor so light isolation work doesn't jump 20% a session.
    const proportional = currentLoad > 0 ? currentLoad * 0.05 : base;
    return Math.max(base, roundToIncrement(proportional, base));
  }
  return base;
}

function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

/** Load used across the working sets — the value the user actually lifted. */
export function summarise(we: WorkoutExercise): PerformanceSummary {
  const done = we.sets.filter((s) => s.completed && s.actualReps !== null);
  const loads = done.map((s) => s.actualLoad).filter((l): l is number => l !== null);
  return {
    load: loads.length > 0 ? Math.max(...loads) : null,
    reps: done.map((s) => s.actualReps as number),
    difficulty: we.feedback?.difficulty ?? null,
    failedReps: we.feedback?.failedReps ?? false,
    techniqueBreakdown: we.feedback?.techniqueBreakdown ?? false,
    discomfort: we.feedback?.discomfort ?? false,
  };
}

/**
 * Decide the next prescription for one exercise from the last session's
 * performance. Pure and deterministic — the same inputs always decide the same.
 */
export function nextPrescription(
  exercise: Exercise,
  range: RepRange,
  last: PerformanceSummary | null,
  profile: EquipmentProfile,
  unit: Unit,
): ProgressionDecision {
  // No history: the user establishes a working load this session.
  if (!last || last.reps.length === 0) {
    return {
      targetLoad: last?.load ?? null,
      targetRepRange: range,
      loadDelta: 0,
      action: 'establish',
      explanation:
        'First time logging this movement — pick a load you could repeat for a couple more reps, and the app will take it from there.',
    };
  }

  const currentLoad = last.load;
  const increment =
    currentLoad !== null ? loadIncrement(exercise, profile, unit, currentLoad) : 0;
  const minReps = Math.min(...last.reps);
  const hitTopOfRange = minReps >= range.max;
  const rir = last.difficulty ? DIFFICULTY_RIR[last.difficulty] : 2;

  // Safety and technique come before progression (spec 36).
  if (last.techniqueBreakdown || last.difficulty === 'too_difficult') {
    const delta = currentLoad !== null ? -increment : 0;
    return {
      targetLoad: currentLoad !== null ? Math.max(0, currentLoad + delta) : null,
      targetRepRange: range,
      loadDelta: delta,
      action: 'reduce_load',
      explanation: last.techniqueBreakdown
        ? 'Load reduced because your technique broke down on the last session. Rebuild the movement before adding weight again.'
        : 'Load reduced because you rated the last session too difficult.',
    };
  }

  // Bodyweight and timed movements progress in their own currency (spec 34).
  if (exercise.progression === 'bodyweight_reps' || exercise.progression === 'time') {
    if (hitTopOfRange && rir >= 2) {
      const bump = exercise.progression === 'time' ? 10 : 2;
      return {
        targetLoad: currentLoad,
        targetRepRange: { min: range.min + bump, max: range.max + bump },
        loadDelta: 0,
        action: 'add_reps',
        explanation:
          exercise.progression === 'time'
            ? `Target duration increased by ${bump} seconds because you held the top of the range comfortably.`
            : `Target reps increased because you reached ${range.max} with reps still in reserve.`,
      };
    }
    return {
      targetLoad: currentLoad,
      targetRepRange: range,
      loadDelta: 0,
      action: 'hold',
      explanation: 'Same target — keep building reps inside the range.',
    };
  }

  // Double progression: top of the range on every set, with effort in reserve.
  if (hitTopOfRange && rir >= 1 && !last.failedReps && currentLoad !== null) {
    const newLoad = roundToIncrement(currentLoad + increment, increment);
    return {
      targetLoad: newLoad,
      targetRepRange: range,
      loadDelta: newLoad - currentLoad,
      action: 'increase_load',
      explanation: `Weight increased because you completed all target reps${
        last.difficulty === 'easy' ? ' and rated the previous session easy' : ''
      }. Start back near ${range.min} reps at the new load.`,
    };
  }

  // Comfortably clearing the range but not yet at the top: add reps.
  if (last.difficulty === 'easy' && currentLoad !== null && minReps >= range.min) {
    // Rated easy while already at the ceiling — jump the load a full step.
    if (hitTopOfRange) {
      const newLoad = roundToIncrement(currentLoad + increment, increment);
      return {
        targetLoad: newLoad,
        targetRepRange: range,
        loadDelta: newLoad - currentLoad,
        action: 'increase_load',
        explanation: 'Weight increased because you hit the top of the range and rated it easy.',
      };
    }
    return {
      targetLoad: currentLoad,
      targetRepRange: range,
      loadDelta: 0,
      action: 'add_reps',
      explanation: `Same weight — you rated last session easy, so aim for more reps toward ${range.max}.`,
    };
  }

  // Falling short of the bottom of the range means the load is too heavy.
  if (minReps < range.min && currentLoad !== null) {
    const delta = -increment;
    return {
      targetLoad: Math.max(0, roundToIncrement(currentLoad + delta, increment)),
      targetRepRange: range,
      loadDelta: delta,
      action: 'reduce_load',
      explanation: `Weight reduced because you finished below ${range.min} reps. Getting back inside the range is the fastest way forward.`,
    };
  }

  return {
    targetLoad: currentLoad,
    targetRepRange: range,
    loadDelta: 0,
    action: 'add_reps',
    explanation: `Same weight — add reps toward ${range.max} before the load goes up.`,
  };
}

/** Epley estimate, used for PR detection and strength graphs (spec 60, 61). */
export function estimatedOneRepMax(load: number, reps: number): number {
  if (reps <= 0 || load <= 0) return 0;
  if (reps === 1) return load;
  return Math.round(load * (1 + reps / 30) * 10) / 10;
}
