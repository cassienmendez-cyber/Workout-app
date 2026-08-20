import type {
  EquipmentProfile,
  UserProfile,
  Weekday,
} from '../domain/types';
import { uid } from '../lib/uid';
import { todayISO } from '../lib/dates';

/** Starter equipment profiles offered during onboarding (spec 10, 65). */
export const PRESET_PROFILES: Omit<EquipmentProfile, 'id'>[] = [
  {
    name: 'Full Gym',
    equipment: [
      'bodyweight',
      'barbell',
      'rack',
      'dumbbell',
      'adjustable_dumbbell',
      'kettlebell',
      'machine',
      'leg_press',
      'cable',
      'smith_machine',
      'bands',
      'pull_up_bar',
      'bench',
      'box',
      'medicine_ball',
    ],
    loadIncrement: 2.5,
  },
  {
    name: 'Home',
    equipment: ['bodyweight', 'adjustable_dumbbell', 'dumbbell', 'bands', 'bench', 'pull_up_bar'],
    loadIncrement: 2,
  },
  {
    name: 'Travel',
    equipment: ['bodyweight', 'bands'],
    loadIncrement: 1,
  },
];

export function makeEquipmentProfile(preset: Omit<EquipmentProfile, 'id'>): EquipmentProfile {
  return { ...preset, id: uid('eq') };
}

/**
 * A complete, valid user. Onboarding overwrites these fields one screen at a
 * time, so the app always has something coherent to generate from.
 */
export function makeDefaultUser(overrides: Partial<UserProfile> = {}): UserProfile {
  const profiles = PRESET_PROFILES.map(makeEquipmentProfile);
  return {
    id: uid('user'),
    name: '',
    primaryGoal: 'general_fitness',
    secondaryGoal: null,
    experience: 'beginner',
    daysPerWeek: 3,
    availableDays: [1, 3, 5] as Weekday[],
    preferredDurationMinutes: 45,
    equipmentProfiles: profiles,
    activeProfileId: profiles[0].id,
    limitations: [],
    exercisePreferences: {},
    unit: 'lb',
    theme: 'system',
    notifications: { enabled: true, haptics: true, restTimerAlert: true },
    keepScreenAwake: true,
    pendingAvailabilityChange: null,
    createdAt: todayISO(),
    onboardingComplete: false,
    ...overrides,
  };
}

/** Suggested weekday sets per training frequency, offered in onboarding. */
export const SUGGESTED_DAYS: Record<number, Weekday[]> = {
  1: [3],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};
