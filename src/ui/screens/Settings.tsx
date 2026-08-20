import { useState } from 'react';
import type {
  Equipment,
  ExperienceLevel,
  Goal,
  LimitationLevel,
  RestrictionTag,
  ThemePreference,
  Weekday,
} from '../../domain/types';
import {
  EQUIPMENT_LABELS,
  GOALS,
  GOAL_LABELS,
  RESTRICTION_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
} from '../../domain/types';
import { useStore } from '../../data/store';
import { clearState } from '../../data/storage';
import { SAFETY_DISCLAIMER } from '../../engine/safety';
import { addDays, formatShortDate, startOfWeek, todayISO } from '../../lib/dates';
import { Chip, Choice, ConfirmSheet, Sheet } from '../components/Primitives';

/**
 * Settings (spec 8, 42, 65–67).
 *
 * Everything collected during onboarding stays editable here. Changes that
 * affect programming regenerate future workouts only — history is never
 * touched (spec 42, 68).
 */
export function Settings(): JSX.Element {
  const { state, dispatch } = useStore();
  const user = state.user!;
  const [sheet, setSheet] = useState<
    'goal' | 'availability' | 'equipment' | 'limitations' | 'experience' | null
  >(null);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Settings</h1>
      </header>

      <h2 className="section">Program</h2>
      <div className="card">
        <Row label="Primary goal" value={GOAL_LABELS[user.primaryGoal]} onClick={() => setSheet('goal')} />
        <Row
          label="Training days"
          value={`${user.daysPerWeek}× per week`}
          onClick={() => setSheet('availability')}
        />
        <Row
          label="Session length"
          value={`${user.preferredDurationMinutes} min`}
          onClick={() => setSheet('availability')}
        />
        <Row
          label="Experience"
          value={user.experience[0].toUpperCase() + user.experience.slice(1)}
          onClick={() => setSheet('experience')}
        />
      </div>

      <h2 className="section">Equipment</h2>
      <div className="card">
        {user.equipmentProfiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            className="list-item"
            style={rowStyle}
            onClick={() => dispatch({ type: 'updateUser', patch: { activeProfileId: profile.id } })}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 650 }}>{profile.name}</div>
              <div className="tiny">{profile.equipment.length} items available</div>
            </div>
            {profile.id === user.activeProfileId && <span className="badge badge--accent">Active</span>}
          </button>
        ))}
        <button
          type="button"
          className="btn btn--sm"
          style={{ marginTop: 12 }}
          onClick={() => setSheet('equipment')}
        >
          Edit equipment
        </button>
      </div>

      <h2 className="section">Limitations</h2>
      <div className="card">
        {user.limitations.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            None set. Your programming uses the full exercise library.
          </p>
        ) : (
          user.limitations.map((limitation) => (
            <div className="list-item" key={limitation.tag}>
              <div style={{ flex: 1 }}>{RESTRICTION_LABELS[limitation.tag]}</div>
              <span
                className={
                  limitation.level === 'clinician' ? 'badge badge--warning' : 'badge'
                }
              >
                {limitation.level === 'clinician'
                  ? 'Clinician'
                  : limitation.level[0].toUpperCase() + limitation.level.slice(1)}
              </span>
            </div>
          ))
        )}
        <button
          type="button"
          className="btn btn--sm"
          style={{ marginTop: 12 }}
          onClick={() => setSheet('limitations')}
        >
          Edit limitations
        </button>
      </div>

      <h2 className="section">Appearance</h2>
      <div className="card">
        <p className="card-label">Theme</p>
        <div className="chip-row">
          {(['system', 'light', 'dark'] as ThemePreference[]).map((theme) => (
            <Chip
              key={theme}
              selected={user.theme === theme}
              onClick={() => dispatch({ type: 'updateUser', patch: { theme } })}
            >
              {theme[0].toUpperCase() + theme.slice(1)}
            </Chip>
          ))}
        </div>

        <div className="divider" />

        <p className="card-label">Units</p>
        <div className="chip-row">
          <Chip
            selected={user.unit === 'lb'}
            onClick={() => dispatch({ type: 'updateUser', patch: { unit: 'lb' } })}
          >
            Pounds
          </Chip>
          <Chip
            selected={user.unit === 'kg'}
            onClick={() => dispatch({ type: 'updateUser', patch: { unit: 'kg' } })}
          >
            Kilograms
          </Chip>
        </div>
      </div>

      <h2 className="section">During workouts</h2>
      <div className="card">
        <Toggle
          label="Haptic feedback"
          hint="A short pulse on set completion, PRs and timers"
          checked={user.notifications.haptics}
          onChange={(haptics) =>
            dispatch({
              type: 'updateUser',
              patch: { notifications: { ...user.notifications, haptics } },
            })
          }
        />
        <Toggle
          label="Rest timer alert"
          hint="Buzz when your rest period finishes"
          checked={user.notifications.restTimerAlert}
          onChange={(restTimerAlert) =>
            dispatch({
              type: 'updateUser',
              patch: { notifications: { ...user.notifications, restTimerAlert } },
            })
          }
        />
        <Toggle
          label="Keep screen awake"
          hint="Stops your phone locking mid-set"
          checked={user.keepScreenAwake}
          onChange={(keepScreenAwake) => dispatch({ type: 'updateUser', patch: { keepScreenAwake } })}
        />
      </div>

      <h2 className="section">About</h2>
      <div className="card card--flat">
        <p className="muted" style={{ margin: 0 }}>
          {SAFETY_DISCLAIMER}
        </p>
      </div>

      <button
        type="button"
        className="btn btn--danger btn--block"
        style={{ marginTop: 22 }}
        onClick={() => setConfirmReset(true)}
      >
        Reset all data
      </button>

      {/* ------------------------------------------------------------ sheets */}

      <Sheet open={sheet === 'goal'} onClose={() => setSheet(null)} title="Training goal">
        <div className="stack" style={{ marginTop: 12 }}>
          {GOALS.map((goal) => (
            <Choice
              key={goal}
              title={GOAL_LABELS[goal]}
              selected={user.primaryGoal === goal}
              onClick={() => {
                dispatch({ type: 'updateUser', patch: { primaryGoal: goal } });
                setSheet(null);
              }}
            />
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'experience'} onClose={() => setSheet(null)} title="Experience level">
        <div className="stack" style={{ marginTop: 12 }}>
          {(['beginner', 'intermediate', 'advanced'] as ExperienceLevel[]).map((level) => (
            <Choice
              key={level}
              title={level[0].toUpperCase() + level.slice(1)}
              selected={user.experience === level}
              onClick={() => {
                dispatch({ type: 'updateUser', patch: { experience: level } });
                setSheet(null);
              }}
            />
          ))}
        </div>
      </Sheet>

      <AvailabilitySheet open={sheet === 'availability'} onClose={() => setSheet(null)} />
      <EquipmentSheet open={sheet === 'equipment'} onClose={() => setSheet(null)} />
      <LimitationsSheet open={sheet === 'limitations'} onClose={() => setSheet(null)} />

      <ConfirmSheet
        open={confirmReset}
        title="Reset everything?"
        danger
        confirmLabel="Delete all my data"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          clearState();
          dispatch({ type: 'reset' });
        }}
        body={
          <p className="muted">
            This permanently deletes your profile, every logged workout, your measurements and your
            achievements. It cannot be undone.
          </p>
        }
      />
    </div>
  );
}

const rowStyle = {
  width: '100%',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid var(--border)',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left' as const,
  cursor: 'pointer',
};

function Row({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button type="button" className="list-item" style={rowStyle} onClick={onClick}>
      <span style={{ flex: 1 }}>{label}</span>
      <span className="muted">{value}</span>
      <span className="muted" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): JSX.Element {
  return (
    <label className="list-item" style={{ cursor: 'pointer' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 650 }}>{label}</div>
        {hint && <div className="tiny">{hint}</div>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 26, height: 26, minHeight: 0, accentColor: 'var(--accent)' }}
      />
    </label>
  );
}

/**
 * Availability changes ask when to apply (spec 42) rather than silently
 * rewriting the current week.
 */
function AvailabilitySheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { state, dispatch } = useStore();
  const user = state.user!;
  const [days, setDays] = useState<Weekday[]>(user.availableDays);
  const [duration, setDuration] = useState(user.preferredDurationMinutes);
  const [when, setWhen] = useState<'now' | 'next_week'>('now');

  const nextWeek = addDays(startOfWeek(todayISO()), 7);
  const effectiveFrom = when === 'now' ? todayISO() : nextWeek;

  const toggle = (day: Weekday): void =>
    setDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    );

  return (
    <Sheet open={open} onClose={onClose} title="When can you train?">
      <div className="stack" style={{ marginTop: 12 }}>
        <div>
          <p className="card-label">Days</p>
          <div className="chip-row">
            {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((day) => (
              <Chip key={day} selected={days.includes(day)} onClick={() => toggle(day)}>
                <span aria-hidden="true">{WEEKDAY_SHORT[day]}</span>
                <span className="sr-only">{WEEKDAY_LABELS[day]}</span>
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="card-label">Session length</p>
          <div className="chip-row">
            {[20, 30, 45, 60, 75].map((minutes) => (
              <Chip key={minutes} selected={duration === minutes} onClick={() => setDuration(minutes)}>
                {minutes} min
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="card-label">Apply from</p>
          <div className="chip-row">
            <Chip selected={when === 'now'} onClick={() => setWhen('now')}>
              Starting today
            </Chip>
            <Chip selected={when === 'next_week'} onClick={() => setWhen('next_week')}>
              From {formatShortDate(nextWeek)}
            </Chip>
          </div>
          <p className="tiny" style={{ marginTop: 8 }}>
            Workouts you have already completed will not change.
          </p>
        </div>

        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          disabled={days.length === 0}
          onClick={() => {
            if (duration !== user.preferredDurationMinutes) {
              dispatch({ type: 'updateUser', patch: { preferredDurationMinutes: duration } });
            }
            dispatch({
              type: 'changeAvailability',
              daysPerWeek: days.length,
              days,
              effectiveFrom,
            });
            onClose();
          }}
        >
          Update schedule
        </button>
      </div>
    </Sheet>
  );
}

function EquipmentSheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { state, dispatch } = useStore();
  const user = state.user!;
  const activeIndex = user.equipmentProfiles.findIndex((p) => p.id === user.activeProfileId);
  const active = user.equipmentProfiles[activeIndex];
  const [selected, setSelected] = useState<Equipment[]>(active?.equipment ?? []);

  const toggle = (item: Equipment): void =>
    setSelected((current) =>
      current.includes(item) ? current.filter((e) => e !== item) : [...current, item],
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Edit ${active?.name ?? 'equipment'}`}
      subtitle="Your workouts will only use what you have here."
    >
      <div className="stack" style={{ marginTop: 12 }}>
        <div className="chip-row">
          {(Object.keys(EQUIPMENT_LABELS) as Equipment[])
            .filter((e) => e !== 'bodyweight')
            .map((item) => (
              <Chip key={item} small selected={selected.includes(item)} onClick={() => toggle(item)}>
                {EQUIPMENT_LABELS[item]}
              </Chip>
            ))}
        </div>
        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          onClick={() => {
            const profiles = user.equipmentProfiles.map((p, i) =>
              i === activeIndex ? { ...p, equipment: selected } : p,
            );
            dispatch({ type: 'updateUser', patch: { equipmentProfiles: profiles } });
            onClose();
          }}
        >
          Save equipment
        </button>
      </div>
    </Sheet>
  );
}

function LimitationsSheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const { state, dispatch } = useStore();
  const user = state.user!;
  const [limitations, setLimitations] = useState(user.limitations);

  const levelFor = (tag: RestrictionTag): LimitationLevel =>
    limitations.find((l) => l.tag === tag)?.level ?? 'none';

  const setLevel = (tag: RestrictionTag, level: LimitationLevel): void => {
    const others = limitations.filter((l) => l.tag !== tag);
    setLimitations(level === 'none' ? others : [...others, { tag, level }]);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Movement limitations">
      <div className="note note--warning" style={{ marginTop: 12 }}>
        {SAFETY_DISCLAIMER}
      </div>
      <div className="stack" style={{ marginTop: 14 }}>
        {(Object.keys(RESTRICTION_LABELS) as RestrictionTag[]).map((tag) => {
          const level = levelFor(tag);
          return (
            <div key={tag} className={level === 'none' ? 'card card--flat' : 'card'}>
              <strong>{RESTRICTION_LABELS[tag]}</strong>
              <div className="chip-row" style={{ marginTop: 10 }}>
                {(['modify', 'avoid', 'clinician'] as LimitationLevel[]).map((option) => (
                  <Chip
                    key={option}
                    small
                    selected={level === option}
                    onClick={() => setLevel(tag, level === option ? 'none' : option)}
                  >
                    {option === 'clinician' ? 'Clinician' : option[0].toUpperCase() + option.slice(1)}
                  </Chip>
                ))}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="btn btn--primary btn--block btn--lg"
          onClick={() => {
            dispatch({ type: 'updateUser', patch: { limitations } });
            onClose();
          }}
        >
          Save limitations
        </button>
      </div>
    </Sheet>
  );
}

export type { Goal };
