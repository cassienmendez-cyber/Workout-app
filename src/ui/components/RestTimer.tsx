import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../../lib/dates';
import { haptic } from './Primitives';

/**
 * Automatic rest timer (spec 47).
 *
 * Starts itself when a set is completed. Counts past zero rather than stopping,
 * so a user who glances away knows how far over they ran.
 */
export function RestTimer({
  seconds,
  startedAt,
  onDismiss,
  onSkip,
  haptics,
  alert,
}: {
  seconds: number;
  startedAt: number;
  onDismiss: () => void;
  onSkip: () => void;
  haptics: boolean;
  alert: boolean;
}): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = Math.floor((now - startedAt) / 1000);
  const remaining = seconds - elapsed;
  const done = remaining <= 0;

  useEffect(() => {
    if (done && !firedRef.current) {
      firedRef.current = true;
      if (alert) haptic(haptics, [60, 40, 60]);
    }
  }, [done, haptics, alert]);

  const pct = Math.max(0, Math.min(100, (elapsed / seconds) * 100));

  return (
    <div className={done ? 'rest-timer done' : 'rest-timer'} role="status" aria-live="polite">
      <span className="num" aria-label={done ? 'Rest complete' : 'Rest remaining'}>
        {done ? `+${formatClock(Math.abs(remaining))}` : formatClock(remaining)}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 650, fontSize: 14 }}>
          {done ? 'Rest complete — next set' : 'Resting'}
        </div>
        <div className="bar" style={{ marginTop: 6 }}>
          <div style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button type="button" className="btn btn--sm" onClick={done ? onDismiss : onSkip}>
        {done ? 'Done' : 'Skip'}
      </button>
    </div>
  );
}
