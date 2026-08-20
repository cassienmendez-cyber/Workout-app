import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type {
  AppState,
  EnergyLevel,
  ExerciseFeedback,
  PreferenceRating,
  ProgressMetric,
  UserProfile,
  Weekday,
  Workout,
  WorkoutMode,
} from '../domain/types';
import { EMPTY_STATE, loadState, saveState } from './storage';
import { applyMode, generateWorkout } from '../engine/generator';
import {
  applyAvailabilityChange,
  regenerateSchedule,
  rescheduleWorkout,
  skipWorkout,
} from '../engine/scheduling';
import { evaluateAchievements } from '../engine/records';
import { substitute } from '../engine/substitution';
import { activeProfile } from '../engine/safety';
import { buildSplit } from '../engine/split';
import { todayISO } from '../lib/dates';
import { uid } from '../lib/uid';

/**
 * Application store.
 *
 * Every mutation runs through this reducer and is persisted immediately, which
 * is what delivers autosave (spec 48) and Resume Workout. The reducer holds no
 * programming logic of its own — it delegates to the engine modules so the
 * rules stay in one testable place (spec 69).
 */

type Action =
  | { type: 'hydrate'; state: AppState }
  | { type: 'completeOnboarding'; user: UserProfile }
  | { type: 'updateUser'; patch: Partial<UserProfile> }
  | { type: 'startWorkout'; workoutId: string; energy: EnergyLevel | null }
  | { type: 'setMode'; workoutId: string; mode: WorkoutMode }
  | {
      type: 'logSet';
      workoutId: string;
      workoutExerciseId: string;
      setId: string;
      reps: number | null;
      load: number | null;
      completed: boolean;
    }
  | { type: 'addSet'; workoutId: string; workoutExerciseId: string }
  | { type: 'removeSet'; workoutId: string; workoutExerciseId: string }
  | {
      type: 'setFeedback';
      workoutId: string;
      workoutExerciseId: string;
      feedback: ExerciseFeedback;
    }
  | { type: 'substitute'; workoutId: string; workoutExerciseId: string; exerciseId?: string }
  | { type: 'saveAndExit'; workoutId: string }
  | { type: 'submitWorkout'; workoutId: string; durationSeconds: number }
  | { type: 'replaceWorkout'; workout: Workout }
  | { type: 'reschedule'; workoutId: string; date: string }
  | { type: 'skip'; workoutId: string }
  | { type: 'changeAvailability'; daysPerWeek: number; days: Weekday[]; effectiveFrom: string }
  | { type: 'ratePreference'; exerciseId: string; rating: PreferenceRating }
  | { type: 'addMetric'; metric: ProgressMetric }
  | { type: 'removeMetric'; id: string }
  | { type: 'ensureSchedule' }
  | { type: 'reset' };

function withWorkout(
  state: AppState,
  workoutId: string,
  update: (workout: Workout) => Workout,
): AppState {
  return {
    ...state,
    workouts: state.workouts.map((w) => (w.id === workoutId ? update(w) : w)),
  };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.state;

    case 'reset':
      return EMPTY_STATE;

    case 'completeOnboarding': {
      const user = { ...action.user, onboardingComplete: true };
      const workouts = regenerateSchedule({ user, existing: [], from: todayISO() });
      return { ...state, user, workouts };
    }

    case 'updateUser': {
      if (!state.user) return state;
      const user = { ...state.user, ...action.patch };
      // Changes that alter programming regenerate the future only.
      const programmingChanged =
        action.patch.primaryGoal !== undefined ||
        action.patch.secondaryGoal !== undefined ||
        action.patch.experience !== undefined ||
        action.patch.activeProfileId !== undefined ||
        action.patch.equipmentProfiles !== undefined ||
        action.patch.limitations !== undefined ||
        action.patch.preferredDurationMinutes !== undefined;

      if (!programmingChanged) return { ...state, user };
      return {
        ...state,
        user,
        workouts: regenerateSchedule({ user, existing: state.workouts, from: todayISO() }),
      };
    }

    case 'ensureSchedule': {
      if (!state.user) return state;
      const today = todayISO();
      const hasFuture = state.workouts.some(
        (w) => w.status === 'scheduled' && (w.actualDate ?? w.plannedDate) >= today,
      );
      if (hasFuture) return state;
      return {
        ...state,
        workouts: regenerateSchedule({ user: state.user, existing: state.workouts, from: today }),
      };
    }

    case 'startWorkout':
      return withWorkout(state, action.workoutId, (w) => ({
        ...w,
        status: 'in_progress',
        energy: action.energy,
        startedAt: w.startedAt ?? new Date().toISOString(),
        actualDate: w.actualDate ?? todayISO(),
      }));

    case 'setMode':
      return withWorkout(state, action.workoutId, (w) => applyMode(w, action.mode));

    case 'logSet':
      return withWorkout(state, action.workoutId, (w) => ({
        ...w,
        exercises: w.exercises.map((we) =>
          we.id !== action.workoutExerciseId
            ? we
            : {
                ...we,
                sets: we.sets.map((s) =>
                  s.id !== action.setId
                    ? s
                    : {
                        ...s,
                        actualReps: action.reps,
                        actualLoad: action.load,
                        completed: action.completed,
                        timestamp: action.completed ? new Date().toISOString() : null,
                      },
                ),
              },
        ),
      }));

    case 'addSet':
      return withWorkout(state, action.workoutId, (w) => ({
        ...w,
        exercises: w.exercises.map((we) => {
          if (we.id !== action.workoutExerciseId) return we;
          const last = we.sets[we.sets.length - 1];
          return {
            ...we,
            targetSets: we.targetSets + 1,
            userOverride: true,
            sets: [
              ...we.sets,
              {
                id: uid('set'),
                setNumber: we.sets.length + 1,
                targetReps: last?.targetReps ?? we.targetRepRange.min,
                targetLoad: we.targetLoad,
                actualReps: null,
                actualLoad: null,
                completed: false,
                timestamp: null,
              },
            ],
          };
        }),
      }));

    case 'removeSet':
      return withWorkout(state, action.workoutId, (w) => ({
        ...w,
        exercises: w.exercises.map((we) => {
          if (we.id !== action.workoutExerciseId || we.sets.length <= 1) return we;
          return {
            ...we,
            targetSets: we.targetSets - 1,
            userOverride: true,
            sets: we.sets.slice(0, -1),
          };
        }),
      }));

    case 'setFeedback':
      return withWorkout(state, action.workoutId, (w) => ({
        ...w,
        exercises: w.exercises.map((we) =>
          we.id === action.workoutExerciseId ? { ...we, feedback: action.feedback } : we,
        ),
      }));

    case 'substitute': {
      if (!state.user) return state;
      const user = state.user;
      const profile = activeProfile(user);
      return withWorkout(state, action.workoutId, (w) => {
        const target = w.exercises.find((we) => we.id === action.workoutExerciseId);
        if (!target) return w;
        const exclude = w.exercises.map((we) => we.exerciseId);

        const replacement = action.exerciseId
          ? { exercise: undefined, reason: '' }
          : substitute(target.exerciseId, user, profile, { exclude, trigger: 'manual' });

        const newId = action.exerciseId ?? replacement?.exercise?.id;
        if (!newId) return w;

        const reason =
          action.exerciseId !== undefined
            ? 'You chose this alternative yourself.'
            : (replacement?.reason ?? '');

        return {
          ...w,
          exercises: w.exercises.map((we) =>
            we.id !== action.workoutExerciseId
              ? we
              : {
                  ...we,
                  exerciseId: newId,
                  substitutedFrom: we.substitutedFrom ?? we.exerciseId,
                  substitutionReason: reason,
                  userOverride: true,
                  // A different movement means the old load no longer applies.
                  targetLoad: null,
                  sets: we.sets.map((s) => ({ ...s, targetLoad: null, actualLoad: null })),
                },
          ),
        };
      });
    }

    case 'saveAndExit':
      // Spec 49: saving keeps the session In Progress, never Completed.
      return withWorkout(state, action.workoutId, (w) => ({ ...w, status: 'in_progress' }));

    case 'submitWorkout': {
      if (!state.user) return state;
      const submitted = state.workouts.map((w) =>
        w.id !== action.workoutId
          ? w
          : {
              ...w,
              status: 'completed' as const,
              actualDate: w.actualDate ?? todayISO(),
              completedAt: new Date().toISOString(),
              durationSeconds: action.durationSeconds,
            },
      );
      const fresh = evaluateAchievements(submitted, state.achievements, todayISO());
      // Regenerate only what comes after today, leaving history untouched.
      const workouts = regenerateSchedule({
        user: state.user,
        existing: submitted,
        from: todayISO(),
      });
      return { ...state, workouts, achievements: [...state.achievements, ...fresh] };
    }

    case 'replaceWorkout': {
      // Post-completion editing (spec 50, 52): the corrected workout replaces
      // the old one and everything derived from it recomputes on read.
      const workouts = state.workouts.map((w) =>
        w.id === action.workout.id
          ? { ...action.workout, edited: true, editedAt: new Date().toISOString() }
          : w,
      );
      return { ...state, workouts };
    }

    case 'reschedule': {
      if (!state.user) return state;
      const result = rescheduleWorkout(state.user, state.workouts, action.workoutId, action.date);
      return {
        ...state,
        workouts: result.workouts,
        explanations: [
          { id: uid('exp'), date: todayISO(), scope: 'schedule' as const, message: result.message },
          ...state.explanations,
        ].slice(0, 50),
      };
    }

    case 'skip': {
      if (!state.user) return state;
      const result = skipWorkout(state.user, state.workouts, action.workoutId);
      return {
        ...state,
        workouts: result.workouts,
        explanations: [
          { id: uid('exp'), date: todayISO(), scope: 'schedule' as const, message: result.message },
          ...state.explanations,
        ].slice(0, 50),
      };
    }

    case 'changeAvailability': {
      if (!state.user) return state;
      const result = applyAvailabilityChange(
        state.user,
        state.workouts,
        action.daysPerWeek,
        action.days,
        action.effectiveFrom,
      );
      return {
        ...state,
        user: result.user,
        workouts: result.workouts,
        explanations: [
          { id: uid('exp'), date: todayISO(), scope: 'schedule' as const, message: result.message },
          ...state.explanations,
        ].slice(0, 50),
      };
    }

    case 'ratePreference': {
      if (!state.user) return state;
      const user: UserProfile = {
        ...state.user,
        exercisePreferences: {
          ...state.user.exercisePreferences,
          [action.exerciseId]: action.rating,
        },
      };
      return {
        ...state,
        user,
        workouts: regenerateSchedule({ user, existing: state.workouts, from: todayISO() }),
      };
    }

    case 'addMetric':
      return {
        ...state,
        metrics: [...state.metrics.filter((m) => m.date !== action.metric.date), action.metric].sort(
          (a, b) => a.date.localeCompare(b.date),
        ),
      };

    case 'removeMetric':
      return { ...state, metrics: state.metrics.filter((m) => m.id !== action.id) };

    default:
      return state;
  }
}

interface StoreValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  /** Today's session, if one is scheduled or already underway. */
  todayWorkout: Workout | null;
  /** A session left in progress on an earlier day, for Resume Workout. */
  resumable: Workout | null;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, dispatch] = useReducer(reducer, EMPTY_STATE);

  // Hydrate once on mount.
  useEffect(() => {
    dispatch({ type: 'hydrate', state: loadState() });
  }, []);

  // Autosave on every change (spec 48).
  useEffect(() => {
    if (state === EMPTY_STATE) return;
    saveState(state);
  }, [state]);

  // Keep a live schedule without ever touching history.
  useEffect(() => {
    if (state.user?.onboardingComplete) dispatch({ type: 'ensureSchedule' });
  }, [state.user?.onboardingComplete, state.user?.id]);

  const today = todayISO();

  const todayWorkout = useMemo(() => {
    const onToday = state.workouts.filter((w) => (w.actualDate ?? w.plannedDate) === today);
    return (
      onToday.find((w) => w.status === 'in_progress') ??
      onToday.find((w) => w.status === 'scheduled' || w.status === 'rescheduled') ??
      onToday.find((w) => w.status === 'completed') ??
      null
    );
  }, [state.workouts, today]);

  const resumable = useMemo(
    () => state.workouts.find((w) => w.status === 'in_progress') ?? null,
    [state.workouts],
  );

  const value = useMemo(
    () => ({ state, dispatch, todayWorkout, resumable }),
    [state, todayWorkout, resumable],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

/** The signed-in user, asserted non-null for screens behind onboarding. */
export function useUser(): UserProfile {
  const { state } = useStore();
  if (!state.user) throw new Error('No user profile');
  return state.user;
}

/** Generate a fresh session for a date outside the normal schedule. */
export function useGenerateFor(): (date: string, cycleIndex?: number) => Workout {
  const { state } = useStore();
  return useCallback(
    (date: string, cycleIndex = 0) => {
      if (!state.user) throw new Error('No user profile');
      const split = buildSplit(state.user.daysPerWeek);
      return generateWorkout({
        user: state.user,
        slot: split[cycleIndex % split.length],
        date,
        history: state.workouts,
      });
    },
    [state.user, state.workouts],
  );
}
