import { useMemo, useState } from 'react';
import type { Workout } from '../../domain/types';
import { findExercise } from '../../data/exercises';
import { useStore } from '../../data/store';
import { consistency } from '../../engine/records';
import { assessFatigue } from '../../engine/fatigue';
import { addDays, formatLongDate, todayISO, weekdayOf, formatShortDate } from '../../lib/dates';
import { WEEKDAY_LABELS } from '../../domain/types';
import { Choice, Sheet } from '../components/Primitives';

/**
 * Today (spec 2, 47).
 *
 * The user opens the app and sees exactly one thing: what to do now. Every
 * other affordance is secondary to the Start Workout button.
 */
export function Today({
  onStart,
  onOpenWorkout,
}: {
  onStart: (workout: Workout) => void;
  onOpenWorkout: (workout: Workout) => void;
}): JSX.Element {
  const { state, dispatch, todayWorkout, resumable } = useStore();
  const user = state.user!;
  const today = todayISO();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const stats = useMemo(() => consistency(state.workouts), [state.workouts]);
  const fatigue = useMemo(() => assessFatigue(state.workouts, today), [state.workouts, today]);

  const upcoming = useMemo(
    () =>
      state.workouts
        .filter((w) => (w.actualDate ?? w.plannedDate) > today && w.status === 'scheduled')
        .sort((a, b) => (a.actualDate ?? a.plannedDate).localeCompare(b.actualDate ?? b.plannedDate))
        .slice(0, 3),
    [state.workouts, today],
  );

  const staleResume =
    resumable && (resumable.actualDate ?? resumable.plannedDate) !== today ? resumable : null;

  return (
    <div className="screen">
      <header className="screen-header">
        <p className="card-label" style={{ marginBottom: 4 }}>
          {formatLongDate(today)}
        </p>
        <h1 className="screen-title">
          {user.name ? `Hello, ${user.name}` : 'Today'}
        </h1>
      </header>

      {staleResume && (
        <div className="card" style={{ marginBottom: 14 }}>
          <p className="card-label">Unfinished session</p>
          <h2 className="card-title">{staleResume.slotLabel}</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Started {formatShortDate(staleResume.actualDate ?? staleResume.plannedDate)}. Pick up
            exactly where you stopped.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            style={{ marginTop: 14 }}
            onClick={() => onStart(staleResume)}
          >
            Resume workout
          </button>
        </div>
      )}

      {todayWorkout ? (
        <TodayCard workout={todayWorkout} onStart={onStart} onOpen={onOpenWorkout} />
      ) : (
        <RestDayCard nextWorkout={upcoming[0] ?? null} />
      )}

      {todayWorkout && todayWorkout.status !== 'completed' && (
        <button
          type="button"
          className="btn btn--ghost btn--block"
          style={{ marginTop: 10 }}
          onClick={() => setRescheduleOpen(true)}
        >
          Can't work out today
        </button>
      )}

      {fatigue.index >= 0.7 && (
        <div className="note note--warning" style={{ marginTop: 16 }}>
          <strong>Backing off this week.</strong>{' '}
          {fatigue.reasons[0] ?? 'Your recent load suggests you need more recovery.'} Volume has
          been reduced automatically.
        </div>
      )}

      <h2 className="section">Consistency</h2>
      <div className="card">
        <div className="row-between">
          <div>
            <span className="num" style={{ fontSize: 32 }}>
              {stats.adherence}%
            </span>
            <p className="muted" style={{ margin: '2px 0 0' }}>
              schedule adherence
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span className="num" style={{ fontSize: 20 }}>
              {stats.totalCompleted}
            </span>
            <p className="tiny" style={{ margin: 0 }}>
              workouts done
            </p>
          </div>
        </div>
        {stats.plannedRecent > 0 && (
          <p className="tiny" style={{ marginTop: 12 }}>
            {stats.completedRecent} of your last {stats.plannedRecent} planned workouts completed.
          </p>
        )}
      </div>

      {upcoming.length > 0 && (
        <>
          <h2 className="section">Coming up</h2>
          <div className="card">
            {upcoming.map((workout) => (
              <button
                key={workout.id}
                type="button"
                className="list-item"
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  font: 'inherit',
                  color: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
                onClick={() => onOpenWorkout(workout)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>{workout.slotLabel}</div>
                  <div className="tiny">
                    {WEEKDAY_LABELS[weekdayOf(workout.actualDate ?? workout.plannedDate)]} ·{' '}
                    {workout.exercises.length} exercises · ~{workout.estimatedMinutes} min
                  </div>
                </div>
                <span className="badge">
                  {formatShortDate(workout.actualDate ?? workout.plannedDate)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {state.explanations.length > 0 && (
        <>
          <h2 className="section">What changed</h2>
          <div className="card card--flat">
            {state.explanations.slice(0, 3).map((exp) => (
              <p key={exp.id} className="muted" style={{ margin: '0 0 10px' }}>
                {exp.message}
              </p>
            ))}
          </div>
        </>
      )}

      <RescheduleSheet
        open={rescheduleOpen}
        workout={todayWorkout}
        onClose={() => setRescheduleOpen(false)}
        onPick={(date) => {
          if (!todayWorkout) return;
          dispatch({ type: 'reschedule', workoutId: todayWorkout.id, date });
          setRescheduleOpen(false);
        }}
        onSkip={() => {
          if (!todayWorkout) return;
          dispatch({ type: 'skip', workoutId: todayWorkout.id });
          setRescheduleOpen(false);
        }}
      />
    </div>
  );
}

function TodayCard({
  workout,
  onStart,
  onOpen,
}: {
  workout: Workout;
  onStart: (workout: Workout) => void;
  onOpen: (workout: Workout) => void;
}): JSX.Element {
  if (workout.status === 'completed') {
    return (
      <div className="card">
        <p className="card-label">Today · complete</p>
        <h2 className="card-title">{workout.slotLabel}</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          Nicely done. Your next session is already planned.
        </p>
        <button
          type="button"
          className="btn btn--block"
          style={{ marginTop: 14 }}
          onClick={() => onOpen(workout)}
        >
          View summary
        </button>
      </div>
    );
  }

  const preview = workout.exercises.slice(0, 6);

  return (
    <div className="card card--accent">
      <p className="card-label">
        Today{workout.status === 'in_progress' ? ' · in progress' : ''}
      </p>
      <h2 className="card-title" style={{ fontSize: 27 }}>
        {workout.slotLabel}
      </h2>
      <p className="muted" style={{ marginTop: 6, fontSize: 15 }}>
        {workout.kind === 'full_body'
          ? 'Full body'
          : workout.kind === 'anterior'
            ? 'Anterior focus'
            : 'Posterior focus'}{' '}
        · ~{workout.estimatedMinutes} min · {workout.exercises.length} exercises
      </p>

      <ul style={{ margin: '16px 0 0', padding: 0, listStyle: 'none' }}>
        {preview.map((we) => {
          const exercise = findExercise(we.exerciseId);
          return (
            <li
              key={we.id}
              style={{
                padding: '7px 0',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                fontSize: 15,
              }}
            >
              <span>{exercise?.name}</span>
              <span style={{ opacity: 0.82, whiteSpace: 'nowrap' }}>
                {we.targetSets} × {we.targetRepRange.min}–{we.targetRepRange.max}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="btn btn--block btn--lg"
        style={{
          marginTop: 18,
          background: 'var(--accent-contrast)',
          color: 'var(--accent-strong)',
          borderColor: 'transparent',
        }}
        onClick={() => onStart(workout)}
      >
        {workout.status === 'in_progress' ? 'Resume workout' : 'Start workout'}
      </button>
    </div>
  );
}

function RestDayCard({ nextWorkout }: { nextWorkout: Workout | null }): JSX.Element {
  return (
    <div className="card">
      <p className="card-label">Today</p>
      <h2 className="card-title">Rest day</h2>
      <p className="muted" style={{ marginTop: 8 }}>
        Recovery is when the training actually pays off. Nothing to do today.
      </p>
      {nextWorkout && (
        <p className="tiny" style={{ marginTop: 12 }}>
          Next up: {nextWorkout.slotLabel} on{' '}
          {formatShortDate(nextWorkout.actualDate ?? nextWorkout.plannedDate)}.
        </p>
      )}
    </div>
  );
}

/** "When can you train next?" (spec 40). */
export function RescheduleSheet({
  open,
  workout,
  onClose,
  onPick,
  onSkip,
}: {
  open: boolean;
  workout: Workout | null;
  onClose: () => void;
  onPick: (date: string) => void;
  onSkip?: () => void;
}): JSX.Element {
  const { state } = useStore();
  const user = state.user!;
  const today = todayISO();
  const [customDate, setCustomDate] = useState('');

  const options = useMemo(() => {
    const list: { date: string; label: string; preferred: boolean }[] = [];
    for (let i = 1; i <= 9; i++) {
      const date = addDays(today, i);
      list.push({
        date,
        label:
          i === 1
            ? 'Tomorrow'
            : `${WEEKDAY_LABELS[weekdayOf(date)]}, ${formatShortDate(date)}`,
        preferred: user.availableDays.includes(weekdayOf(date)),
      });
    }
    return list;
  }, [today, user.availableDays]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="When can you train next?"
      subtitle="We will move this session and rebuild the schedule around it. Nothing you have already done will change."
    >
      <div className="stack" style={{ marginTop: 12 }}>
        {options.map((option) => (
          <Choice
            key={option.date}
            title={option.label}
            description={option.preferred ? 'One of your usual training days' : undefined}
            selected={false}
            onClick={() => onPick(option.date)}
          />
        ))}

        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor="reschedule-date">Or pick a date</label>
          <input
            id="reschedule-date"
            type="date"
            min={addDays(today, 1)}
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
          />
        </div>
        {customDate && (
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => onPick(customDate)}
          >
            Move to {formatShortDate(customDate)}
          </button>
        )}

        {onSkip && workout && (
          <button type="button" className="btn btn--ghost btn--block" onClick={onSkip}>
            Just skip this one
          </button>
        )}
      </div>
    </Sheet>
  );
}
