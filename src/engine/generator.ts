import type {
  EnergyLevel,
  EquipmentProfile,
  Exercise,
  MovementPattern,
  Muscle,
  RepRange,
  UserProfile,
  Workout,
  WorkoutExercise,
  WorkoutMode,
  SplitSlot,
} from '../domain/types';
import { EXERCISES, findExercise } from '../data/exercises';
import { rankExercises } from './efficiency';
import { activeProfile } from './safety';
import {
  estimateExerciseMinutes,
  resolveRepRange,
  resolveRest,
  resolveSets,
} from './prescription';
import { nextPrescription, summarise } from './progression';
import { assessFatigue } from './fatigue';
import { muscleDeficit, setsPerMuscle } from './volume';
import { buildSplit } from './split';
import { addDays, startOfWeek } from '../lib/dates';
import { uid } from '../lib/uid';

/**
 * Workout Generator (spec 22, 23).
 *
 * Consumes: goal, frequency, split slot, previous workouts, muscle recovery,
 * weekly volume, equipment, limitations, preferences, available duration,
 * recent performance and difficulty feedback.
 *
 * Produces a complete, ready-to-perform session. Nothing about a workout is
 * hard-coded — every exercise, set, rep target, load and rest interval is
 * derived here from structured data (spec 69).
 */

export interface GenerateOptions {
  user: UserProfile;
  slot: SplitSlot;
  date: string;
  history: Workout[];
  mode?: WorkoutMode;
  energy?: EnergyLevel | null;
  /** Override the user's usual session length, in minutes. */
  durationMinutes?: number;
}

/** Target exercise count per mode (spec 23, 44, 45). */
const MODE_TARGETS: Record<WorkoutMode, { min: number; max: number }> = {
  full: { min: 4, max: 6 },
  reduced: { min: 3, max: 4 },
  minimum: { min: 2, max: 3 },
};

/** Hours of recovery expected before a muscle is worked hard again. */
const RECOVERY_HOURS = 48;

/**
 * Muscles trained hard recently enough that loading them again would cut into
 * recovery. Used to bias — never to hard-block — selection (spec 22).
 */
function recentlyTrainedMuscles(history: Workout[], date: string): Set<Muscle> {
  const cutoff = addDays(date, -Math.ceil(RECOVERY_HOURS / 24));
  const recent = history.filter(
    (w) => w.status === 'completed' && w.actualDate && w.actualDate >= cutoff && w.actualDate < date,
  );
  const trained = new Set<Muscle>();
  for (const w of recent) {
    for (const we of w.exercises) {
      const ex = findExercise(we.exerciseId);
      if (!ex) continue;
      const hardSets = we.sets.filter((s) => s.completed).length;
      if (hardSets < 2) continue;
      for (const m of ex.primaryMuscles) trained.add(m);
    }
  }
  return trained;
}

/** The most recent completed performance of an exercise, for progression. */
function lastPerformance(history: Workout[], exerciseId: string): WorkoutExercise | null {
  const completed = history
    .filter((w) => w.status === 'completed' && w.actualDate)
    .sort((a, b) => (b.actualDate as string).localeCompare(a.actualDate as string));
  for (const w of completed) {
    const found = w.exercises.find(
      (we) => we.exerciseId === exerciseId && we.sets.some((s) => s.completed),
    );
    if (found) return found;
  }
  return null;
}

/** Exercise ids used in the last two sessions, for variety pressure. */
function recentExerciseIds(history: Workout[], date: string): string[] {
  const recent = history
    .filter((w) => w.status === 'completed' && w.actualDate && w.actualDate < date)
    .sort((a, b) => (b.actualDate as string).localeCompare(a.actualDate as string))
    .slice(0, 2);
  return recent.flatMap((w) => w.exercises.map((we) => we.exerciseId));
}

/**
 * Choose one exercise per pattern slot, best-scoring first, skipping patterns
 * that cannot be filled with the available equipment and limitations.
 */
function selectExercises(
  patterns: MovementPattern[],
  targetCount: number,
  opts: {
    user: UserProfile;
    profile: EquipmentProfile;
    deficit: Partial<Record<Muscle, number>>;
    recent: string[];
    recovering: Set<Muscle>;
    timeConstrained: boolean;
  },
): { exercise: Exercise; pattern: MovementPattern }[] {
  const chosen: { exercise: Exercise; pattern: MovementPattern }[] = [];
  const used = new Set<string>();
  const usedMuscles = new Map<Muscle, number>();

  for (const pattern of patterns) {
    if (chosen.length >= targetCount) break;

    const candidates = EXERCISES.filter((e) => e.pattern === pattern && !used.has(e.id));
    const ranked = rankExercises(candidates, {
      user: opts.user,
      profile: opts.profile,
      muscleDeficit: opts.deficit,
      neededPattern: pattern,
      recentExerciseIds: opts.recent,
      timeConstrained: opts.timeConstrained,
    });
    if (ranked.length === 0) continue;

    // Prefer a movement that does not pile onto still-recovering muscles or
    // onto muscles this session has already hit hard.
    const best =
      ranked.find((r) => {
        const overworked = r.exercise.primaryMuscles.some(
          (m) => (usedMuscles.get(m) ?? 0) >= 2 || opts.recovering.has(m),
        );
        return !overworked;
      }) ?? ranked[0];

    chosen.push({ exercise: best.exercise, pattern });
    used.add(best.exercise.id);
    for (const m of best.exercise.primaryMuscles) {
      usedMuscles.set(m, (usedMuscles.get(m) ?? 0) + 1);
    }
  }

  return chosen;
}

/**
 * Session priority. 1 is never dropped in short mode; higher numbers drop
 * first. Compounds early in the session carry the essential stimulus (spec 44).
 */
function priorityFor(exercise: Exercise, index: number): number {
  if (index === 0) return 1;
  if (exercise.compound && index <= 2) return 1;
  if (exercise.compound) return 2;
  return index >= 4 ? 4 : 3;
}

export function generateWorkout(options: GenerateOptions): Workout {
  const { user, slot, date, history } = options;
  const mode = options.mode ?? 'full';
  const energy = options.energy ?? null;
  const profile = activeProfile(user);

  const durationMinutes = options.durationMinutes ?? user.preferredDurationMinutes;
  const fatigue = assessFatigue(history, date);

  // Weekly context: what has this week already covered?
  const weekStart = startOfWeek(date);
  const weekWorkouts = history.filter(
    (w) => w.status === 'completed' && w.actualDate && w.actualDate >= weekStart && w.actualDate < date,
  );
  const deficit = muscleDeficit(weekWorkouts);
  const weeklySets = setsPerMuscle(weekWorkouts);
  const recovering = recentlyTrainedMuscles(history, date);
  const recent = recentExerciseIds(history, date);

  const adaptations: string[] = [];

  // Exercise count: mode, then time, then fatigue and energy.
  let targetCount = MODE_TARGETS[mode].max;
  if (durationMinutes <= 20) targetCount = Math.min(targetCount, 3);
  else if (durationMinutes <= 35) targetCount = Math.min(targetCount, 4);
  else if (durationMinutes <= 45) targetCount = Math.min(targetCount, 5);

  if (fatigue.index >= 0.7) {
    targetCount = Math.max(MODE_TARGETS[mode].min, targetCount - 1);
    adaptations.push(
      'Session trimmed because your recent training load and difficulty ratings suggest accumulated fatigue.',
    );
  }
  if (energy === 'exhausted' || energy === 'unwell') {
    targetCount = Math.max(MODE_TARGETS[mode].min, targetCount - 1);
    adaptations.push('Session shortened because you reported low energy today.');
  }
  targetCount = Math.max(MODE_TARGETS[mode].min, targetCount);

  const timeConstrained = durationMinutes <= 35 || mode !== 'full';

  const selected = selectExercises(slot.patterns, targetCount, {
    user,
    profile,
    deficit,
    recent,
    recovering,
    timeConstrained,
  });

  // Build the prescription for each selected movement.
  const exercises: WorkoutExercise[] = [];
  let index = 0;
  for (const { exercise } of selected) {
    const goalRange = resolveRepRange(exercise, user.primaryGoal);
    const previous = lastPerformance(history, exercise.id);
    const decision = nextPrescription(
      exercise,
      goalRange,
      previous ? summarise(previous) : null,
      profile,
      user.unit,
    );

    const primary = exercise.primaryMuscles[0];
    const sets = resolveSets(exercise, {
      user,
      weeklySetsForPrimary: primary ? weeklySets[primary] ?? 0 : 0,
      fatigueIndex: fatigue.index,
      energy,
      orderIndex: index,
    });

    const range: RepRange = decision.targetRepRange;
    const rest = resolveRest(exercise, user.primaryGoal, range);

    exercises.push({
      id: uid(),
      exerciseId: exercise.id,
      order: index,
      targetSets: sets,
      targetRepRange: range,
      targetLoad: decision.targetLoad,
      restSeconds: rest,
      sets: Array.from({ length: sets }, (_, i) => ({
        id: uid(),
        setNumber: i + 1,
        targetReps: range.min,
        targetLoad: decision.targetLoad,
        actualReps: null,
        actualLoad: null,
        completed: false,
        timestamp: null,
      })),
      feedback: null,
      priority: priorityFor(exercise, index),
    });

    if (decision.action !== 'establish' && decision.action !== 'hold') {
      adaptations.push(`${exercise.name}: ${decision.explanation}`);
    }
    index++;
  }

  if (fatigue.deload) {
    adaptations.push(...fatigue.reasons.slice(0, 2));
  }

  const estimatedMinutes = Math.round(
    exercises.reduce((total, we) => {
      const ex = findExercise(we.exerciseId);
      return (
        total + estimateExerciseMinutes(we.targetSets, we.restSeconds, ex?.unilateral ?? false)
      );
    }, 0) + 5, // warm-up and transitions
  );

  return {
    id: uid(),
    userId: user.id,
    plannedDate: date,
    actualDate: null,
    slotIndex: slot.index,
    slotLabel: slot.label,
    kind: slot.kind,
    status: 'scheduled',
    mode,
    energy,
    exercises,
    estimatedMinutes,
    startedAt: null,
    completedAt: null,
    durationSeconds: null,
    adaptations,
  };
}

/**
 * Apply a short-workout mode to an already-generated session (spec 44, 45).
 *
 * Lower-priority movements are dropped and set counts trimmed, but the
 * essential stimulus — the priority-1 compounds — always survives. The result
 * is still a completable workout, not a partial one.
 */
export function applyMode(workout: Workout, mode: WorkoutMode): Workout {
  if (mode === workout.mode) return workout;

  const target = MODE_TARGETS[mode];
  const ranked = [...workout.exercises].sort((a, b) => a.priority - b.priority || a.order - b.order);
  const kept = ranked.slice(0, target.max).sort((a, b) => a.order - b.order);

  const trimmed = kept.map((we, i) => {
    const setCount =
      mode === 'minimum'
        ? Math.max(1, we.targetSets - 1)
        : mode === 'reduced'
          ? Math.max(2, we.targetSets - 1)
          : we.targetSets;
    return {
      ...we,
      order: i,
      targetSets: setCount,
      sets: we.sets.slice(0, setCount),
    };
  });

  const note =
    mode === 'minimum'
      ? 'Minimum session: the essential movements are kept so this still counts as a completed workout.'
      : mode === 'reduced'
        ? 'Reduced session: lower-priority movements were removed to fit the time you have.'
        : 'Full session restored.';

  return {
    ...workout,
    mode,
    exercises: trimmed,
    estimatedMinutes: Math.round(
      trimmed.reduce((total, we) => {
        const ex = findExercise(we.exerciseId);
        return total + estimateExerciseMinutes(we.targetSets, we.restSeconds, ex?.unilateral ?? false);
      }, 0) + 5,
    ),
    adaptations: [...workout.adaptations.filter((a) => !a.startsWith('Minimum session') && !a.startsWith('Reduced session') && !a.startsWith('Full session')), note],
  };
}

/** Convenience: the split slot a given cycle position maps to. */
export function slotForIndex(daysPerWeek: number, cycleIndex: number): SplitSlot {
  const split = buildSplit(daysPerWeek);
  return split[((cycleIndex % split.length) + split.length) % split.length];
}
