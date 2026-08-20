import type { Workout } from '../domain/types';
import { DIFFICULTY_RIR } from '../domain/types';
import { daysBetween, toISODate } from '../lib/dates';

/**
 * Adaptive Fatigue System (spec 63).
 *
 * Monitors recent difficulty, volume, frequency, performance trend, reported
 * discomfort and consecutive training days, and produces a single 0–1 index.
 * The generator and prescription modules consume that index to reduce sets,
 * load, exercise count or intensity before performance actually falls apart.
 */

export interface FatigueAssessment {
  /** 0 (fresh) – 1 (heavily fatigued). */
  index: number;
  consecutiveDays: number;
  hardSessionRatio: number;
  discomfortRatio: number;
  /** True when the engine should visibly back the session off. */
  deload: boolean;
  reasons: string[];
}

const LOOKBACK_SESSIONS = 6;

/** Consecutive calendar days ending today on which a workout was completed. */
export function consecutiveTrainingDays(workouts: Workout[], today: string): number {
  const dates = new Set(
    workouts
      .filter((w) => w.status === 'completed' && w.actualDate)
      .map((w) => w.actualDate as string),
  );
  let count = 0;
  const cursor = new Date(`${today}T00:00:00`);
  // Today itself may not be trained yet, so start from yesterday if needed.
  if (!dates.has(toISODate(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(toISODate(cursor))) {
    count++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

export function assessFatigue(workouts: Workout[], today: string): FatigueAssessment {
  const completed = workouts
    .filter((w) => w.status === 'completed' && w.actualDate)
    .sort((a, b) => (a.actualDate as string).localeCompare(b.actualDate as string));

  const recent = completed.slice(-LOOKBACK_SESSIONS);
  const reasons: string[] = [];

  if (recent.length === 0) {
    return {
      index: 0,
      consecutiveDays: 0,
      hardSessionRatio: 0,
      discomfortRatio: 0,
      deload: false,
      reasons,
    };
  }

  // How much of the recent work was rated at or beyond the hard end.
  let rated = 0;
  let hard = 0;
  let discomfort = 0;
  let rirTotal = 0;
  for (const w of recent) {
    for (const we of w.exercises) {
      if (!we.feedback) continue;
      rated++;
      rirTotal += DIFFICULTY_RIR[we.feedback.difficulty];
      if (we.feedback.difficulty === 'difficult' || we.feedback.difficulty === 'too_difficult') hard++;
      if (we.feedback.discomfort) discomfort++;
    }
  }
  const hardSessionRatio = rated > 0 ? hard / rated : 0;
  const discomfortRatio = rated > 0 ? discomfort / rated : 0;
  const averageRir = rated > 0 ? rirTotal / rated : 2;

  const consecutive = consecutiveTrainingDays(workouts, today);

  let index = 0;

  if (hardSessionRatio >= 0.6) {
    index += 0.35;
    reasons.push('Most of your recent sets were rated difficult or too difficult.');
  } else if (hardSessionRatio >= 0.4) {
    index += 0.2;
    reasons.push('A large share of recent sets were rated difficult.');
  }

  if (averageRir <= 1) {
    index += 0.15;
    reasons.push('Recent sessions have been consistently close to failure.');
  }

  if (consecutive >= 5) {
    index += 0.3;
    reasons.push(`You have trained ${consecutive} days in a row.`);
  } else if (consecutive >= 3) {
    index += 0.15;
    reasons.push(`You have trained ${consecutive} days in a row.`);
  }

  if (discomfortRatio >= 0.3) {
    index += 0.2;
    reasons.push('You reported discomfort on several recent exercises.');
  }

  // Performance trend: are completed reps falling at the same loads?
  const trend = performanceTrend(recent);
  if (trend < -0.15) {
    index += 0.2;
    reasons.push('Your completed reps have been trending down at the same loads.');
  }

  // Recent rest has the opposite effect.
  const lastDate = recent[recent.length - 1].actualDate as string;
  const daysSince = daysBetween(lastDate, today);
  if (daysSince >= 4) {
    index -= 0.25;
    reasons.push(`You have had ${daysSince} days since your last session.`);
  } else if (daysSince >= 2) {
    index -= 0.1;
  }

  index = Math.max(0, Math.min(1, Math.round(index * 100) / 100));

  return {
    index,
    consecutiveDays: consecutive,
    hardSessionRatio: Math.round(hardSessionRatio * 100) / 100,
    discomfortRatio: Math.round(discomfortRatio * 100) / 100,
    deload: index >= 0.7,
    reasons,
  };
}

/**
 * Change in average reps-per-set between the earlier and later half of the
 * lookback window, normalised. Negative means performance is declining.
 */
function performanceTrend(recent: Workout[]): number {
  if (recent.length < 4) return 0;
  const mid = Math.floor(recent.length / 2);
  const avg = (slice: Workout[]): number => {
    let reps = 0;
    let sets = 0;
    for (const w of slice) {
      for (const we of w.exercises) {
        for (const s of we.sets) {
          if (!s.completed || s.actualReps === null) continue;
          reps += s.actualReps;
          sets++;
        }
      }
    }
    return sets > 0 ? reps / sets : 0;
  };
  const earlier = avg(recent.slice(0, mid));
  const later = avg(recent.slice(mid));
  if (earlier === 0) return 0;
  return (later - earlier) / earlier;
}
