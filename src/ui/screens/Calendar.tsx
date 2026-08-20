import { useMemo, useState } from 'react';
import type { Workout, WorkoutStatus } from '../../domain/types';
import { useStore } from '../../data/store';
import { findExercise } from '../../data/exercises';
import {
  addDays,
  formatLongDate,
  fromISODate,
  toISODate,
  todayISO,
} from '../../lib/dates';
import { Sheet } from '../components/Primitives';

/**
 * Interactive calendar (spec 53–55).
 *
 * Every date is tappable, including rest days. Skipped sessions are shown in a
 * neutral grey — visible, but never treated as a failure state (spec 55).
 */

const STATUS_LABEL: Record<WorkoutStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  in_progress: 'In progress',
  rescheduled: 'Rescheduled',
  skipped: 'Skipped',
};

export function Calendar({
  onOpenWorkout,
  onStartWorkout,
}: {
  onOpenWorkout: (workout: Workout) => void;
  onStartWorkout: (workout: Workout) => void;
}): JSX.Element {
  const { state } = useStore();
  const today = todayISO();
  const [monthAnchor, setMonthAnchor] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, Workout>();
    for (const workout of state.workouts) {
      const date = workout.actualDate ?? workout.plannedDate;
      const existing = map.get(date);
      // A completed session always wins the day over a stale scheduled one.
      if (!existing || rank(workout.status) > rank(existing.status)) map.set(date, workout);
    }
    return map;
  }, [state.workouts]);

  const days = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);
  const monthLabel = fromISODate(`${monthAnchor}-01`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const selectedWorkout = selected ? (byDate.get(selected) ?? null) : null;

  return (
    <div className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Calendar</h1>
        <p className="screen-subtitle">Tap any day to see what is planned or what you did.</p>
      </header>

      <div className="row-between" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => setMonthAnchor(shiftMonth(monthAnchor, -1))}
          aria-label="Previous month"
        >
          ‹
        </button>
        <strong>{monthLabel}</strong>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => setMonthAnchor(shiftMonth(monthAnchor, 1))}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="cal-grid" role="grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => (
          <div className="cal-weekday" key={i}>
            {label}
          </div>
        ))}
        {days.map((date, i) => {
          if (date === null) return <div className="cal-day empty" key={`empty-${i}`} />;
          const workout = byDate.get(date);
          const classes = ['cal-day'];
          if (workout) classes.push(workout.status);
          if (date === today) classes.push('today');
          return (
            <button
              key={date}
              type="button"
              className={classes.join(' ')}
              onClick={() => setSelected(date)}
              aria-label={`${formatLongDate(date)}${workout ? `, ${STATUS_LABEL[workout.status]}` : ', rest day'}`}
            >
              <span>{Number(date.slice(8))}</span>
              {workout && <span className="cal-dot" />}
            </button>
          );
        })}
      </div>

      <div className="legend">
        <LegendItem className="completed" label="Completed" />
        <LegendItem className="scheduled" label="Scheduled" />
        <LegendItem className="in_progress" label="In progress" />
        <LegendItem className="skipped" label="Skipped" />
        <LegendItem className="" label="Rest" />
      </div>

      <DayDetail
        date={selected}
        workout={selectedWorkout}
        onClose={() => setSelected(null)}
        onOpenWorkout={(w) => {
          setSelected(null);
          onOpenWorkout(w);
        }}
        onStartWorkout={(w) => {
          setSelected(null);
          onStartWorkout(w);
        }}
      />
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }): JSX.Element {
  return (
    <span className="legend-item">
      <span className={`legend-swatch cal-day ${className}`} style={{ aspectRatio: 'auto' }} />
      {label}
    </span>
  );
}

function DayDetail({
  date,
  workout,
  onClose,
  onOpenWorkout,
  onStartWorkout,
}: {
  date: string | null;
  workout: Workout | null;
  onClose: () => void;
  onOpenWorkout: (workout: Workout) => void;
  onStartWorkout: (workout: Workout) => void;
}): JSX.Element {
  const today = todayISO();

  return (
    <Sheet
      open={date !== null}
      onClose={onClose}
      title={date ? formatLongDate(date) : ''}
      subtitle={workout ? STATUS_LABEL[workout.status] : 'Rest day'}
    >
      <div className="stack" style={{ marginTop: 14 }}>
        {!workout && (
          <>
            <p className="muted">
              No training planned. Rest days are part of the program — this is when the adaptation
              you trained for actually happens.
            </p>
          </>
        )}

        {workout && (
          <>
            <div className="card card--flat">
              <div className="row-between">
                <strong>{workout.slotLabel}</strong>
                <span className="badge">{STATUS_LABEL[workout.status]}</span>
              </div>
              <p className="tiny" style={{ margin: '8px 0 0' }}>
                {workout.exercises.length} exercises · ~{workout.estimatedMinutes} min
                {workout.rescheduledFrom && ` · moved from ${workout.rescheduledFrom}`}
                {workout.edited && ' · edited'}
              </p>
            </div>

            <div className="card">
              {workout.exercises.map((we) => {
                const exercise = findExercise(we.exerciseId);
                const done = we.sets.filter((s) => s.completed);
                return (
                  <div className="list-item" key={we.id}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 650 }}>{exercise?.name}</div>
                      <div className="tiny">
                        {workout.status === 'completed' && done.length > 0
                          ? done.map((s) => `${s.actualLoad ?? 0}×${s.actualReps ?? 0}`).join('  ·  ')
                          : `${we.targetSets} × ${we.targetRepRange.min}–${we.targetRepRange.max}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {workout.status === 'scheduled' && (date ?? '') === today && (
              <button
                type="button"
                className="btn btn--primary btn--block btn--lg"
                onClick={() => onStartWorkout(workout)}
              >
                Start workout
              </button>
            )}

            <button type="button" className="btn btn--block" onClick={() => onOpenWorkout(workout)}>
              {workout.status === 'completed' ? 'View and edit' : 'Open workout'}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

function rank(status: WorkoutStatus): number {
  switch (status) {
    case 'completed':
      return 5;
    case 'in_progress':
      return 4;
    case 'rescheduled':
      return 3;
    case 'scheduled':
      return 2;
    case 'skipped':
      return 1;
  }
}

/** Monday-first month grid, padded with nulls. */
function buildMonthGrid(month: string): (string | null)[] {
  const first = fromISODate(`${month}-01`);
  const startDay = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();

  const cells: (string | null)[] = Array.from({ length: startDay }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toISODate(new Date(first.getFullYear(), first.getMonth(), day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function shiftMonth(month: string, delta: number): string {
  const date = fromISODate(`${month}-01`);
  date.setMonth(date.getMonth() + delta);
  return toISODate(date).slice(0, 7);
}

export { addDays };
