import { useEffect, useState } from 'react';
import type { Achievement, Workout } from '../../domain/types';
import { ACHIEVEMENT_META, type PRResult } from '../../engine/records';
import { formatDuration } from '../../lib/dates';
import { Confetti } from '../components/Primitives';
import { useStore } from '../../data/store';

/**
 * Rewards (spec 56–58).
 *
 * Two tiers: a warm acknowledgement for finishing, and a distinctly bigger
 * moment for a PR showing the before/after. Tasteful rather than childish, and
 * always dismissible in one tap.
 */
export function Celebration({
  workout,
  prs,
  achievements,
  onDone,
}: {
  workout: Workout;
  prs: PRResult[];
  achievements: Achievement[];
  onDone: () => void;
}): JSX.Element {
  const { state } = useStore();
  const unit = state.user?.unit ?? 'lb';
  const [stage, setStage] = useState<'workout' | 'pr' | 'achievement'>('workout');

  const completedSets = workout.exercises.reduce(
    (t, e) => t + e.sets.filter((s) => s.completed).length,
    0,
  );
  const workedExercises = workout.exercises.filter((e) => e.sets.some((s) => s.completed)).length;

  // Advance automatically through the tiers the user actually earned.
  const advance = (): void => {
    if (stage === 'workout' && prs.length > 0) return setStage('pr');
    if (stage !== 'achievement' && achievements.length > 0) return setStage('achievement');
    onDone();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === 'Escape') advance();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <Confetti pieces={stage === 'pr' ? 90 : 55} />
      <div className="celebrate" role="dialog" aria-live="polite">
        <div className="celebrate-inner">
          {stage === 'workout' && (
            <>
              <div style={{ fontSize: 54, marginBottom: 8 }} aria-hidden="true">
                💪
              </div>
              <h1>Workout complete!</h1>
              <p className="muted" style={{ fontSize: 16 }}>
                {workout.slotLabel}
              </p>

              <div className="card" style={{ marginTop: 22, textAlign: 'left' }}>
                <div className="row-between" style={{ marginBottom: 10 }}>
                  <span className="muted">Duration</span>
                  <span className="num">
                    {formatDuration(workout.durationSeconds ?? 0)}
                  </span>
                </div>
                <div className="row-between" style={{ marginBottom: 10 }}>
                  <span className="muted">Exercises</span>
                  <span className="num">{workedExercises}</span>
                </div>
                <div className="row-between">
                  <span className="muted">Sets</span>
                  <span className="num">{completedSets}</span>
                </div>
              </div>
            </>
          )}

          {stage === 'pr' && (
            <>
              <div style={{ fontSize: 54, marginBottom: 8 }} aria-hidden="true">
                🏆
              </div>
              <h1>New personal record!</h1>
              {prs.slice(0, 3).map((pr) => (
                <div key={pr.exerciseId} style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{pr.exerciseName}</p>
                  <div className="pr-compare">
                    <div>
                      <p className="tiny" style={{ margin: 0 }}>
                        Previous
                      </p>
                      <span className="num" style={{ opacity: 0.65 }}>
                        {pr.previousLoad !== null
                          ? `${pr.previousLoad} ${unit} × ${pr.previousReps}`
                          : '—'}
                      </span>
                    </div>
                    <span aria-hidden="true" style={{ fontSize: 20 }}>
                      →
                    </span>
                    <div>
                      <p className="tiny" style={{ margin: 0 }}>
                        New best
                      </p>
                      <span className="num" style={{ color: 'var(--accent)' }}>
                        {pr.load} {unit} × {pr.reps}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {prs.length > 3 && (
                <p className="muted">and {prs.length - 3} more</p>
              )}
            </>
          )}

          {stage === 'achievement' && (
            <>
              <div style={{ fontSize: 54, marginBottom: 8 }} aria-hidden="true">
                {ACHIEVEMENT_META[achievements[0].type].icon}
              </div>
              <h1>Achievement unlocked</h1>
              {achievements.map((achievement) => (
                <div key={achievement.id} style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>
                    {ACHIEVEMENT_META[achievement.type].title}
                  </p>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    {ACHIEVEMENT_META[achievement.type].description}
                  </p>
                </div>
              ))}
            </>
          )}

          <button
            type="button"
            className="btn btn--primary btn--block btn--lg"
            style={{ marginTop: 26 }}
            onClick={advance}
          >
            {(stage === 'workout' && prs.length > 0) ||
            (stage !== 'achievement' && achievements.length > 0)
              ? 'Next'
              : 'Done'}
          </button>
        </div>
      </div>
    </>
  );
}
