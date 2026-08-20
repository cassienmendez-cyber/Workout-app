import { useState } from 'react';
import type { Workout } from '../../domain/types';
import { DIFFICULTY_LABELS } from '../../domain/types';
import { findExercise } from '../../data/exercises';
import { useStore } from '../../data/store';
import { totalTonnage } from '../../engine/volume';
import { formatDuration, formatLongDate, todayISO } from '../../lib/dates';
import { ConfirmSheet } from '../components/Primitives';
import { RescheduleSheet } from './Today';

/**
 * Workout detail and editing (spec 50, 52).
 *
 * Completed workouts stay editable. Because every statistic — PRs, graphs,
 * volume, future progression — is derived from the log rather than cached,
 * saving a correction here automatically recalculates all of them.
 */
export function WorkoutDetail({
  workout,
  onClose,
  onStart,
}: {
  workout: Workout;
  onClose: () => void;
  onStart: (workout: Workout) => void;
}): JSX.Element {
  const { state, dispatch } = useStore();
  const user = state.user!;
  const live = state.workouts.find((w) => w.id === workout.id) ?? workout;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Workout>(live);
  const [confirmSave, setConfirmSave] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const editable = live.status === 'completed';
  const shown = editing ? draft : live;
  const date = shown.actualDate ?? shown.plannedDate;

  const updateSet = (
    weId: string,
    setId: string,
    patch: { actualLoad?: number | null; actualReps?: number | null; completed?: boolean },
  ): void => {
    setDraft((d) => ({
      ...d,
      exercises: d.exercises.map((we) =>
        we.id !== weId
          ? we
          : {
              ...we,
              sets: we.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
            },
      ),
    }));
  };

  const completedSets = shown.exercises.reduce(
    (t, e) => t + e.sets.filter((s) => s.completed).length,
    0,
  );

  return (
    <div className="app">
      <div className="screen screen--full">
        <div className="row-between" style={{ marginBottom: 16 }}>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
            ‹ Back
          </button>
          {editable && !editing && (
            <button type="button" className="btn btn--sm" onClick={() => { setDraft(live); setEditing(true); }}>
              Edit
            </button>
          )}
          {editing && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => {
                setDraft(live);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          )}
        </div>

        <header className="screen-header" style={{ paddingTop: 0 }}>
          <p className="card-label" style={{ marginBottom: 4 }}>
            {formatLongDate(date)}
          </p>
          <h1 className="screen-title">{shown.slotLabel}</h1>
          <p className="screen-subtitle">
            {shown.status === 'completed'
              ? `${completedSets} sets · ${formatDuration(shown.durationSeconds ?? 0)}`
              : `${shown.exercises.length} exercises · ~${shown.estimatedMinutes} min`}
            {shown.edited && ' · edited'}
          </p>
        </header>

        {shown.status === 'completed' && (
          <div className="card card--flat" style={{ marginBottom: 16 }}>
            <div className="row-between">
              <span className="muted">Total volume</span>
              <span className="num">
                {totalTonnage(shown).toLocaleString()} {user.unit}
              </span>
            </div>
          </div>
        )}

        {shown.rescheduledFrom && (
          <div className="note" style={{ marginBottom: 16 }}>
            This session was moved from {shown.rescheduledFrom}. Rescheduling is not a missed
            workout — it counts exactly the same.
          </div>
        )}

        {shown.adaptations.length > 0 && (
          <>
            <h2 className="section">Why this workout looks like this</h2>
            <div className="card card--flat">
              {shown.adaptations.map((note, i) => (
                <p key={i} className="muted" style={{ margin: i === 0 ? 0 : '10px 0 0' }}>
                  {note}
                </p>
              ))}
            </div>
          </>
        )}

        <h2 className="section">Exercises</h2>
        <div className="stack">
          {shown.exercises.map((we) => {
            const exercise = findExercise(we.exerciseId);
            return (
              <div className="card" key={we.id}>
                <div className="row-between">
                  <strong>{exercise?.name}</strong>
                  {we.feedback && (
                    <span className="badge">{DIFFICULTY_LABELS[we.feedback.difficulty]}</span>
                  )}
                </div>
                <p className="tiny" style={{ margin: '5px 0 10px' }}>
                  Prescribed: {we.targetSets} × {we.targetRepRange.min}–{we.targetRepRange.max}
                  {we.targetLoad !== null && ` @ ${we.targetLoad} ${user.unit}`}
                </p>

                {we.substitutionReason && (
                  <div className="note" style={{ marginBottom: 10 }}>
                    {we.substitutionReason}
                  </div>
                )}

                {editing ? (
                  <>
                    <div className="set-head">
                      <span>Set</span>
                      <span>{user.unit}</span>
                      <span>Reps</span>
                      <span aria-hidden="true" />
                    </div>
                    {we.sets.map((set) => (
                      <div className="set-row" key={set.id}>
                        <span className="set-num">{set.setNumber}</span>
                        <input
                          className="set-input"
                          type="number"
                          inputMode="decimal"
                          aria-label={`Set ${set.setNumber} weight`}
                          value={set.actualLoad ?? ''}
                          onChange={(e) =>
                            updateSet(we.id, set.id, {
                              actualLoad: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                        <input
                          className="set-input"
                          type="number"
                          inputMode="numeric"
                          aria-label={`Set ${set.setNumber} reps`}
                          value={set.actualReps ?? ''}
                          onChange={(e) =>
                            updateSet(we.id, set.id, {
                              actualReps: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                        />
                        <button
                          type="button"
                          className="set-check"
                          aria-pressed={set.completed}
                          aria-label={`Set ${set.setNumber} counted`}
                          onClick={() => updateSet(we.id, set.id, { completed: !set.completed })}
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
                    ))}
                  </>
                ) : (
                  <div className="tiny">
                    {we.sets.filter((s) => s.completed).length === 0
                      ? 'Not logged'
                      : we.sets
                          .filter((s) => s.completed)
                          .map((s) => `${s.actualLoad ?? 0} × ${s.actualReps ?? 0}`)
                          .join('   ·   ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="stack" style={{ marginTop: 26 }}>
          {editing && (
            <button
              type="button"
              className="btn btn--primary btn--block btn--lg"
              onClick={() => setConfirmSave(true)}
            >
              Save changes
            </button>
          )}

          {!editing && shown.status === 'scheduled' && date === todayISO() && (
            <button
              type="button"
              className="btn btn--primary btn--block btn--lg"
              onClick={() => onStart(live)}
            >
              Start workout
            </button>
          )}

          {!editing && (shown.status === 'scheduled' || shown.status === 'rescheduled') && (
            <button
              type="button"
              className="btn btn--block"
              onClick={() => setRescheduleOpen(true)}
            >
              Move this workout
            </button>
          )}
        </div>
      </div>

      <ConfirmSheet
        open={confirmSave}
        title="Save these corrections?"
        confirmLabel="Save changes"
        onCancel={() => setConfirmSave(false)}
        onConfirm={() => {
          dispatch({ type: 'replaceWorkout', workout: draft });
          setConfirmSave(false);
          setEditing(false);
        }}
        body={
          <p className="muted">
            Your personal records, strength graphs, volume totals and future progression will be
            recalculated from the corrected numbers.
          </p>
        }
      />

      <RescheduleSheet
        open={rescheduleOpen}
        workout={live}
        onClose={() => setRescheduleOpen(false)}
        onPick={(newDate) => {
          dispatch({ type: 'reschedule', workoutId: live.id, date: newDate });
          setRescheduleOpen(false);
          onClose();
        }}
      />
    </div>
  );
}
