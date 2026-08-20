import { useEffect, useMemo, useState } from 'react';
import type { Achievement, Workout } from '../src/domain/types';
import { StoreProvider, useStore } from './data/store';
import { Onboarding } from './ui/screens/Onboarding';
import { Today } from './ui/screens/Today';
import { Calendar } from './ui/screens/Calendar';
import { Progress } from './ui/screens/Progress';
import { Settings } from './ui/screens/Settings';
import { WorkoutLogger } from './ui/screens/WorkoutLogger';
import { WorkoutDetail } from './ui/screens/WorkoutDetail';
import { Celebration } from './ui/screens/Celebration';
import { TabBar, type TabKey } from './ui/components/TabBar';
import { prsFromWorkout, type PRResult } from './engine/records';

/**
 * App shell.
 *
 * Navigation is a plain state machine rather than a router: the app has four
 * tabs and two full-screen modes (logging a workout, viewing one), which keeps
 * the whole surface reachable one-handed without a routing dependency.
 */

type View =
  | { kind: 'tabs' }
  | { kind: 'logging'; workoutId: string }
  | { kind: 'detail'; workoutId: string };

function Shell(): JSX.Element {
  const { state } = useStore();
  const [tab, setTab] = useState<TabKey>('today');
  const [view, setView] = useState<View>({ kind: 'tabs' });
  const [celebration, setCelebration] = useState<{
    workout: Workout;
    prs: PRResult[];
    achievements: Achievement[];
  } | null>(null);

  // Apply the theme choice to the document root (spec 66).
  useEffect(() => {
    const theme = state.user?.theme ?? 'system';
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [state.user?.theme]);

  const activeWorkout = useMemo(() => {
    if (view.kind === 'tabs') return null;
    return state.workouts.find((w) => w.id === view.workoutId) ?? null;
  }, [view, state.workouts]);

  if (!state.user?.onboardingComplete) {
    return <Onboarding />;
  }

  if (view.kind === 'logging' && activeWorkout) {
    return (
      <>
        <WorkoutLogger
          workout={activeWorkout}
          onExit={() => setView({ kind: 'tabs' })}
          onSubmitted={(submitted) => {
            // Read PRs and achievements against the state as it now stands.
            const all = [...state.workouts.filter((w) => w.id !== submitted.id), submitted];
            const prs = prsFromWorkout(submitted, all);
            const before = new Set(state.achievements.map((a) => a.id));
            setView({ kind: 'tabs' });
            setTab('today');
            setCelebration({
              workout: submitted,
              prs,
              achievements: state.achievements.filter((a) => !before.has(a.id)),
            });
          }}
        />
        {celebration && (
          <Celebration
            workout={celebration.workout}
            prs={celebration.prs}
            achievements={celebration.achievements}
            onDone={() => setCelebration(null)}
          />
        )}
      </>
    );
  }

  if (view.kind === 'detail' && activeWorkout) {
    return (
      <WorkoutDetail
        workout={activeWorkout}
        onClose={() => setView({ kind: 'tabs' })}
        onStart={(workout) => setView({ kind: 'logging', workoutId: workout.id })}
      />
    );
  }

  return (
    <div className="app">
      {tab === 'today' && (
        <Today
          onStart={(workout) => setView({ kind: 'logging', workoutId: workout.id })}
          onOpenWorkout={(workout) => setView({ kind: 'detail', workoutId: workout.id })}
        />
      )}
      {tab === 'calendar' && (
        <Calendar
          onOpenWorkout={(workout) => setView({ kind: 'detail', workoutId: workout.id })}
          onStartWorkout={(workout) => setView({ kind: 'logging', workoutId: workout.id })}
        />
      )}
      {tab === 'progress' && <Progress />}
      {tab === 'settings' && <Settings />}

      <TabBar active={tab} onChange={setTab} />

      {celebration && (
        <Celebration
          workout={celebration.workout}
          prs={celebration.prs}
          achievements={celebration.achievements}
          onDone={() => setCelebration(null)}
        />
      )}
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
