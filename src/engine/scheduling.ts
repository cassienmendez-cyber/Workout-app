import type { UserProfile, Weekday, Workout } from '../domain/types';
import { buildSplit } from './split';
import { generateWorkout } from './generator';
import { addDays, daysBetween, todayISO, weekdayOf } from '../lib/dates';

/**
 * Dynamic Scheduling Engine (spec 39–43).
 *
 * Invariants this module guarantees:
 *
 *  - Planned date and actual date are stored separately (spec 43).
 *  - Completed and in-progress workouts are never regenerated or moved.
 *  - Rescheduling preserves the *sequence* of the split, so a user who moves
 *    Monday's session to Thursday still gets the session they were owed.
 *  - Regenerating the future never rewrites the past (spec 39, 68).
 */

/** Workouts whose data is historical and must not be touched. */
export function isImmutable(workout: Workout): boolean {
  return workout.status === 'completed' || workout.status === 'in_progress';
}

/** The date a workout actually sits on: where it moved to, else where planned. */
export function effectiveDate(workout: Workout): string {
  return workout.actualDate ?? workout.plannedDate;
}

/**
 * The next `count` dates on or after `from` that fall on an available weekday.
 * Falls back to consecutive days if the user has no availability set.
 */
export function upcomingTrainingDates(
  availableDays: Weekday[],
  from: string,
  count: number,
  options: { minRestDays?: number } = {},
): string[] {
  const days = availableDays.length > 0 ? availableDays : ([1, 3, 5] as Weekday[]);
  const minRest = options.minRestDays ?? 0;
  const dates: string[] = [];
  let cursor = from;
  let guard = 0;
  let lastPicked: string | null = null;

  while (dates.length < count && guard < 400) {
    if (days.includes(weekdayOf(cursor))) {
      if (lastPicked === null || daysBetween(lastPicked, cursor) > minRest) {
        dates.push(cursor);
        lastPicked = cursor;
      }
    }
    cursor = addDays(cursor, 1);
    guard++;
  }
  return dates;
}

export interface ScheduleOptions {
  user: UserProfile;
  /** Existing workouts; completed and in-progress ones are preserved as-is. */
  existing: Workout[];
  /** Generate from this date forward. Defaults to today. */
  from?: string;
  /** How many sessions to schedule ahead. */
  count?: number;
}

/**
 * Where the user is in the split rotation, derived from history so that the
 * sequence survives any amount of rescheduling.
 */
export function nextCycleIndex(user: UserProfile, workouts: Workout[]): number {
  const split = buildSplit(user.daysPerWeek);
  const done = workouts
    .filter((w) => w.status === 'completed')
    .sort((a, b) => effectiveDate(a).localeCompare(effectiveDate(b)));
  if (done.length === 0) return 0;
  const last = done[done.length - 1];
  return (last.slotIndex + 1) % split.length;
}

/**
 * Regenerate the future schedule.
 *
 * Past and in-progress workouts are carried through untouched. Future
 * `scheduled` workouts are discarded and rebuilt, so a change to availability,
 * equipment, goals or recovery is reflected immediately without disturbing
 * anything the user has already done (spec 39, 41, 42).
 */
export function regenerateSchedule(options: ScheduleOptions): Workout[] {
  const { user, existing } = options;
  const from = options.from ?? todayISO();
  const count = options.count ?? Math.max(user.daysPerWeek * 2, 6);

  // Only `scheduled` workouts are the engine's to rewrite. Anything the user
  // has acted on — completed, started, moved, or skipped — is a record of what
  // actually happened and survives untouched, whatever its date. A workout
  // moved *earlier* than the cutoff still has a later planned date, so this
  // must key on status rather than on dates (spec 39, 43, 68).
  const preserved = existing.filter((w) => w.status !== 'scheduled');

  // Scheduled workouts left behind the cutoff become skipped rather than
  // silently vanishing (spec 55: the record stays honest, not punitive).
  const lapsed = existing
    .filter((w) => w.status === 'scheduled' && effectiveDate(w) < from)
    .map((w) => ({ ...w, status: 'skipped' as const }));

  const history = [...preserved, ...lapsed];
  const split = buildSplit(user.daysPerWeek);
  let cycleIndex = nextCycleIndex(user, history);

  // Never double-book a date the user has already claimed.
  const dates = upcomingTrainingDates(user.availableDays, from, count);
  const occupied = new Set(
    history.filter((w) => w.status !== 'skipped').map(effectiveDate),
  );

  const generated: Workout[] = [];
  const runningHistory = [...history];

  for (const date of dates) {
    if (occupied.has(date)) continue;
    const slot = split[cycleIndex % split.length];
    const workout = generateWorkout({
      user,
      slot,
      date,
      history: runningHistory,
    });
    generated.push(workout);
    runningHistory.push(workout);
    cycleIndex++;
  }

  return [...history, ...generated].sort((a, b) =>
    effectiveDate(a).localeCompare(effectiveDate(b)),
  );
}

export interface RescheduleResult {
  workouts: Workout[];
  message: string;
}

/**
 * Move a scheduled workout to a new date (spec 40, 41).
 *
 * The moved workout keeps its identity and its place in the split sequence —
 * it is marked `rescheduled`, not missed — and everything after it is
 * regenerated around the new date so recovery and availability still hold.
 */
export function rescheduleWorkout(
  user: UserProfile,
  workouts: Workout[],
  workoutId: string,
  newDate: string,
): RescheduleResult {
  const target = workouts.find((w) => w.id === workoutId);
  if (!target) return { workouts, message: 'That workout could not be found.' };
  if (isImmutable(target)) {
    return { workouts, message: 'Completed workouts stay where they are.' };
  }

  const moved: Workout = {
    ...target,
    actualDate: newDate,
    plannedDate: target.plannedDate,
    rescheduledFrom: target.plannedDate,
    status: 'rescheduled',
  };

  // Everything except this workout carries through; regenerateSchedule keeps
  // the records and rebuilds only what is still merely scheduled after the
  // new date. `moved` is `rescheduled`, so it is preserved by status.
  const rebuilt = regenerateSchedule({
    user,
    existing: [...workouts.filter((w) => w.id !== workoutId), moved],
    from: addDays(newDate, 1),
  });

  return {
    workouts: rebuilt.sort((a, b) => effectiveDate(a).localeCompare(effectiveDate(b))),
    message: `Workout moved to ${newDate}. Your following sessions were rescheduled around it, and nothing you have already completed changed.`,
  };
}

/**
 * Mark a scheduled workout as skipped and rebuild the future (spec 6, 40).
 * Skipping is never punished — the next session simply moves up.
 */
export function skipWorkout(
  user: UserProfile,
  workouts: Workout[],
  workoutId: string,
): RescheduleResult {
  const target = workouts.find((w) => w.id === workoutId);
  if (!target || isImmutable(target)) {
    return { workouts, message: 'That workout cannot be skipped.' };
  }
  const updated = workouts.map((w) =>
    w.id === workoutId ? { ...w, status: 'skipped' as const } : w,
  );
  const rebuilt = regenerateSchedule({
    user,
    existing: updated,
    from: addDays(target.plannedDate, 1),
  });
  return {
    workouts: rebuilt,
    message: 'No problem — your upcoming sessions were rescheduled so you pick up where you left off.',
  };
}

/**
 * Apply a change of regular availability (spec 42).
 *
 * `effectiveFrom` decides whether the change lands this week or later. Past
 * workouts are always left alone.
 */
export function applyAvailabilityChange(
  user: UserProfile,
  workouts: Workout[],
  daysPerWeek: number,
  availableDays: Weekday[],
  effectiveFrom: string,
): { user: UserProfile; workouts: Workout[]; message: string } {
  const updatedUser: UserProfile = {
    ...user,
    daysPerWeek,
    availableDays: [...availableDays].sort((a, b) => a - b),
    pendingAvailabilityChange: null,
  };

  const rebuilt = regenerateSchedule({
    user: updatedUser,
    existing: workouts,
    from: effectiveFrom,
  });

  return {
    user: updatedUser,
    workouts: rebuilt,
    message: `Your schedule now runs ${daysPerWeek} day${daysPerWeek === 1 ? '' : 's'} a week from ${effectiveFrom}. Workouts before that date were left as they were.`,
  };
}

/** Dates in the horizon that are deliberate rest days (spec 53, 54). */
export function restDaysIn(workouts: Workout[], dates: string[]): string[] {
  const trainingDates = new Set(
    workouts.filter((w) => w.status !== 'skipped').map(effectiveDate),
  );
  return dates.filter((d) => !trainingDates.has(d));
}
