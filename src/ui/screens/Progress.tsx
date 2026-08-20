import { useMemo, useState } from 'react';
import type { Muscle, ProgressMetric } from '../../domain/types';
import { MUSCLE_LABELS } from '../../domain/types';
import { findExercise } from '../../data/exercises';
import { useStore } from '../../data/store';
import { computePRs, consistency, ACHIEVEMENT_META } from '../../engine/records';
import { coverageRatio, totalTonnage } from '../../engine/volume';
import { estimatedOneRepMax } from '../../engine/progression';
import { addDays, formatShortDate, startOfWeek, todayISO } from '../../lib/dates';
import { LineChart, BarChart, type Point } from '../components/Charts';
import { Sheet, Stepper, Chip } from '../components/Primitives';
import { uid } from '../../lib/uid';

/**
 * Progress tracking (spec 60–62).
 *
 * Everything on this screen is derived from the workout log on each render, so
 * an edit to a historical session updates every graph immediately (spec 61).
 */

type Tab = 'strength' | 'body' | 'volume' | 'coverage';

export function Progress(): JSX.Element {
  const { state, dispatch } = useStore();
  const user = state.user!;
  const [tab, setTab] = useState<Tab>('strength');
  const [logOpen, setLogOpen] = useState(false);

  const completed = useMemo(
    () =>
      state.workouts
        .filter((w) => w.status === 'completed')
        .sort((a, b) =>
          (a.actualDate ?? a.plannedDate).localeCompare(b.actualDate ?? b.plannedDate),
        ),
    [state.workouts],
  );

  const stats = useMemo(() => consistency(state.workouts), [state.workouts]);
  const prs = useMemo(() => computePRs(state.workouts), [state.workouts]);

  return (
    <div className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Progress</h1>
        <p className="screen-subtitle">Everything here updates if you correct a past workout.</p>
      </header>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="row-between">
          <Stat value={String(completed.length)} label="Workouts" />
          <Stat value={`${stats.adherence}%`} label="Adherence" />
          <Stat value={String(prs.size)} label="Exercises tracked" />
        </div>
      </div>

      <div className="chip-row" style={{ marginBottom: 18 }}>
        {(['strength', 'body', 'volume', 'coverage'] as Tab[]).map((t) => (
          <Chip key={t} small selected={tab === t} onClick={() => setTab(t)}>
            {t === 'strength'
              ? 'Strength'
              : t === 'body'
                ? 'Body weight'
                : t === 'volume'
                  ? 'Volume'
                  : 'Coverage'}
          </Chip>
        ))}
      </div>

      {tab === 'strength' && <StrengthTab />}
      {tab === 'body' && (
        <BodyTab onLog={() => setLogOpen(true)} />
      )}
      {tab === 'volume' && <VolumeTab />}
      {tab === 'coverage' && <CoverageTab />}

      {state.achievements.length > 0 && (
        <>
          <h2 className="section">Achievements</h2>
          <div className="card">
            {state.achievements.map((achievement) => (
              <div className="list-item" key={achievement.id}>
                <span style={{ fontSize: 26 }} aria-hidden="true">
                  {ACHIEVEMENT_META[achievement.type].icon}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>
                    {ACHIEVEMENT_META[achievement.type].title}
                  </div>
                  <div className="tiny">{ACHIEVEMENT_META[achievement.type].description}</div>
                </div>
                <span className="tiny">{formatShortDate(achievement.earnedDate)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <LogMetricSheet
        open={logOpen}
        unit={user.unit}
        onClose={() => setLogOpen(false)}
        onSave={(metric) => {
          dispatch({ type: 'addMetric', metric });
          setLogOpen(false);
        }}
      />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }): JSX.Element {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div className="num" style={{ fontSize: 24 }}>
        {value}
      </div>
      <div className="tiny">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------- strength --- */

function StrengthTab(): JSX.Element {
  const { state } = useStore();
  const user = state.user!;

  const tracked = useMemo(() => {
    const counts = new Map<string, number>();
    for (const workout of state.workouts) {
      if (workout.status !== 'completed') continue;
      for (const we of workout.exercises) {
        if (!we.sets.some((s) => s.completed && (s.actualLoad ?? 0) > 0)) continue;
        counts.set(we.exerciseId, (counts.get(we.exerciseId) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }, [state.workouts]);

  const [selected, setSelected] = useState<string | null>(null);
  const exerciseId = selected ?? tracked[0] ?? null;

  const points: Point[] = useMemo(() => {
    if (!exerciseId) return [];
    const out: Point[] = [];
    for (const workout of state.workouts) {
      if (workout.status !== 'completed') continue;
      const we = workout.exercises.find((e) => e.exerciseId === exerciseId);
      if (!we) continue;
      let best = 0;
      for (const set of we.sets) {
        if (!set.completed || set.actualReps === null) continue;
        const load = set.actualLoad ?? 0;
        if (load <= 0) continue;
        best = Math.max(best, estimatedOneRepMax(load, set.actualReps));
      }
      if (best > 0) out.push({ date: workout.actualDate ?? workout.plannedDate, value: best });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [state.workouts, exerciseId]);

  if (tracked.length === 0) {
    return (
      <div className="empty-state">
        <h3>No strength data yet</h3>
        <p className="muted">Log a few loaded sets and your strength curve will appear here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="chip-row" style={{ marginBottom: 14 }}>
        {tracked.slice(0, 8).map((id) => (
          <Chip key={id} small selected={exerciseId === id} onClick={() => setSelected(id)}>
            {findExercise(id)?.name ?? id}
          </Chip>
        ))}
      </div>
      <div className="card">
        <p className="card-label">Estimated strength</p>
        <LineChart points={points} unit={` ${user.unit}`} />
        <p className="tiny" style={{ marginTop: 10 }}>
          Estimated one-rep max from your logged sets. Useful as a trend, not a number to test.
        </p>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- body --- */

function BodyTab({ onLog }: { onLog: () => void }): JSX.Element {
  const { state, dispatch } = useStore();
  const user = state.user!;

  const weightPoints: Point[] = state.metrics
    .filter((m) => m.bodyWeight !== undefined)
    .map((m) => ({ date: m.date, value: m.bodyWeight as number }));

  const waistPoints: Point[] = state.metrics
    .filter((m) => m.waist !== undefined)
    .map((m) => ({ date: m.date, value: m.waist as number }));

  return (
    <>
      <div className="card">
        <p className="card-label">Body weight</p>
        <LineChart points={weightPoints} unit={` ${user.unit}`} />
      </div>

      {waistPoints.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="card-label">Waist</p>
          <LineChart points={waistPoints} />
        </div>
      )}

      <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 16 }} onClick={onLog}>
        Log a measurement
      </button>

      {state.metrics.length > 0 && (
        <>
          <h2 className="section">Entries</h2>
          <div className="card">
            {[...state.metrics].reverse().slice(0, 10).map((metric) => (
              <div className="list-item" key={metric.id}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 650 }}>{formatShortDate(metric.date)}</div>
                  <div className="tiny">
                    {[
                      metric.bodyWeight !== undefined && `${metric.bodyWeight} ${user.unit}`,
                      metric.waist !== undefined && `waist ${metric.waist}`,
                      metric.hip !== undefined && `hip ${metric.hip}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => dispatch({ type: 'removeMetric', id: metric.id })}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* --------------------------------------------------------------- volume --- */

function VolumeTab(): JSX.Element {
  const { state } = useStore();
  const user = state.user!;

  const completed = state.workouts
    .filter((w) => w.status === 'completed')
    .sort((a, b) => (a.actualDate ?? a.plannedDate).localeCompare(b.actualDate ?? b.plannedDate));

  const volumePoints: Point[] = completed.map((w) => ({
    date: w.actualDate ?? w.plannedDate,
    value: totalTonnage(w),
  }));

  // Workouts per week over the last 12 weeks (spec 61).
  const frequency = useMemo(() => {
    const weeks: { label: string; count: number }[] = [];
    let cursor = startOfWeek(addDays(todayISO(), -7 * 11));
    for (let i = 0; i < 12; i++) {
      const end = addDays(cursor, 6);
      const count = completed.filter((w) => {
        const d = w.actualDate ?? w.plannedDate;
        return d >= cursor && d <= end;
      }).length;
      weeks.push({ label: formatShortDate(cursor), count });
      cursor = addDays(cursor, 7);
    }
    return weeks;
  }, [completed]);

  return (
    <>
      <div className="card">
        <p className="card-label">Training volume per session</p>
        <LineChart
          points={volumePoints}
          formatValue={(v) => `${Math.round(v).toLocaleString()} ${user.unit}`}
        />
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <p className="card-label">Workouts per week</p>
        <BarChart bars={frequency.map((f) => f.count)} labels={frequency.map((f) => f.label)} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------- coverage --- */

function CoverageTab(): JSX.Element {
  const { state } = useStore();
  const today = todayISO();
  const weekStart = startOfWeek(today);

  const thisWeek = state.workouts.filter(
    (w) => w.status === 'completed' && (w.actualDate ?? w.plannedDate) >= weekStart,
  );
  const ratios = coverageRatio(thisWeek);

  const rows = (Object.keys(MUSCLE_LABELS) as Muscle[])
    .map((muscle) => ({ muscle, ratio: ratios[muscle] ?? 0 }))
    .sort((a, b) => b.ratio - a.ratio);

  return (
    <div className="card">
      <p className="card-label">This week's coverage</p>
      <p className="muted" style={{ marginTop: 0, marginBottom: 14 }}>
        We use this internally to balance your next sessions toward whatever the week is missing.
      </p>
      {rows.map(({ muscle, ratio }) => (
        <div className="coverage-row" key={muscle}>
          <span>{MUSCLE_LABELS[muscle]}</span>
          <div className="bar">
            <div style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
          <span className="tiny" style={{ textAlign: 'right' }}>
            {Math.round(ratio * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ log sheet --- */

function LogMetricSheet({
  open,
  unit,
  onClose,
  onSave,
}: {
  open: boolean;
  unit: string;
  onClose: () => void;
  onSave: (metric: ProgressMetric) => void;
}): JSX.Element {
  const [date, setDate] = useState(todayISO());
  const [weight, setWeight] = useState<number | null>(null);
  const [waist, setWaist] = useState<number | null>(null);
  const [hip, setHip] = useState<number | null>(null);

  return (
    <Sheet open={open} onClose={onClose} title="Log a measurement">
      <div className="stack" style={{ marginTop: 14 }}>
        <div className="field">
          <label htmlFor="metric-date">Date</label>
          <input
            id="metric-date"
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Body weight ({unit})</label>
          <Stepper value={weight} onChange={setWeight} step={0.5} max={999} ariaLabel="body weight" />
        </div>

        <div className="field">
          <label>Waist (optional)</label>
          <Stepper value={waist} onChange={setWaist} step={0.5} max={300} ariaLabel="waist" />
        </div>

        <div className="field">
          <label>Hip (optional)</label>
          <Stepper value={hip} onChange={setHip} step={0.5} max={300} ariaLabel="hip" />
        </div>

        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          disabled={weight === null && waist === null && hip === null}
          onClick={() =>
            onSave({
              id: uid('metric'),
              date,
              ...(weight !== null ? { bodyWeight: weight } : {}),
              ...(waist !== null ? { waist } : {}),
              ...(hip !== null ? { hip } : {}),
            })
          }
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}
