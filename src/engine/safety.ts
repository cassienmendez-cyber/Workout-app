import type {
  Equipment,
  EquipmentProfile,
  Exercise,
  ExperienceLevel,
  LimitationLevel,
  MovementLimitation,
  UserProfile,
} from '../domain/types';

/**
 * Safety / Restriction Engine (spec 35, 36).
 *
 * This module is the single authority on whether a user may be shown an
 * exercise. It is intentionally conservative and never diagnoses anything:
 * it only maps the user's own declared limitations onto exercise metadata.
 *
 * Clinician-provided restrictions are absolute — no other engine may relax
 * them, and no preference, goal, or volume target can outrank them.
 */

export type Eligibility =
  | { allowed: true; modified: false }
  | { allowed: true; modified: true; reason: string }
  | { allowed: false; reason: string; clinician: boolean };

const EXPERIENCE_RANK: Record<ExperienceLevel, number> = {
  beginner: 1,
  intermediate: 2,
  advanced: 3,
};

/**
 * Some equipment implies other equipment. Adjustable dumbbells satisfy any
 * dumbbell requirement; a rack that holds a bar implies a barbell is present.
 */
const EQUIPMENT_IMPLIES: Partial<Record<Equipment, Equipment[]>> = {
  adjustable_dumbbell: ['dumbbell'],
  leg_press: ['machine'],
  smith_machine: ['rack'],
};

/** Expand a profile's equipment list with everything it implies. */
export function expandEquipment(equipment: Equipment[]): Set<Equipment> {
  const set = new Set<Equipment>(equipment);
  // Bodyweight is always available — the user always has their own body.
  set.add('bodyweight');
  for (const item of equipment) {
    for (const implied of EQUIPMENT_IMPLIES[item] ?? []) set.add(implied);
  }
  return set;
}

export function hasEquipmentFor(exercise: Exercise, profile: EquipmentProfile): boolean {
  const available = expandEquipment(profile.equipment);
  for (const required of exercise.requires) {
    if (!available.has(required)) return false;
  }
  if (exercise.anyOf.length > 0) {
    if (!exercise.anyOf.some((e) => available.has(e))) return false;
  }
  return true;
}

/** The strictest limitation level the user has declared for this exercise. */
function limitationFor(
  exercise: Exercise,
  limitations: MovementLimitation[],
): { level: LimitationLevel; tag: string | null; note?: string } {
  const rank: Record<LimitationLevel, number> = { none: 0, modify: 1, avoid: 2, clinician: 3 };
  let worst: { level: LimitationLevel; tag: string | null; note?: string } = {
    level: 'none',
    tag: null,
  };
  for (const limitation of limitations) {
    if (limitation.level === 'none') continue;
    if (!exercise.restrictionTags.includes(limitation.tag)) continue;
    if (rank[limitation.level] > rank[worst.level]) {
      worst = { level: limitation.level, tag: limitation.tag, note: limitation.note };
    }
  }
  return worst;
}

/**
 * Decide whether an exercise may be prescribed to this user right now.
 *
 * `modify` does not block the exercise outright — it flags it so the selector
 * can prefer an unrestricted alternative and, if none exists, still present
 * the movement with a visible note rather than leaving a pattern uncovered.
 */
export function checkEligibility(
  exercise: Exercise,
  user: UserProfile,
  profile: EquipmentProfile,
): Eligibility {
  if (!hasEquipmentFor(exercise, profile)) {
    return {
      allowed: false,
      reason: `Not available with your ${profile.name} equipment.`,
      clinician: false,
    };
  }

  const limitation = limitationFor(exercise, user.limitations);
  if (limitation.level === 'clinician') {
    return {
      allowed: false,
      reason: `Excluded by a restriction you marked as clinician-provided.`,
      clinician: true,
    };
  }
  if (limitation.level === 'avoid') {
    return {
      allowed: false,
      reason: `Excluded because you asked to avoid this movement type.`,
      clinician: false,
    };
  }

  // Exercises meaningfully above the user's experience are held back so the
  // programming stays executable, not aspirational.
  if (EXPERIENCE_RANK[exercise.minExperience] > EXPERIENCE_RANK[user.experience]) {
    return {
      allowed: false,
      reason: `Above your current experience level.`,
      clinician: false,
    };
  }

  if (limitation.level === 'modify') {
    return {
      allowed: true,
      modified: true,
      reason: `You asked to modify this movement type — reduce range of motion or load as needed.`,
    };
  }

  return { allowed: true, modified: false };
}

export function isEligible(
  exercise: Exercise,
  user: UserProfile,
  profile: EquipmentProfile,
): boolean {
  return checkEligibility(exercise, user, profile).allowed;
}

/**
 * Exercises the user can actually be shown, given limitations, equipment and
 * experience. Every selection path starts from this list.
 */
export function eligibleExercises(
  all: Exercise[],
  user: UserProfile,
  profile: EquipmentProfile,
): Exercise[] {
  return all.filter((e) => isEligible(e, user, profile));
}

export function activeProfile(user: UserProfile): EquipmentProfile {
  const found = user.equipmentProfiles.find((p) => p.id === user.activeProfileId);
  return found ?? user.equipmentProfiles[0];
}

/** Fixed safety copy shown wherever the app touches pain or injury (spec 36). */
export const SAFETY_DISCLAIMER =
  'This app is a fitness programming tool, not a medical device. It cannot diagnose injuries or ' +
  'tell you whether pain is safe. If something hurts, stop and speak to a qualified clinician.';
