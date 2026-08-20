import { describe, expect, it } from 'vitest';
import { nextPrescription, estimatedOneRepMax, loadIncrement } from '../src/engine/progression';
import { getExercise } from '../src/data/exercises';
import { resolveRepRange } from '../src/engine/prescription';
import type { EquipmentProfile } from '../src/domain/types';
import type { PerformanceSummary as Summary } from '../src/engine/progression';

const gym: EquipmentProfile = {
  id: 'p1',
  name: 'Gym',
  equipment: ['barbell', 'rack', 'dumbbell', 'bench', 'cable', 'machine'],
  loadIncrement: 5,
};

function perf(overrides: Partial<Summary> = {}): Summary {
  return {
    load: 100,
    reps: [10, 10, 10],
    difficulty: 'just_right',
    failedReps: false,
    techniqueBreakdown: false,
    discomfort: false,
    ...overrides,
  };
}

describe('double progression (spec 30, 33)', () => {
  const squat = getExercise('back_squat');
  const range = { min: 8, max: 12 };

  it('holds the load and asks for more reps mid-range', () => {
    const decision = nextPrescription(squat, range, perf({ reps: [9, 9, 8] }), gym, 'lb');
    expect(decision.action).toBe('add_reps');
    expect(decision.targetLoad).toBe(100);
    expect(decision.loadDelta).toBe(0);
  });

  it('increases the load once the top of the range is reached', () => {
    const decision = nextPrescription(squat, range, perf({ reps: [12, 12, 12] }), gym, 'lb');
    expect(decision.action).toBe('increase_load');
    expect(decision.targetLoad).toBeGreaterThan(100);
    expect(decision.loadDelta).toBe(5);
    expect(decision.explanation).toMatch(/completed all target reps/i);
  });

  it('does not increase the load when the last set fell short', () => {
    const decision = nextPrescription(squat, range, perf({ reps: [12, 12, 9] }), gym, 'lb');
    expect(decision.action).toBe('add_reps');
    expect(decision.targetLoad).toBe(100);
  });

  it('does not increase the load when reps failed', () => {
    const decision = nextPrescription(
      squat,
      range,
      perf({ reps: [12, 12, 12], failedReps: true }),
      gym,
      'lb',
    );
    expect(decision.action).not.toBe('increase_load');
  });

  it('reduces the load when the user finishes below the range', () => {
    const decision = nextPrescription(squat, range, perf({ reps: [6, 5, 5] }), gym, 'lb');
    expect(decision.action).toBe('reduce_load');
    expect(decision.targetLoad).toBeLessThan(100);
  });

  it('reduces the load when technique broke down, regardless of reps', () => {
    const decision = nextPrescription(
      squat,
      range,
      perf({ reps: [12, 12, 12], techniqueBreakdown: true }),
      gym,
      'lb',
    );
    expect(decision.action).toBe('reduce_load');
    expect(decision.explanation).toMatch(/technique/i);
  });

  it('reduces the load when the session was rated too difficult', () => {
    const decision = nextPrescription(
      squat,
      range,
      perf({ reps: [8, 8, 8], difficulty: 'too_difficult' }),
      gym,
      'lb',
    );
    expect(decision.action).toBe('reduce_load');
  });

  it('jumps the load when the top of the range was rated easy', () => {
    const decision = nextPrescription(
      squat,
      range,
      perf({ reps: [12, 12, 12], difficulty: 'easy' }),
      gym,
      'lb',
    );
    expect(decision.action).toBe('increase_load');
    expect(decision.explanation).toMatch(/easy/i);
  });

  it('asks the user to establish a load with no history', () => {
    const decision = nextPrescription(squat, range, null, gym, 'lb');
    expect(decision.action).toBe('establish');
    expect(decision.targetLoad).toBeNull();
  });
});

describe('exercise-specific progression (spec 34)', () => {
  it('progresses bodyweight movements by reps, not load', () => {
    const pushUp = getExercise('push_up');
    const range = { min: 8, max: 12 };
    const decision = nextPrescription(
      pushUp,
      range,
      perf({ load: 0, reps: [12, 12, 12], difficulty: 'just_right' }),
      gym,
      'lb',
    );
    expect(decision.action).toBe('add_reps');
    expect(decision.targetRepRange.max).toBeGreaterThan(range.max);
    expect(decision.loadDelta).toBe(0);
  });

  it('progresses timed movements by duration', () => {
    const plank = getExercise('plank');
    const range = { min: 20, max: 60 };
    const decision = nextPrescription(
      plank,
      range,
      perf({ load: 0, reps: [60, 60, 60] }),
      gym,
      'lb',
    );
    expect(decision.targetRepRange.max).toBe(70);
    expect(decision.explanation).toMatch(/seconds/i);
  });

  it('uses larger increments for heavy compounds than small isolation work', () => {
    const squatStep = loadIncrement(getExercise('back_squat'), gym, 'lb', 225);
    const raiseStep = loadIncrement(getExercise('db_lateral_raise'), gym, 'lb', 15);
    expect(squatStep).toBeGreaterThanOrEqual(5);
    expect(raiseStep).toBeLessThanOrEqual(squatStep);
  });

  it('uses dumbbell increments for dumbbell movements', () => {
    const kgProfile: EquipmentProfile = { ...gym, loadIncrement: 1 };
    const step = loadIncrement(getExercise('db_bench_press'), kgProfile, 'kg', 30);
    expect(step).toBeGreaterThanOrEqual(2);
  });
});

describe('rep range resolution (spec 24-27)', () => {
  it('keeps a strength goal inside a low rep range on big compounds', () => {
    const range = resolveRepRange(getExercise('conventional_deadlift'), 'strength');
    expect(range.min).toBeGreaterThanOrEqual(3);
    expect(range.max).toBeLessThanOrEqual(8);
  });

  it('does not force isolation work into a 3-6 range', () => {
    const range = resolveRepRange(getExercise('db_lateral_raise'), 'strength');
    expect(range.max).toBeGreaterThanOrEqual(10);
  });

  it('always leaves room for double progression', () => {
    for (const goal of ['strength', 'muscle_gain', 'general_fitness', 'muscular_endurance'] as const) {
      for (const id of ['back_squat', 'db_curl', 'push_up', 'lat_pulldown']) {
        const range = resolveRepRange(getExercise(id), goal);
        expect(range.max - range.min, `${id}/${goal}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('leaves timed movements on their own scale', () => {
    const range = resolveRepRange(getExercise('plank'), 'strength');
    expect(range.min).toBe(20);
    expect(range.max).toBe(60);
  });
});

describe('estimated one-rep max', () => {
  it('returns the load itself for a single rep', () => {
    expect(estimatedOneRepMax(200, 1)).toBe(200);
  });

  it('increases with reps at the same load', () => {
    expect(estimatedOneRepMax(200, 8)).toBeGreaterThan(estimatedOneRepMax(200, 5));
  });

  it('is zero for unloaded work', () => {
    expect(estimatedOneRepMax(0, 10)).toBe(0);
  });
});
