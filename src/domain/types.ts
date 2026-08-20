/**
 * Source-of-truth domain vocabulary for the adaptive training engine.
 *
 * Everything below is plain data. The engine modules are pure functions over
 * these shapes so that programming decisions stay deterministic and testable.
 */

/* ------------------------------------------------------------------ goals */

export type Goal =
  | 'fat_loss'
  | 'muscle_gain'
  | 'strength'
  | 'recomposition'
  | 'general_fitness'
  | 'muscular_endurance'
  | 'power'
  | 'muscle_retention';

export const GOALS: Goal[] = [
  'fat_loss',
  'muscle_gain',
  'strength',
  'recomposition',
  'general_fitness',
  'muscular_endurance',
  'power',
  'muscle_retention',
];

export const GOAL_LABELS: Record<Goal, string> = {
  fat_loss: 'Fat loss',
  muscle_gain: 'Muscle gain',
  strength: 'Strength',
  recomposition: 'Body recomposition',
  general_fitness: 'General fitness',
  muscular_endurance: 'Muscular endurance',
  power: 'Power',
  muscle_retention: 'Muscle retention while losing weight',
};

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

/* --------------------------------------------------------------- patterns */

export type LowerPattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'step_up'
  | 'knee_flexion'
  | 'hip_extension'
  | 'calf_raise';

export type UpperPattern =
  | 'horizontal_push'
  | 'horizontal_pull'
  | 'vertical_push'
  | 'vertical_pull'
  | 'shoulder_isolation'
  | 'arm_flexion'
  | 'arm_extension';

export type CorePattern =
  | 'anti_extension'
  | 'anti_rotation'
  | 'anti_lateral_flexion'
  | 'flexion'
  | 'rotation';

export type MovementPattern = LowerPattern | UpperPattern | CorePattern;

export const LOWER_PATTERNS: LowerPattern[] = [
  'squat',
  'hinge',
  'lunge',
  'step_up',
  'knee_flexion',
  'hip_extension',
  'calf_raise',
];

export const UPPER_PATTERNS: UpperPattern[] = [
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'shoulder_isolation',
  'arm_flexion',
  'arm_extension',
];

export const CORE_PATTERNS: CorePattern[] = [
  'anti_extension',
  'anti_rotation',
  'anti_lateral_flexion',
  'flexion',
  'rotation',
];

export const PATTERN_LABELS: Record<MovementPattern, string> = {
  squat: 'Squat / knee dominant',
  hinge: 'Hinge / hip dominant',
  lunge: 'Lunge',
  step_up: 'Step-up',
  knee_flexion: 'Knee flexion',
  hip_extension: 'Hip extension',
  calf_raise: 'Calf raise',
  horizontal_push: 'Horizontal push',
  horizontal_pull: 'Horizontal pull',
  vertical_push: 'Vertical push',
  vertical_pull: 'Vertical pull',
  shoulder_isolation: 'Shoulder isolation',
  arm_flexion: 'Arm flexion',
  arm_extension: 'Arm extension',
  anti_extension: 'Anti-extension',
  anti_rotation: 'Anti-rotation',
  anti_lateral_flexion: 'Anti-lateral flexion',
  flexion: 'Flexion',
  rotation: 'Rotation',
};

/** Anterior/posterior classification used by the 4+ day alternating split. */
export type Orientation = 'anterior' | 'posterior' | 'neutral';

export type Muscle =
  | 'quads'
  | 'glutes'
  | 'hamstrings'
  | 'calves'
  | 'adductors'
  | 'abductors'
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'lats'
  | 'mid_back'
  | 'traps'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lower_back'
  | 'hip_flexors';

export const MUSCLE_LABELS: Record<Muscle, string> = {
  quads: 'Quads',
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  adductors: 'Adductors',
  abductors: 'Abductors',
  chest: 'Chest',
  front_delts: 'Front delts',
  side_delts: 'Side delts',
  rear_delts: 'Rear delts',
  lats: 'Lats',
  mid_back: 'Mid back',
  traps: 'Traps',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  lower_back: 'Lower back',
  hip_flexors: 'Hip flexors',
};

/* -------------------------------------------------------------- equipment */

export type Equipment =
  | 'bodyweight'
  | 'barbell'
  | 'rack'
  | 'dumbbell'
  | 'adjustable_dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'leg_press'
  | 'cable'
  | 'smith_machine'
  | 'bands'
  | 'pull_up_bar'
  | 'bench'
  | 'box'
  | 'trx'
  | 'medicine_ball';

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  bodyweight: 'Bodyweight',
  barbell: 'Barbell',
  rack: 'Squat rack',
  dumbbell: 'Dumbbells',
  adjustable_dumbbell: 'Adjustable dumbbells',
  kettlebell: 'Kettlebells',
  machine: 'Machines',
  leg_press: 'Leg press',
  cable: 'Cable station',
  smith_machine: 'Smith machine',
  bands: 'Resistance bands',
  pull_up_bar: 'Pull-up bar',
  bench: 'Bench',
  box: 'Box / step',
  trx: 'Suspension trainer',
  medicine_ball: 'Medicine ball',
};

export interface EquipmentProfile {
  id: string;
  name: string;
  equipment: Equipment[];
  /** Smallest load increment available, in the user's unit. */
  loadIncrement: number;
}

export type Unit = 'kg' | 'lb';

/* ----------------------------------------------------------- restrictions */

/** Movement categories a limitation can apply to. */
export type RestrictionTag =
  | 'squatting'
  | 'lunging'
  | 'impact'
  | 'jumping'
  | 'overhead'
  | 'rotation'
  | 'bending'
  | 'loaded_flexion'
  | 'pushing'
  | 'pulling'
  | 'deep_knee_flexion'
  | 'grip';

export const RESTRICTION_LABELS: Record<RestrictionTag, string> = {
  squatting: 'Squatting',
  lunging: 'Lunging',
  impact: 'Impact',
  jumping: 'Jumping',
  overhead: 'Overhead movement',
  rotation: 'Rotation',
  bending: 'Bending',
  loaded_flexion: 'Loaded spinal flexion',
  pushing: 'Pushing',
  pulling: 'Pulling',
  deep_knee_flexion: 'Deep knee flexion',
  grip: 'Gripping',
};

/**
 * Limitation severity. `clinician` is the strongest: it is authored on behalf
 * of a healthcare provider and the engine may never relax it.
 */
export type LimitationLevel = 'none' | 'modify' | 'avoid' | 'clinician';

export interface MovementLimitation {
  tag: RestrictionTag;
  level: LimitationLevel;
  note?: string;
}

/* ---------------------------------------------------------- preference UX */

export type PreferenceRating = 'love' | 'like' | 'neutral' | 'dislike' | 'hate';

export const PREFERENCE_WEIGHT: Record<PreferenceRating, number> = {
  love: 12,
  like: 6,
  neutral: 0,
  dislike: -10,
  hate: -100,
};

/* ---------------------------------------------------------------- exercise */

export type ProgressionMethod =
  | 'double_progression'
  | 'load_only'
  | 'reps_only'
  | 'time'
  | 'bodyweight_reps';

export interface RepRange {
  min: number;
  max: number;
}

export interface Exercise {
  id: string;
  name: string;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  pattern: MovementPattern;
  orientation: Orientation;
  /** Every item here must be present in the active profile (AND). */
  requires: Equipment[];
  /** At least one item here must be present (OR). Empty means no constraint. */
  anyOf: Equipment[];
  minExperience: ExperienceLevel;
  /** 1 (trivial) – 5 (highly demanding technically). */
  difficulty: number;
  /** 1 (very stable, e.g. machine) – 5 (highly unstable). */
  stability: number;
  /** Joints under meaningful load; used with restriction tags. */
  jointDemands: ('knee' | 'hip' | 'lumbar' | 'shoulder' | 'elbow' | 'wrist' | 'ankle')[];
  repRange: RepRange;
  defaultSets: number;
  /** Goal suitability, 0–10. Absent goals score 5 by default. */
  goalSuitability: Partial<Record<Goal, number>>;
  /** Systemic cost, 1 (trivial) – 5 (very taxing). */
  fatigueRating: number;
  /** Restriction tags this exercise loads. */
  restrictionTags: RestrictionTag[];
  /** Hand-authored preferred substitutions (ids), best first. */
  substitutions: string[];
  progression: ProgressionMethod;
  unilateral: boolean;
  /** True for multi-joint movements. Drives the efficiency score. */
  compound: boolean;
  /** Short coaching cue shown in the logger. */
  cue?: string;
}

/* -------------------------------------------------------------- scheduling */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday = 0, matching Date#getDay

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

/** A slot in the rotating program, e.g. "Full Body A" or "Anterior 1". */
export interface SplitSlot {
  /** Stable index within the rotation. */
  index: number;
  label: string;
  kind: 'full_body' | 'anterior' | 'posterior';
  /** Patterns this slot should try to cover, in priority order. */
  patterns: MovementPattern[];
}

export type WorkoutStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'rescheduled';

export type WorkoutMode = 'full' | 'reduced' | 'minimum';

export type EnergyLevel = 'great' | 'normal' | 'tired' | 'exhausted' | 'unwell';

export const ENERGY_LABELS: Record<EnergyLevel, string> = {
  great: 'Great',
  normal: 'Normal',
  tired: 'Tired',
  exhausted: 'Exhausted',
  unwell: 'Not feeling well',
};

export type Difficulty = 'easy' | 'just_right' | 'difficult' | 'too_difficult';

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  just_right: 'Just right',
  difficult: 'Difficult',
  too_difficult: 'Too difficult',
};

/** Estimated reps-in-reserve implied by each difficulty rating. */
export const DIFFICULTY_RIR: Record<Difficulty, number> = {
  easy: 4,
  just_right: 2,
  difficult: 1,
  too_difficult: 0,
};

/* ----------------------------------------------------------------- records */

export interface WorkoutSet {
  id: string;
  setNumber: number;
  /** What the engine prescribed. Never overwritten by user entry. */
  targetReps: number;
  targetLoad: number | null;
  /** What the user actually did. */
  actualReps: number | null;
  actualLoad: number | null;
  completed: boolean;
  timestamp: string | null;
}

export interface ExerciseFeedback {
  difficulty: Difficulty;
  /** Optional detail captured after the exercise. */
  discomfort?: boolean;
  repsInReserve?: number;
  failedReps?: boolean;
  techniqueBreakdown?: boolean;
  note?: string;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  order: number;
  targetSets: number;
  targetRepRange: RepRange;
  /** Recommended load; null when the engine has no history to work from. */
  targetLoad: number | null;
  restSeconds: number;
  sets: WorkoutSet[];
  feedback: ExerciseFeedback | null;
  /** Priority 1 = never dropped in short mode; higher numbers drop first. */
  priority: number;
  /** Present when the substitution engine replaced the original selection. */
  substitutedFrom?: string;
  substitutionReason?: string;
  /** True when the user, not the engine, chose this exercise or load. */
  userOverride?: boolean;
  notes?: string;
}

export interface Workout {
  id: string;
  userId: string;
  /** ISO date (YYYY-MM-DD) the workout was originally planned for. */
  plannedDate: string;
  /** ISO date it actually happened / is now scheduled for. */
  actualDate: string | null;
  slotIndex: number;
  slotLabel: string;
  kind: SplitSlot['kind'];
  status: WorkoutStatus;
  mode: WorkoutMode;
  energy: EnergyLevel | null;
  exercises: WorkoutExercise[];
  estimatedMinutes: number;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  /** Human-readable notes about engine decisions for this workout. */
  adaptations: string[];
  /** Set when the workout was moved; points at the date it moved from. */
  rescheduledFrom?: string;
  notes?: string;
  /** Spec 52: preserve internally that historical data was corrected. */
  edited?: boolean;
  editedAt?: string;
  /** Audit trail of post-completion corrections. */
  editLog?: EditLogEntry[];
}

export interface EditLogEntry {
  at: string;
  field: string;
  from: string;
  to: string;
}

export interface ProgressMetric {
  id: string;
  date: string;
  bodyWeight?: number;
  waist?: number;
  hip?: number;
}

export type AchievementType =
  | 'first_workout'
  | 'workouts_10'
  | 'workouts_25'
  | 'workouts_50'
  | 'workouts_100'
  | 'first_pr'
  | 'prs_5'
  | 'prs_10'
  | 'consistency'
  | 'comeback';

export interface Achievement {
  id: string;
  type: AchievementType;
  earnedDate: string;
}

export interface PersonalRecord {
  exerciseId: string;
  /** Best estimated 1RM seen, and the set that produced it. */
  estimatedOneRepMax: number;
  load: number;
  reps: number;
  date: string;
  workoutId: string;
}

/* -------------------------------------------------------------------- user */

export type ThemePreference = 'system' | 'light' | 'dark';

export interface NotificationPreferences {
  enabled: boolean;
  haptics: boolean;
  restTimerAlert: boolean;
}

/** Spec 45: what a session must contain to count as completed. */
export interface CompletionCriteria {
  minCompletedExercises: number;
  minCompletedSets: number;
}

/**
 * Spec 42: an availability change the user has scheduled. Applying a change
 * only regenerates workouts on or after `effectiveFrom`, so past workouts and
 * any in-flight session are untouched.
 */
export interface AvailabilityChange {
  effectiveFrom: string;
  daysPerWeek: number;
  availableDays: Weekday[];
}

export interface UserProfile {
  id: string;
  name: string;
  primaryGoal: Goal;
  secondaryGoal: Goal | null;
  experience: ExperienceLevel;
  /** How many days per week the user says they can train (1–7). */
  daysPerWeek: number;
  availableDays: Weekday[];
  preferredDurationMinutes: number;
  equipmentProfiles: EquipmentProfile[];
  activeProfileId: string;
  limitations: MovementLimitation[];
  exercisePreferences: Record<string, PreferenceRating>;
  unit: Unit;
  theme: ThemePreference;
  notifications: NotificationPreferences;
  /** Spec 67: keep the screen awake while a workout is in progress. */
  keepScreenAwake: boolean;
  /** Spec 42: a future availability change awaiting its effective date. */
  pendingAvailabilityChange: AvailabilityChange | null;
  createdAt: string;
  onboardingComplete: boolean;
}

/* ------------------------------------------------------------- app state */

export interface AppState {
  user: UserProfile | null;
  workouts: Workout[];
  metrics: ProgressMetric[];
  achievements: Achievement[];
  /** Rolling record of engine explanations, newest first. */
  explanations: EngineExplanation[];
  version: number;
}

export interface EngineExplanation {
  id: string;
  date: string;
  scope: 'progression' | 'schedule' | 'substitution' | 'fatigue' | 'volume';
  message: string;
}
