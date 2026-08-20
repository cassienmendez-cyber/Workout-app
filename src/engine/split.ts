import type { MovementPattern, SplitSlot } from '../domain/types';

/**
 * Split construction (spec 14–17).
 *
 * 1–3 days  → complementary full-body sessions (A / A-B / A-B-C).
 * 4+ days   → alternating anterior- and posterior-focused sessions.
 *
 * The pattern lists below are *priorities*, not a fixed workout. The generator
 * walks them in order and stops once it has enough exercises, so the same slot
 * produces a different session as equipment, recovery and fatigue change.
 */

/** Full-body A: squat-led, horizontal push/pull. */
const FULL_BODY_A: MovementPattern[] = [
  'squat',
  'horizontal_push',
  'horizontal_pull',
  'hinge',
  'anti_extension',
  'shoulder_isolation',
];

/** Full-body B: hinge-led, vertical push/pull. */
const FULL_BODY_B: MovementPattern[] = [
  'hinge',
  'vertical_pull',
  'vertical_push',
  'lunge',
  'anti_rotation',
  'arm_flexion',
];

/** Full-body C: unilateral-led, fills the remaining patterns. */
const FULL_BODY_C: MovementPattern[] = [
  'lunge',
  'horizontal_pull',
  'horizontal_push',
  'hip_extension',
  'knee_flexion',
  'anti_lateral_flexion',
];

/** Anterior: quads, chest, front/side delts, triceps, anterior core. */
const ANTERIOR_A: MovementPattern[] = [
  'squat',
  'horizontal_push',
  'vertical_push',
  'lunge',
  'shoulder_isolation',
  'arm_extension',
  'anti_extension',
];

const ANTERIOR_B: MovementPattern[] = [
  'lunge',
  'vertical_push',
  'horizontal_push',
  'step_up',
  'arm_extension',
  'shoulder_isolation',
  'flexion',
];

/** Posterior: hamstrings, glutes, back, rear delts, biceps. */
const POSTERIOR_A: MovementPattern[] = [
  'hinge',
  'horizontal_pull',
  'vertical_pull',
  'knee_flexion',
  'arm_flexion',
  'shoulder_isolation',
  'anti_rotation',
];

const POSTERIOR_B: MovementPattern[] = [
  'hip_extension',
  'vertical_pull',
  'horizontal_pull',
  'hinge',
  'calf_raise',
  'arm_flexion',
  'anti_lateral_flexion',
];

const FULL_BODY_ROTATIONS: MovementPattern[][] = [FULL_BODY_A, FULL_BODY_B, FULL_BODY_C];
const ANTERIOR_ROTATIONS: MovementPattern[][] = [ANTERIOR_A, ANTERIOR_B];
const POSTERIOR_ROTATIONS: MovementPattern[][] = [POSTERIOR_A, POSTERIOR_B];

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/**
 * Build the rotating list of session templates for a given weekly frequency.
 * The returned array is the full cycle; the scheduler walks it repeatedly.
 */
export function buildSplit(daysPerWeek: number): SplitSlot[] {
  const days = Math.max(1, Math.min(7, Math.round(daysPerWeek)));

  if (days <= 3) {
    return Array.from({ length: days }, (_, i) => ({
      index: i,
      label: days === 1 ? 'Full Body' : `Full Body ${LETTERS[i]}`,
      kind: 'full_body' as const,
      patterns: FULL_BODY_ROTATIONS[i % FULL_BODY_ROTATIONS.length],
    }));
  }

  // 4+ days: alternate anterior / posterior across the whole cycle.
  const slots: SplitSlot[] = [];
  let anteriorCount = 0;
  let posteriorCount = 0;
  for (let i = 0; i < days; i++) {
    const isAnterior = i % 2 === 0;
    if (isAnterior) {
      slots.push({
        index: i,
        label: `Anterior ${LETTERS[anteriorCount]}`,
        kind: 'anterior',
        patterns: ANTERIOR_ROTATIONS[anteriorCount % ANTERIOR_ROTATIONS.length],
      });
      anteriorCount++;
    } else {
      slots.push({
        index: i,
        label: `Posterior ${LETTERS[posteriorCount]}`,
        kind: 'posterior',
        patterns: POSTERIOR_ROTATIONS[posteriorCount % POSTERIOR_ROTATIONS.length],
      });
      posteriorCount++;
    }
  }
  return slots;
}

/**
 * Patterns that must be covered across a full week regardless of split, used
 * by the weekly-balance check in the generator.
 */
export const ESSENTIAL_WEEKLY_PATTERNS: MovementPattern[] = [
  'squat',
  'hinge',
  'horizontal_push',
  'horizontal_pull',
];
