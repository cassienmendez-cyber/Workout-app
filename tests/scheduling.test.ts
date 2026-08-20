import { describe, expect, it } from 'vitest';
import {
  applyAvailabilityChange,
  regenerateSchedule,
  rescheduleWorkout,
  skipWorkout,
  upcomingTrainingDates,
  nextCycleIndex,
} from '../src/engine/scheduling';
import { completeWorkout, testUser, MONDAY } from './helpers';
import { weekdayOf } from '../src/lib/dates';
import type { Weekday, Workout } from '../src/domain/types';

describe('training date selection', () => {
  it('only returns dates on the user available weekdays', () => {
    const days: Weekday[] = [1, 3, 5];
    const dates = upcomingTrainingDates(days, MONDAY, 6);
    expect(dates).toHaveLength(6);
    for (const date of dates) {
      expect(days).toContain(weekdayOf(date));
    }
  });

  it('returns dates in ascending order starting from the given day', () => {
    const dates = upcomingTrainingDates([1, 3, 5], MONDAY, 4);
    expect(dates[0]).toBe(MONDAY);
    expect([...dates].sort()).toEqual(dates);
  });

  it('handles a seven-day-a-week user', () => {
    const dates = upcomingTrainingDates([0, 1, 2, 3, 4, 5, 6], MONDAY, 7);
    expect(new Set(dates).size).toBe(7);
  });
});

describe('schedule generation (spec 39)', () => {
  it('schedules the requested number of future sessions', () => {
    const user = testUser({ daysPerWeek: 3 });
    const workouts = regenerateSchedule({ user, existing: [], from: MONDAY, count: 6 });
    expect(workouts.filter((w) => w.status === 'scheduled')).toHaveLength(6);
  });

  it('walks the split in order', () => {
    const user = testUser({ daysPerWeek: 3 });
    const workouts = regenerateSchedule({ user, existing: [], from: MONDAY, count: 6 });
    expect(workouts.map((w) => w.slotIndex)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('alternates anterior and posterior for a 4-day user', () => {
    const user = testUser({ daysPerWeek: 4, availableDays: [1, 2, 4, 5] });
    const workouts = regenerateSchedule({ user, existing: [], from: MONDAY, count: 8 });
    const kinds = workouts.map((w) => w.kind);
    for (let i = 1; i < kinds.length; i++) {
      expect(kinds[i]).not.toBe(kinds[i - 1]);
    }
  });

  it('continues the rotation from the last completed session', () => {
    const user = testUser({ daysPerWeek: 3 });
    const first = regenerateSchedule({ user, existing: [], from: MONDAY, count: 3 });
    const done = completeWorkout(first[0], { date: MONDAY });
    expect(nextCycleIndex(user, [done])).toBe(1);

    const rebuilt = regenerateSchedule({
      user,
      existing: [done],
      from: '2026-03-04',
      count: 3,
    });
    const future = rebuilt.filter((w) => w.status === 'scheduled');
    expect(future[0].slotIndex).toBe(1);
  });
});

describe('data integrity (spec 39, 43, 68)', () => {
  it('never modifies completed workouts when regenerating', () => {
    const user = testUser({ daysPerWeek: 3 });
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 4 });
    const done = completeWorkout(initial[0], { date: MONDAY, difficulty: 'easy' });
    const snapshot = JSON.parse(JSON.stringify(done)) as Workout;

    const rebuilt = regenerateSchedule({ user, existing: [done, ...initial.slice(1)], from: '2026-03-04' });
    const preserved = rebuilt.find((w) => w.id === done.id);
    expect(preserved).toEqual(snapshot);
  });

  it('preserves an in-progress workout', () => {
    const user = testUser({ daysPerWeek: 3 });
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 4 });
    const inProgress: Workout = { ...initial[0], status: 'in_progress', startedAt: `${MONDAY}T10:00:00Z` };
    const rebuilt = regenerateSchedule({ user, existing: [inProgress, ...initial.slice(1)], from: MONDAY });
    expect(rebuilt.find((w) => w.id === inProgress.id)?.status).toBe('in_progress');
  });

  it('keeps planned and actual dates separate', () => {
    const user = testUser({ daysPerWeek: 3 });
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 3 });
    const target = initial[0];
    const { workouts } = rescheduleWorkout(user, initial, target.id, '2026-03-05');
    const moved = workouts.find((w) => w.id === target.id);
    expect(moved?.plannedDate).toBe(MONDAY);
    expect(moved?.actualDate).toBe('2026-03-05');
    expect(moved?.rescheduledFrom).toBe(MONDAY);
  });
});

describe('rescheduling (spec 40, 41, 43)', () => {
  const user = testUser({ daysPerWeek: 3 });

  it('marks a moved workout as rescheduled, not skipped', () => {
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 4 });
    const { workouts } = rescheduleWorkout(user, initial, initial[0].id, '2026-03-05');
    const moved = workouts.find((w) => w.id === initial[0].id);
    expect(moved?.status).toBe('rescheduled');
  });

  it('keeps the moved session in the split sequence', () => {
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 4 });
    const original = initial[0];
    const { workouts } = rescheduleWorkout(user, initial, original.id, '2026-03-05');
    const moved = workouts.find((w) => w.id === original.id);
    expect(moved?.slotIndex).toBe(original.slotIndex);
    expect(moved?.slotLabel).toBe(original.slotLabel);
  });

  it('explains the change to the user', () => {
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 4 });
    const { message } = rescheduleWorkout(user, initial, initial[0].id, '2026-03-05');
    expect(message).toMatch(/moved/i);
    expect(message).toMatch(/nothing you have already completed changed/i);
  });

  it('refuses to move a completed workout', () => {
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 3 });
    const done = completeWorkout(initial[0], { date: MONDAY });
    const { workouts, message } = rescheduleWorkout(user, [done], done.id, '2026-03-10');
    expect(message).toMatch(/completed/i);
    expect(workouts.find((w) => w.id === done.id)?.actualDate).toBe(MONDAY);
  });

  it('survives repeated rescheduling without corrupting history (spec 69)', () => {
    let workouts = regenerateSchedule({ user, existing: [], from: MONDAY, count: 6 });
    const done = completeWorkout(workouts[0], { date: MONDAY });
    workouts = [done, ...workouts.slice(1)];
    const historySnapshot = JSON.parse(JSON.stringify(done)) as Workout;

    const moves = ['2026-03-06', '2026-03-07', '2026-03-11', '2026-03-13'];
    for (const date of moves) {
      const next = workouts.find((w) => w.status === 'scheduled');
      if (!next) break;
      workouts = rescheduleWorkout(user, workouts, next.id, date).workouts;
    }

    expect(workouts.find((w) => w.id === done.id)).toEqual(historySnapshot);
    // The schedule is still coherent: no duplicate dates among live sessions.
    const live = workouts.filter((w) => w.status === 'scheduled' || w.status === 'rescheduled');
    const dates = live.map((w) => w.actualDate ?? w.plannedDate);
    expect(new Set(dates).size).toBe(dates.length);
  });
});

describe('skipping (spec 6, 40, 55)', () => {
  const user = testUser({ daysPerWeek: 3 });

  it('marks the workout skipped and keeps the plan going', () => {
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 4 });
    const { workouts, message } = skipWorkout(user, initial, initial[0].id);
    expect(workouts.find((w) => w.id === initial[0].id)?.status).toBe('skipped');
    expect(workouts.some((w) => w.status === 'scheduled')).toBe(true);
    expect(message).not.toMatch(/fail|miss|behind/i);
  });
});

describe('changed availability (spec 42)', () => {
  it('applies new training days and regenerates the future', () => {
    const user = testUser({ daysPerWeek: 3, availableDays: [1, 3, 6] });
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 6 });

    const result = applyAvailabilityChange(user, initial, 3, [2, 4, 0], '2026-03-09');
    expect(result.user.availableDays).toEqual([0, 2, 4]);

    const future = result.workouts.filter(
      (w) => w.status === 'scheduled' && (w.actualDate ?? w.plannedDate) >= '2026-03-09',
    );
    expect(future.length).toBeGreaterThan(0);
    for (const workout of future) {
      expect([0, 2, 4]).toContain(weekdayOf(workout.actualDate ?? workout.plannedDate));
    }
  });

  it('leaves workouts before the effective date alone', () => {
    const user = testUser({ daysPerWeek: 3, availableDays: [1, 3, 5] });
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 6 });
    const done = completeWorkout(initial[0], { date: MONDAY });
    const withHistory = [done, ...initial.slice(1)];

    const result = applyAvailabilityChange(user, withHistory, 2, [2, 4], '2026-03-09');
    const preserved = result.workouts.find((w) => w.id === done.id);
    expect(preserved?.status).toBe('completed');
    expect(preserved?.actualDate).toBe(MONDAY);
  });

  it('handles switching frequency from 3 days to 5 days', () => {
    const user = testUser({ daysPerWeek: 3, availableDays: [1, 3, 5] });
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 6 });
    const result = applyAvailabilityChange(user, initial, 5, [1, 2, 3, 4, 5], MONDAY);

    const future = result.workouts.filter((w) => w.status === 'scheduled');
    // A 5-day user gets the anterior/posterior split (spec 17).
    expect(future.every((w) => w.kind === 'anterior' || w.kind === 'posterior')).toBe(true);
  });

  it('handles switching down from 5 days to 2 days', () => {
    const user = testUser({ daysPerWeek: 5, availableDays: [1, 2, 3, 4, 5] });
    const initial = regenerateSchedule({ user, existing: [], from: MONDAY, count: 8 });
    const result = applyAvailabilityChange(user, initial, 2, [1, 4], MONDAY);
    const future = result.workouts.filter((w) => w.status === 'scheduled');
    expect(future.every((w) => w.kind === 'full_body')).toBe(true);
    for (const workout of future) {
      expect([1, 4]).toContain(weekdayOf(workout.actualDate ?? workout.plannedDate));
    }
  });

  it('survives repeated availability changes (spec 69)', () => {
    let user = testUser({ daysPerWeek: 3, availableDays: [1, 3, 5] });
    let workouts = regenerateSchedule({ user, existing: [], from: MONDAY, count: 6 });
    const done = completeWorkout(workouts[0], { date: MONDAY });
    workouts = [done, ...workouts.slice(1)];

    const changes: [number, Weekday[]][] = [
      [4, [1, 2, 4, 5]],
      [2, [2, 6]],
      [6, [1, 2, 3, 4, 5, 6]],
      [1, [0]],
    ];
    for (const [days, available] of changes) {
      const result = applyAvailabilityChange(user, workouts, days, available, '2026-03-09');
      user = result.user;
      workouts = result.workouts;
    }

    expect(workouts.find((w) => w.id === done.id)?.status).toBe('completed');
    const future = workouts.filter(
      (w) => w.status === 'scheduled' && (w.actualDate ?? w.plannedDate) >= '2026-03-09',
    );
    for (const workout of future) {
      expect(weekdayOf(workout.actualDate ?? workout.plannedDate)).toBe(0);
    }
  });
});
