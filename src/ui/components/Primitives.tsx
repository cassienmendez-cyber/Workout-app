import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Bottom sheet used for every modal interaction (spec 66: thumb-reachable). */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {title && <h2 className="sheet-title">{title}</h2>}
        {subtitle && <p className="muted" style={{ marginTop: 0 }}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

/**
 * Large-target numeric entry (spec 47, 66). Typing is possible but never
 * required — the +/- buttons cover normal use one-handed.
 */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  suffix,
  ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  ariaLabel: string;
}): JSX.Element {
  const clamp = (n: number): number => Math.max(min, Math.min(max, n));
  const current = value ?? 0;
  const round = (n: number): number => Math.round(n * 100) / 100;

  return (
    <div className="stepper">
      <button
        type="button"
        onClick={() => onChange(round(clamp(current - step)))}
        aria-label={`Decrease ${ariaLabel}`}
      >
        −
      </button>
      <input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : round(clamp(Number(raw))));
        }}
      />
      <button
        type="button"
        onClick={() => onChange(round(clamp(current + step)))}
        aria-label={`Increase ${ariaLabel}`}
      >
        +
      </button>
      {suffix && (
        <span className="muted" style={{ alignSelf: 'center', minWidth: 26 }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Choice({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
}): JSX.Element {
  return (
    <button type="button" className="choice" aria-pressed={selected} onClick={onClick}>
      <span>{title}</span>
      {description && <small>{description}</small>}
    </button>
  );
}

export function Chip({
  selected,
  onClick,
  children,
  small,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  small?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      className={small ? 'chip chip--sm' : 'chip'}
      aria-pressed={selected}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Confirmation for anything the user cannot casually undo (spec 51). */
export function ConfirmSheet({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element | null {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <div className="stack" style={{ marginTop: 10 }}>
        {body}
        <button
          type="button"
          className={danger ? 'btn btn--block btn--lg btn--danger' : 'btn btn--primary btn--block btn--lg'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button type="button" className="btn btn--ghost btn--block" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </Sheet>
  );
}

/** Tasteful celebration: brief, non-childish, reduced-motion aware (spec 56). */
export function Confetti({ pieces = 60 }: { pieces?: number }): JSX.Element {
  const [items] = useState(() =>
    Array.from({ length: pieces }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 2.1 + Math.random() * 1.4,
      hue: [155, 42, 200, 330, 95][i % 5],
      scale: 0.7 + Math.random() * 0.7,
    })),
  );

  return (
    <div className="confetti" aria-hidden="true">
      {items.map((p) => (
        <i
          key={p.id}
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            background: `hsl(${p.hue} 70% 55%)`,
            transform: `scale(${p.scale})`,
          }}
        />
      ))}
    </div>
  );
}

/** Fires a short haptic pulse when the user has them enabled (spec 67). */
export function haptic(enabled: boolean, pattern: number | number[] = 12): void {
  if (!enabled) return;
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}

/** Keeps the screen on during a workout when the user has opted in (spec 67). */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function acquire(): Promise<void> {
      if (!active) return;
      if (!('wakeLock' in navigator)) return;
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void lock.release();
          return;
        }
        lockRef.current = lock;
      } catch {
        // Wake lock is a nicety; failing to get one must never break a workout.
      }
    }
    void acquire();

    const onVisible = (): void => {
      if (document.visibilityState === 'visible' && active && !lockRef.current) void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lockRef.current?.release();
      lockRef.current = null;
    };
  }, [active]);
}
