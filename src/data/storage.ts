import type { AppState } from '../domain/types';

/**
 * Data Layer (spec 68).
 *
 * Persistence is deliberately behind this thin module so the engine never
 * touches storage directly and the whole app can be swapped onto a different
 * backend later without changing any programming logic.
 *
 * Writes are synchronous to localStorage, which is what makes autosave
 * (spec 48) and Resume Workout survive the app being closed mid-set.
 */

const STORAGE_KEY = 'adaptive-strength.state.v1';
const CURRENT_VERSION = 1;

export const EMPTY_STATE: AppState = {
  user: null,
  workouts: [],
  metrics: [],
  achievements: [],
  explanations: [],
  version: CURRENT_VERSION,
};

function isStorageAvailable(): boolean {
  try {
    const probe = '__ast_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

/** In-memory fallback so the app still runs in private-mode browsers. */
let memoryState: AppState | null = null;

export function loadState(): AppState {
  if (!isStorageAvailable()) return memoryState ?? EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as AppState;
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_STATE;
    return migrate(parsed);
  } catch {
    // A corrupt payload must never brick the app; start clean instead.
    return EMPTY_STATE;
  }
}

export function saveState(state: AppState): void {
  if (!isStorageAvailable()) {
    memoryState = state;
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded: keep running from memory rather than losing the session.
    memoryState = state;
  }
}

export function clearState(): void {
  memoryState = null;
  if (isStorageAvailable()) window.localStorage.removeItem(STORAGE_KEY);
}

/** Forward-compatible shape fixes for states written by older versions. */
function migrate(state: AppState): AppState {
  const migrated: AppState = {
    ...EMPTY_STATE,
    ...state,
    workouts: state.workouts ?? [],
    metrics: state.metrics ?? [],
    achievements: state.achievements ?? [],
    explanations: state.explanations ?? [],
    version: CURRENT_VERSION,
  };
  return migrated;
}
