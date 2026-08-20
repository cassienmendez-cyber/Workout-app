import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  Difficulty,
  EnergyLevel,
  Workout,
  WorkoutExercise,
  WorkoutMode,
} from '../../domain/types';
import {
  DIFFICULTY_LABELS,
  ENERGY_LABELS,
} from '../../domain/types';
import { findExercise, getExercise } from '../../data/exercises';
import { useStore } from '../../data/store';
import { activeProfile } from '../../engine/safety';
import { substitutionCandidates } from '../../engine/substitution';
import { adaptRest } from '../../engine/prescription';
import { formatDuration } from '../../lib/dates';
import { Chip, Choice, ConfirmSheet, Sheet, haptic, useWakeLock } from '../components/Primitives';
import { RestTimer } from '../components/RestTimer';

/**
 * Workout interface (spec 46–49, 51).
 *
 * Deliberately spare: exercise, prescribed load, target sets and reps, big
 * inputs, four difficulty buttons, an automatic rest timer. The user never
 * configures sets, ranges, rest or progression — those arrive already decided,
 * and can be overridden but never have to be.
 */

type Phase = 'energy' | 'logging' | 'summary';

export function WorkoutLogger({
  workout,
  onExit,
  onSubmitted,
}: {
  workout: Workout;
  onExit: () => void;
  onSubmitted: (workout: Workout) => void;
}): JSX.Element {
  const { state, dispatch } = useStore();
  const user = state.user!;
  const [phase, setPhase] = useState<Phase>(workout.status === 'in_progress' ? 'logging' : 'energy');
  const [current, setCurrent] = useState(0);
  const [rest, setRest] = useState<{ seconds: number; startedAt: number } | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [substituting, setSubstituting] = useState<WorkoutExercise | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<WorkoutExercise | null>(null);
  const [showTimeSheet, setShowTimeSheet] = useState(false);

  useWakeLock(user.keepScreenAwake && phase === 'logging');

  // Live workout comes from the store so autosave and edits stay in sync.
  const live = state.workouts.find((w) => w.id === workout.id) ?? workout;
  const startRef = useRef<number>(
    live.startedAt ? new Date(live.startedAt).getTime() : Date.now(),
  );

  const exercise = live.exercises[current];
  const totalSets = live.exercises.reduce((t, e) => t + e.sets.length, 0);
  const doneSets = live.exercises.reduce(
    (t, e) => t + e.sets.filter((s) => s.completed).length,
    0,
  );

  if (phase === 'energy') {
    return (
      <EnergyCheck
        workout={live}
        onStart={(energy, mode) => {
          if (mode !== live.mode) dispatch({ type: 'setMode', workoutId: live.id, mode });
          dispatch({ type: 'startWorkout', workoutId: live.id, energy });
          startRef.current = Date.now();
          setPhase('logging');
        }}
        onCancel={onExit}
      />
    );
  }

  if (phase === 'summary') {
    return (
      <SubmitSummary
        workout={live}
        elapsedSeconds={Math.round((Date.now() - startRef.current) / 1000)}
        onBack={() => setPhase('logging')}
        onConfirm={() => setConfirmSubmit(true)}
        confirmOpen={confirmSubmit}
        onCancelConfirm={() => setConfirmSubmit(false)}
        onSubmit={() => {
          const durationSeconds = Math.round((Date.now() - startRef.current) / 1000);
          dispatch({ type: 'submitWorkout', workoutId: live.id, durationSeconds });
          haptic(user.notifications.haptics, [40, 30, 90]);
          onSubmitted({ ...live, status: 'completed', durationSeconds });
        }}
      />
    );
  }

  const currentExercise = exercise ? findExercise(exercise.exerciseId) : null;

  return (
    <div className="app">
      <div className="screen screen--full" style={{ paddingBottom: rest ? 110 : 24 }}>
        <div className="row-between" style={{ marginBottom: 14 }}>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onExit}>
            Save &amp; exit
          </button>
          <span className="badge">{live.slotLabel}</span>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setShowTimeSheet(true)}
          >
            Less time
          </button>
        </div>

        <div className="bar" style={{ marginBottom: 6 }}>
          <div style={{ width: `${totalSets > 0 ? (doneSets / totalSets) * 100 : 0}%` }} />
        </div>
        <p className="tiny" style={{ marginBottom: 18 }}>
          {doneSets} of {totalSets} sets · exercise {current + 1} of {live.exercises.length}
        </p>

        {exercise && currentExercise && (
          <ExerciseCard
            key={exercise.id}
            workout={live}
            workoutExercise={exercise}
            onSetComplete={(restSeconds) => {
              haptic(user.notifications.haptics);
              setRest({ seconds: restSeconds, startedAt: Date.now() });
            }}
            onSubstitute={() => setSubstituting(exercise)}
          />
        )}

        <div className="stack" style={{ marginTop: 22 }}>
          {exercise && !exercise.feedback && exercise.sets.some((s) => s.completed) && (
            <button
              type="button"
              className="btn btn--block"
              onClick={() => setFeedbackFor(exercise)}
            >
              Rate how that felt
            </button>
          )}

          {current < live.exercises.length - 1 ? (
            <button
              type="button"
              className="btn btn--primary btn--block btn--lg"
              onClick={() => {
                if (exercise && !exercise.feedback && exercise.sets.some((s) => s.completed)) {
                  setFeedbackFor(exercise);
                  return;
                }
                setCurrent((c) => c + 1);
                setRest(null);
                window.scrollTo({ top: 0 });
              }}
            >
              Next exercise
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--block btn--lg"
              onClick={() => {
                if (exercise && !exercise.feedback && exercise.sets.some((s) => s.completed)) {
                  setFeedbackFor(exercise);
                  return;
                }
                setPhase('summary');
              }}
            >
              Finish workout
            </button>
          )}

          {current > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => {
                setCurrent((c) => c - 1);
                setRest(null);
              }}
            >
              Previous exercise
            </button>
          )}
        </div>

        <div className="chip-row" style={{ marginTop: 22, justifyContent: 'center' }}>
          {live.exercises.map((we, i) => {
            const complete = we.sets.every((s) => s.completed);
            return (
              <Chip key={we.id} small selected={i === current} onClick={() => setCurrent(i)}>
                {complete ? '✓ ' : ''}
                {i + 1}
              </Chip>
            );
          })}
        </div>
      </div>

      {rest && (
        <RestTimer
          seconds={rest.seconds}
          startedAt={rest.startedAt}
          haptics={user.notifications.haptics}
          alert={user.notifications.restTimerAlert}
          onDismiss={() => setRest(null)}
          onSkip={() => setRest(null)}
        />
      )}

      <FeedbackSheet
        workoutExercise={feedbackFor}
        onClose={() => setFeedbackFor(null)}
        onSave={(difficulty, extra) => {
          if (!feedbackFor) return;
          dispatch({
            type: 'setFeedback',
            workoutId: live.id,
            workoutExerciseId: feedbackFor.id,
            feedback: { difficulty, ...extra },
          });
          setFeedbackFor(null);
        }}
      />

      <SubstituteSheet
        workout={live}
        workoutExercise={substituting}
        onClose={() => setSubstituting(null)}
        onPick={(exerciseId) => {
          if (!substituting) return;
          dispatch({
            type: 'substitute',
            workoutId: live.id,
            workoutExerciseId: substituting.id,
            exerciseId,
          });
          setSubstituting(null);
        }}
      />

      <Sheet
        open={showTimeSheet}
        onClose={() => setShowTimeSheet(false)}
        title="I have less time today"
        subtitle="We will keep the movements that matter most. A shorter session still counts as completed."
      >
        <div className="stack" style={{ marginTop: 12 }}>
          {(['full', 'reduced', 'minimum'] as WorkoutMode[]).map((mode) => (
            <Choice
              key={mode}
              title={
                mode === 'full' ? 'Full session' : mode === 'reduced' ? 'Reduced' : 'Minimum'
              }
              description={
                mode === 'full'
                  ? 'Everything as planned'
                  : mode === 'reduced'
                    ? 'Drop the lowest-priority movements'
                    : 'The essentials only, around 10–15 minutes'
              }
              selected={live.mode === mode}
              onClick={() => {
                dispatch({ type: 'setMode', workoutId: live.id, mode });
                setCurrent(0);
                setShowTimeSheet(false);
              }}
            />
          ))}
        </div>
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------ energy check */

function EnergyCheck({
  workout,
  onStart,
  onCancel,
}: {
  workout: Workout;
  onStart: (energy: EnergyLevel, mode: WorkoutMode) => void;
  onCancel: () => void;
}): JSX.Element {
  const [energy, setEnergy] = useState<EnergyLevel>('normal');
  const [mode, setMode] = useState<WorkoutMode>(workout.mode);

  return (
    <div className="app">
      <div className="screen screen--full">
        <header className="screen-header">
          <h1 className="screen-title">How are you feeling?</h1>
          <p className="screen-subtitle">
            We will adjust today's volume to match. This never cancels your workout.
          </p>
        </header>

        <div className="stack">
          {(Object.keys(ENERGY_LABELS) as EnergyLevel[]).map((level) => (
            <Choice
              key={level}
              title={ENERGY_LABELS[level]}
              selected={energy === level}
              onClick={() => setEnergy(level)}
            />
          ))}
        </div>

        {(energy === 'exhausted' || energy === 'unwell') && (
          <div className="note note--warning" style={{ marginTop: 16 }}>
            {energy === 'unwell'
              ? 'If you are unwell, resting is a legitimate choice. If you do train, we have trimmed the session.'
              : 'We have reduced today’s volume. Showing up for a shorter session still counts.'}
          </div>
        )}

        <h2 className="section">Session length</h2>
        <div className="chip-row">
          {(['full', 'reduced', 'minimum'] as WorkoutMode[]).map((m) => (
            <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>
              {m === 'full' ? 'Full' : m === 'reduced' ? 'Reduced' : 'Minimum'}
            </Chip>
          ))}
        </div>

        <div className="stack" style={{ marginTop: 28 }}>
          <button
            type="button"
            className="btn btn--primary btn--block btn--lg"
            onClick={() => onStart(energy, mode)}
          >
            Start workout
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={onCancel}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- exercise card */

function ExerciseCard({
  workout,
  workoutExercise,
  onSetComplete,
  onSubstitute,
}: {
  workout: Workout;
  workoutExercise: WorkoutExercise;
  onSetComplete: (restSeconds: number) => void;
  onSubstitute: () => void;
}): JSX.Element {
  const { state, dispatch } = useStore();
  const user = state.user!;
  const exercise = getExercise(workoutExercise.exerciseId);
  const isTimed = exercise.progression === 'time';
  // Bodyweight and timed work legitimately carry no load; everything else
  // needs a weight before the set means anything for progression or PRs.
  const needsLoad =
    exercise.progression !== 'time' && exercise.progression !== 'bodyweight_reps';
  const loadInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [loadPrompt, setLoadPrompt] = useState<string | null>(null);

  return (
    <div className="card">
      <div className="exercise-head">
        <div>
          <h2 className="card-title">{exercise.name}</h2>
          <p className="muted" style={{ margin: '5px 0 0' }}>
            {workoutExercise.targetSets} sets ·{' '}
            {workoutExercise.targetRepRange.min}–{workoutExercise.targetRepRange.max}{' '}
            {isTimed ? 'seconds' : 'reps'}
            {workoutExercise.targetLoad !== null && ` · ${workoutExercise.targetLoad} ${user.unit}`}
          </p>
        </div>
        <button type="button" className="btn btn--sm" onClick={onSubstitute}>
          Swap
        </button>
      </div>

      {workoutExercise.substitutionReason && (
        <div className="note" style={{ marginTop: 12 }}>
          {workoutExercise.substitutionReason}
        </div>
      )}

      {exercise.cue && (
        <p className="tiny" style={{ marginTop: 10 }}>
          {exercise.cue}
        </p>
      )}

      {workoutExercise.targetLoad === null && (
        <div className="note" style={{ marginTop: 12 }}>
          First time logging this — pick a weight you could manage for a couple more reps than the
          target. We will take it from there.
        </div>
      )}

      <div className="set-head" style={{ marginTop: 18 }}>
        <span>Set</span>
        <span>{user.unit}</span>
        <span>{isTimed ? 'Secs' : 'Reps'}</span>
        <span aria-hidden="true" />
      </div>

      {workoutExercise.sets.map((set) => {
        const lastDifficulty = workoutExercise.feedback?.difficulty ?? null;
        const restSeconds = adaptRest(workoutExercise.restSeconds, lastDifficulty);
        return (
          <div className="set-row" key={set.id}>
            <span className="set-num">{set.setNumber}</span>
            <input
              className="set-input"
              type="number"
              inputMode="decimal"
              ref={(el) => {
                loadInputs.current[set.id] = el;
              }}
              aria-label={`Set ${set.setNumber} weight`}
              placeholder={
                workoutExercise.targetLoad !== null ? String(workoutExercise.targetLoad) : '—'
              }
              value={set.actualLoad ?? ''}
              onChange={(e) => {
                if (e.target.value !== '') setLoadPrompt(null);
                dispatch({
                  type: 'logSet',
                  workoutId: workout.id,
                  workoutExerciseId: workoutExercise.id,
                  setId: set.id,
                  reps: set.actualReps,
                  load: e.target.value === '' ? null : Number(e.target.value),
                  completed: set.completed,
                });
              }}
            />
            <input
              className="set-input"
              type="number"
              inputMode="numeric"
              aria-label={`Set ${set.setNumber} ${isTimed ? 'seconds' : 'reps'}`}
              placeholder={String(set.targetReps)}
              value={set.actualReps ?? ''}
              onChange={(e) =>
                dispatch({
                  type: 'logSet',
                  workoutId: workout.id,
                  workoutExerciseId: workoutExercise.id,
                  setId: set.id,
                  reps: e.target.value === '' ? null : Number(e.target.value),
                  load: set.actualLoad,
                  completed: set.completed,
                })
              }
            />
            <button
              type="button"
              className="set-check"
              aria-pressed={set.completed}
              aria-label={`Mark set ${set.setNumber} complete`}
              onClick={() => {
                const nowComplete = !set.completed;
                const resolvedLoad = set.actualLoad ?? workoutExercise.targetLoad;
                // Completing a loaded movement with no weight recorded would
                // put a meaningless set into history, so ask for it first.
                if (nowComplete && needsLoad && resolvedLoad === null) {
                  setLoadPrompt(set.id);
                  loadInputs.current[set.id]?.focus();
                  return;
                }
                dispatch({
                  type: 'logSet',
                  workoutId: workout.id,
                  workoutExerciseId: workoutExercise.id,
                  setId: set.id,
                  // Completing with blank fields falls back to the target, so
                  // the common case needs no typing at all (spec 66).
                  reps: set.actualReps ?? (nowComplete ? set.targetReps : null),
                  load: set.actualLoad ?? (nowComplete ? workoutExercise.targetLoad : null),
                  completed: nowComplete,
                });
                if (nowComplete) onSetComplete(restSeconds);
              }}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                <path
                  d="M5 13l4 4L19 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        );
      })}

      {loadPrompt !== null && (
        <div className="note note--warning" style={{ marginTop: 12 }}>
          Enter the weight you used for this set first — it is what your next session is built from.
        </div>
      )}

      <div className="row" style={{ marginTop: 14, gap: 8 }}>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() =>
            dispatch({
              type: 'addSet',
              workoutId: workout.id,
              workoutExerciseId: workoutExercise.id,
            })
          }
        >
          Add set
        </button>
        {workoutExercise.sets.length > 1 && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() =>
              dispatch({
                type: 'removeSet',
                workoutId: workout.id,
                workoutExerciseId: workoutExercise.id,
              })
            }
          >
            Remove set
          </button>
        )}
        <span className="spacer" />
        <span className="tiny">Rest {workoutExercise.restSeconds}s</span>
      </div>

      {workoutExercise.feedback && (
        <p className="tiny" style={{ marginTop: 12 }}>
          Rated: {DIFFICULTY_LABELS[workoutExercise.feedback.difficulty]}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------- feedback sheet */

function FeedbackSheet({
  workoutExercise,
  onClose,
  onSave,
}: {
  workoutExercise: WorkoutExercise | null;
  onClose: () => void;
  onSave: (difficulty: Difficulty, extra: Partial<{ discomfort: boolean; failedReps: boolean; techniqueBreakdown: boolean }>) => void;
}): JSX.Element {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [discomfort, setDiscomfort] = useState(false);
  const [failedReps, setFailedReps] = useState(false);
  const [technique, setTechnique] = useState(false);

  useEffect(() => {
    if (workoutExercise) {
      setDifficulty(workoutExercise.feedback?.difficulty ?? null);
      setDiscomfort(workoutExercise.feedback?.discomfort ?? false);
      setFailedReps(workoutExercise.feedback?.failedReps ?? false);
      setTechnique(workoutExercise.feedback?.techniqueBreakdown ?? false);
    }
  }, [workoutExercise]);

  const exercise = workoutExercise ? findExercise(workoutExercise.exerciseId) : null;

  return (
    <Sheet
      open={workoutExercise !== null}
      onClose={onClose}
      title="How did that feel?"
      subtitle={exercise?.name}
    >
      <div className="stack" style={{ marginTop: 12 }}>
        {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((level) => (
          <Choice
            key={level}
            title={DIFFICULTY_LABELS[level]}
            description={
              level === 'easy'
                ? 'Could have done several more reps'
                : level === 'just_right'
                  ? 'A couple of reps left in the tank'
                  : level === 'difficult'
                    ? 'Maybe one more rep'
                    : 'Nothing left, or had to stop'
            }
            selected={difficulty === level}
            onClick={() => setDifficulty(level)}
          />
        ))}

        <h2 className="section" style={{ marginBottom: 6 }}>
          Anything else? (optional)
        </h2>
        <div className="chip-row">
          <Chip small selected={failedReps} onClick={() => setFailedReps(!failedReps)}>
            A rep failed
          </Chip>
          <Chip small selected={technique} onClick={() => setTechnique(!technique)}>
            Technique broke down
          </Chip>
          <Chip small selected={discomfort} onClick={() => setDiscomfort(!discomfort)}>
            Pain or discomfort
          </Chip>
        </div>

        {discomfort && (
          <div className="note note--warning">
            Noted — we will factor this into your programming. This app cannot tell you whether pain
            is safe. If it persists, please speak to a qualified clinician.
          </div>
        )}

        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          disabled={difficulty === null}
          onClick={() =>
            difficulty &&
            onSave(difficulty, {
              discomfort,
              failedReps,
              techniqueBreakdown: technique,
            })
          }
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------ substitution sheet */

function SubstituteSheet({
  workout,
  workoutExercise,
  onClose,
  onPick,
}: {
  workout: Workout;
  workoutExercise: WorkoutExercise | null;
  onClose: () => void;
  onPick: (exerciseId: string) => void;
}): JSX.Element {
  const { state } = useStore();
  const user = state.user!;

  const candidates = useMemo(() => {
    if (!workoutExercise) return [];
    const original = findExercise(workoutExercise.exerciseId);
    if (!original) return [];
    return substitutionCandidates(original, user, activeProfile(user), {
      exclude: workout.exercises.map((we) => we.exerciseId),
    }).slice(0, 8);
  }, [workoutExercise, user, workout.exercises]);

  const original = workoutExercise ? findExercise(workoutExercise.exerciseId) : null;

  return (
    <Sheet
      open={workoutExercise !== null}
      onClose={onClose}
      title="Swap this exercise"
      subtitle={
        original
          ? `Alternatives that train the same pattern with your available equipment.`
          : undefined
      }
    >
      <div className="stack" style={{ marginTop: 12 }}>
        {candidates.length === 0 && (
          <p className="muted">
            No compatible alternative is available with your current equipment and limitations.
          </p>
        )}
        {candidates.map((candidate) => (
          <Choice
            key={candidate.id}
            title={candidate.name}
            description={`${candidate.compound ? 'Compound' : 'Isolation'} · ${candidate.primaryMuscles
              .slice(0, 2)
              .join(', ')
              .replace(/_/g, ' ')}`}
            selected={false}
            onClick={() => onPick(candidate.id)}
          />
        ))}
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------------- submit screen */

function SubmitSummary({
  workout,
  elapsedSeconds,
  onBack,
  onConfirm,
  confirmOpen,
  onCancelConfirm,
  onSubmit,
}: {
  workout: Workout;
  elapsedSeconds: number;
  onBack: () => void;
  onConfirm: () => void;
  confirmOpen: boolean;
  onCancelConfirm: () => void;
  onSubmit: () => void;
}): JSX.Element {
  const { dispatch } = useStore();
  const completedSets = workout.exercises.reduce(
    (t, e) => t + e.sets.filter((s) => s.completed).length,
    0,
  );
  const workedExercises = workout.exercises.filter((e) =>
    e.sets.some((s) => s.completed),
  ).length;

  return (
    <div className="app">
      <div className="screen screen--full">
        <header className="screen-header">
          <h1 className="screen-title">Ready to submit?</h1>
          <p className="screen-subtitle">Check this over before it goes into your history.</p>
        </header>

        <div className="card">
          <p className="card-label">{workout.slotLabel}</p>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <span className="muted">Duration</span>
            <span className="num">{formatDuration(elapsedSeconds)}</span>
          </div>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <span className="muted">Exercises</span>
            <span className="num">
              {workedExercises} of {workout.exercises.length}
            </span>
          </div>
          <div className="row-between">
            <span className="muted">Sets completed</span>
            <span className="num">{completedSets}</span>
          </div>
        </div>

        <h2 className="section">What you did</h2>
        <div className="card">
          {workout.exercises.map((we) => {
            const exercise = findExercise(we.exerciseId);
            const done = we.sets.filter((s) => s.completed);
            return (
              <div className="list-item" key={we.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>{exercise?.name}</div>
                  <div className="tiny">
                    {done.length === 0
                      ? 'Not logged'
                      : done
                          .map((s) => `${s.actualLoad ?? 0}×${s.actualReps ?? 0}`)
                          .join('  ·  ')}
                  </div>
                </div>
                {we.feedback && (
                  <span className="badge">{DIFFICULTY_LABELS[we.feedback.difficulty]}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="stack" style={{ marginTop: 26 }}>
          <button
            type="button"
            className="btn btn--primary btn--block btn--lg"
            onClick={onConfirm}
            disabled={completedSets === 0}
          >
            Submit as completed
          </button>
          <button type="button" className="btn btn--block" onClick={onBack}>
            Back to workout
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => dispatch({ type: 'saveAndExit', workoutId: workout.id })}
          >
            Save &amp; exit — finish later
          </button>
        </div>

        {completedSets === 0 && (
          <p className="tiny" style={{ marginTop: 12, textAlign: 'center' }}>
            Log at least one set before submitting.
          </p>
        )}
      </div>

      <ConfirmSheet
        open={confirmOpen}
        title="Submit this workout as completed?"
        confirmLabel="Submit as completed"
        cancelLabel="Cancel"
        onCancel={onCancelConfirm}
        onConfirm={onSubmit}
        body={
          <>
            <div className="card card--flat">
              <div className="row-between">
                <span className="muted">{workout.slotLabel}</span>
                <span className="num">{formatDuration(elapsedSeconds)}</span>
              </div>
              <div className="row-between" style={{ marginTop: 8 }}>
                <span className="muted">
                  {workedExercises} exercises · {completedSets} sets
                </span>
              </div>
            </div>
            <p className="muted">
              This adds the workout to your history and updates your future programming. You can
              still edit it afterwards.
            </p>
          </>
        }
      />
    </div>
  );
}
