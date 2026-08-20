import type { Exercise, EquipmentProfile, UserProfile } from '../domain/types';
import { EXERCISES, findExercise } from '../data/exercises';
import { checkEligibility } from './safety';
import { rankExercises } from './efficiency';

/**
 * Exercise Substitution Engine (spec 37, 38).
 *
 * Candidates are chosen on movement pattern, muscles, goal, equipment,
 * experience, injury compatibility, fatigue cost and progression potential —
 * then ranked by the same efficiency score the generator uses, so a substitute
 * is simply "the next best available movement for this slot".
 */

export interface Substitution {
  exercise: Exercise;
  reason: string;
}

/** How closely a candidate reproduces the original's training effect. */
function similarity(original: Exercise, candidate: Exercise): number {
  let score = 0;
  if (candidate.pattern === original.pattern) score += 30;
  if (candidate.orientation === original.orientation) score += 6;

  const originalPrimary = new Set(original.primaryMuscles);
  const sharedPrimary = candidate.primaryMuscles.filter((m) => originalPrimary.has(m)).length;
  score += sharedPrimary * 10;

  const originalSecondary = new Set(original.secondaryMuscles);
  const sharedSecondary = candidate.secondaryMuscles.filter((m) => originalSecondary.has(m)).length;
  score += sharedSecondary * 3;

  // A substitute should cost roughly what the original cost.
  score -= Math.abs(candidate.fatigueRating - original.fatigueRating) * 2;
  if (candidate.compound === original.compound) score += 5;
  return score;
}

/**
 * Ordered substitution candidates for an exercise, best first.
 * Hand-authored substitutions in the database are boosted but not guaranteed —
 * they still have to be eligible for this user and profile.
 */
export function substitutionCandidates(
  original: Exercise,
  user: UserProfile,
  profile: EquipmentProfile,
  options: { exclude?: string[] } = {},
): Exercise[] {
  const exclude = new Set(options.exclude ?? []);
  exclude.add(original.id);

  const pool = EXERCISES.filter((e) => !exclude.has(e.id));
  const ranked = rankExercises(pool, { user, profile });

  const authored = new Set(original.substitutions);
  return ranked
    .map((r) => ({
      exercise: r.exercise,
      value:
        similarity(original, r.exercise) +
        r.score * 0.5 +
        (authored.has(r.exercise.id) ? 20 : 0),
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value || a.exercise.id.localeCompare(b.exercise.id))
    .map((c) => c.exercise);
}

/**
 * Find a replacement for an exercise the user cannot or should not perform.
 * Returns null when nothing compatible exists, so callers can leave the slot
 * empty rather than prescribe something unsuitable.
 */
export function substitute(
  originalId: string,
  user: UserProfile,
  profile: EquipmentProfile,
  options: { exclude?: string[]; trigger?: 'restriction' | 'equipment' | 'preference' | 'manual' } = {},
): Substitution | null {
  const original = findExercise(originalId);
  if (!original) return null;

  const candidates = substitutionCandidates(original, user, profile, options);
  if (candidates.length === 0) return null;

  const replacement = candidates[0];
  return { exercise: replacement, reason: explainSubstitution(original, replacement, user, profile, options.trigger) };
}

/** Concise, non-diagnostic explanation of why a movement was swapped (spec 38). */
export function explainSubstitution(
  original: Exercise,
  replacement: Exercise,
  user: UserProfile,
  profile: EquipmentProfile,
  trigger?: 'restriction' | 'equipment' | 'preference' | 'manual',
): string {
  const eligibility = checkEligibility(original, user, profile);
  const samePattern = replacement.pattern === original.pattern;
  const tail = samePattern
    ? `${replacement.name} trains the same movement pattern.`
    : `${replacement.name} was selected to keep a similar training effect.`;

  if (trigger === 'preference') {
    return `Swapped out ${original.name} because you rated it poorly. ${tail}`;
  }
  if (trigger === 'manual') {
    return `You chose ${replacement.name} in place of ${original.name}.`;
  }
  if (!eligibility.allowed) {
    if (eligibility.clinician) {
      return `${original.name} was replaced because it conflicts with a restriction you marked as clinician-provided. ${tail}`;
    }
    return `${original.name} was replaced because ${eligibility.reason.charAt(0).toLowerCase()}${eligibility.reason.slice(1)} ${tail}`;
  }
  return `${original.name} was replaced. ${tail}`;
}
