import { useMemo, useState } from 'react';
import type {
  Equipment,
  ExperienceLevel,
  LimitationLevel,
  RestrictionTag,
  UserProfile,
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
import { makeDefaultUser, PRESET_PROFILES, SUGGESTED_DAYS, makeEquipmentProfile } from '../../data/defaults';
import { useStore } from '../../data/store';
import { Chip, Choice } from '../components/Primitives';
import { SAFETY_DISCLAIMER } from '../../engine/safety';

/**
 * Onboarding (spec 7–13).
 *
 * Collects only what the engine actually needs to generate a first workout.
 * Every answer is editable later from Settings, and the user can skip the
 * optional steps entirely.
 */

const STEPS = ['goal', 'availability', 'duration', 'equipment', 'experience', 'limitations'] as const;
type Step = (typeof STEPS)[number];

const EXPERIENCE_OPTIONS: { value: ExperienceLevel; title: string; description: string }[] = [
  { value: 'beginner', title: 'Beginner', description: 'New to lifting, or returning after a long break' },
  { value: 'intermediate', title: 'Intermediate', description: 'Comfortable with the main lifts' },
  { value: 'advanced', title: 'Advanced', description: 'Years of consistent structured training' },
];

const RESTRICTION_OPTIONS: RestrictionTag[] = [
  'squatting',
  'lunging',
  'overhead',
  'bending',
  'loaded_flexion',
  'rotation',
  'pushing',
  'pulling',
  'impact',
  'jumping',
  'deep_knee_flexion',
  'grip',
];

const LIMITATION_LEVELS: { value: LimitationLevel; label: string; hint: string }[] = [
  { value: 'modify', label: 'Modify', hint: 'Keep it, but adjust range or load' },
  { value: 'avoid', label: 'Avoid', hint: 'Leave it out of my programming' },
  { value: 'clinician', label: 'Clinician-restricted', hint: 'A professional told me not to' },
];

export function Onboarding(): JSX.Element {
  const { dispatch } = useStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<UserProfile>(() => makeDefaultUser());
  const [customEquipment, setCustomEquipment] = useState<Equipment[] | null>(null);

  const step: Step = STEPS[stepIndex];
  const update = (patch: Partial<UserProfile>): void => setDraft((d) => ({ ...d, ...patch }));

  const canAdvance = useMemo(() => {
    if (step === 'availability') return draft.availableDays.length > 0;
    return true;
  }, [step, draft.availableDays.length]);

  const next = (): void => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
      window.scrollTo({ top: 0 });
    } else {
      dispatch({ type: 'completeOnboarding', user: draft });
    }
  };

  const back = (): void => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  };

  return (
    <div className="app">
      <div className="screen screen--full">
        <div className="progress-dots" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
          {STEPS.map((s, i) => (
            <span key={s} className={i <= stepIndex ? 'done' : ''} />
          ))}
        </div>

        {step === 'goal' && <GoalStep draft={draft} update={update} />}
        {step === 'availability' && <AvailabilityStep draft={draft} update={update} />}
        {step === 'duration' && <DurationStep draft={draft} update={update} />}
        {step === 'equipment' && (
          <EquipmentStep
            draft={draft}
            update={update}
            customEquipment={customEquipment}
            setCustomEquipment={setCustomEquipment}
          />
        )}
        {step === 'experience' && <ExperienceStep draft={draft} update={update} />}
        {step === 'limitations' && <LimitationsStep draft={draft} update={update} />}

        <div className="stack" style={{ marginTop: 30 }}>
          <button
            type="button"
            className="btn btn--primary btn--block btn--lg"
            onClick={next}
            disabled={!canAdvance}
          >
            {stepIndex === STEPS.length - 1 ? 'Build my program' : 'Continue'}
          </button>
          {stepIndex > 0 && (
            <button type="button" className="btn btn--ghost btn--block" onClick={back}>
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  draft: UserProfile;
  update: (patch: Partial<UserProfile>) => void;
}

function GoalStep({ draft, update }: StepProps): JSX.Element {
  return (
    <>
      <header className="screen-header">
        <h1 className="screen-title">What are you training for?</h1>
        <p className="screen-subtitle">
          This shapes your rep ranges, loading and how much volume you get.
        </p>
      </header>
      <div className="choice-grid">
        {GOALS.map((goal) => (
          <Choice
            key={goal}
            title={GOAL_LABELS[goal]}
            selected={draft.primaryGoal === goal}
            onClick={() =>
              update({
                primaryGoal: goal,
                secondaryGoal: draft.secondaryGoal === goal ? null : draft.secondaryGoal,
              })
            }
          />
        ))}
      </div>

      <h2 className="section">Secondary goal (optional)</h2>
      <div className="chip-row">
        {GOALS.filter((g) => g !== draft.primaryGoal).map((goal) => (
          <Chip
            key={goal}
            small
            selected={draft.secondaryGoal === goal}
            onClick={() => update({ secondaryGoal: draft.secondaryGoal === goal ? null : goal })}
          >
            {GOAL_LABELS[goal]}
          </Chip>
        ))}
      </div>
    </>
  );
}

function AvailabilityStep({ draft, update }: StepProps): JSX.Element {
  const setFrequency = (days: number): void => {
    update({ daysPerWeek: days, availableDays: SUGGESTED_DAYS[days] ?? draft.availableDays });
  };

  const toggleDay = (day: Weekday): void => {
    const has = draft.availableDays.includes(day);
    const availableDays = has
      ? draft.availableDays.filter((d) => d !== day)
      : [...draft.availableDays, day].sort((a, b) => a - b);
    update({ availableDays, daysPerWeek: Math.max(1, availableDays.length) });
  };

  return (
    <>
      <header className="screen-header">
        <h1 className="screen-title">When can you train?</h1>
        <p className="screen-subtitle">
          Be realistic rather than optimistic — the app works best when this matches your life.
          You can change it any time.
        </p>
      </header>

      <h2 className="section">Days per week</h2>
      <div className="chip-row">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <Chip key={n} selected={draft.daysPerWeek === n} onClick={() => setFrequency(n)}>
            {n}
          </Chip>
        ))}
      </div>

      <h2 className="section">Which days</h2>
      <div className="chip-row">
        {([1, 2, 3, 4, 5, 6, 0] as Weekday[]).map((day) => (
          <Chip
            key={day}
            selected={draft.availableDays.includes(day)}
            onClick={() => toggleDay(day)}
          >
            <span aria-hidden="true">{WEEKDAY_SHORT[day]}</span>
            <span className="sr-only">{WEEKDAY_LABELS[day]}</span>
          </Chip>
        ))}
      </div>

      <p className="muted" style={{ marginTop: 14 }}>
        {draft.availableDays.length <= 3
          ? 'With three days or fewer you will get complementary full-body sessions.'
          : 'With four or more days you will alternate anterior- and posterior-focused sessions.'}
      </p>
    </>
  );
}

function DurationStep({ draft, update }: StepProps): JSX.Element {
  return (
    <>
      <header className="screen-header">
        <h1 className="screen-title">How long do you have?</h1>
        <p className="screen-subtitle">
          A typical session. You can always shorten an individual workout on the day.
        </p>
      </header>
      <div className="choice-grid">
        {[20, 30, 45, 60, 75].map((minutes) => (
          <Choice
            key={minutes}
            title={`${minutes} minutes`}
            description={
              minutes <= 25 ? 'Short and focused' : minutes >= 70 ? 'Room for everything' : undefined
            }
            selected={draft.preferredDurationMinutes === minutes}
            onClick={() => update({ preferredDurationMinutes: minutes })}
          />
        ))}
      </div>
    </>
  );
}

function EquipmentStep({
  draft,
  update,
  customEquipment,
  setCustomEquipment,
}: StepProps & {
  customEquipment: Equipment[] | null;
  setCustomEquipment: (e: Equipment[] | null) => void;
}): JSX.Element {
  const activeIndex = draft.equipmentProfiles.findIndex((p) => p.id === draft.activeProfileId);
  const active = draft.equipmentProfiles[activeIndex];

  const selectPreset = (name: string): void => {
    const profile = draft.equipmentProfiles.find((p) => p.name === name);
    if (profile) {
      update({ activeProfileId: profile.id });
      setCustomEquipment(null);
    }
  };

  const toggleEquipment = (item: Equipment): void => {
    const current = customEquipment ?? active.equipment;
    const nextList = current.includes(item)
      ? current.filter((e) => e !== item)
      : [...current, item];
    setCustomEquipment(nextList);

    const profiles = draft.equipmentProfiles.map((p, i) =>
      i === activeIndex ? { ...p, equipment: nextList } : p,
    );
    update({ equipmentProfiles: profiles });
  };

  const selected = new Set(customEquipment ?? active.equipment);
  const allEquipment = Object.keys(EQUIPMENT_LABELS) as Equipment[];

  return (
    <>
      <header className="screen-header">
        <h1 className="screen-title">What can you train with?</h1>
        <p className="screen-subtitle">
          Pick the closest starting point, then adjust. You can add Home, Gym and Travel profiles
          later and switch between them.
        </p>
      </header>

      <div className="choice-grid">
        {PRESET_PROFILES.map((preset) => (
          <Choice
            key={preset.name}
            title={preset.name}
            description={`${preset.equipment.length} items`}
            selected={active?.name === preset.name}
            onClick={() => selectPreset(preset.name)}
          />
        ))}
      </div>

      <h2 className="section">Fine-tune {active?.name}</h2>
      <div className="chip-row">
        {allEquipment
          .filter((e) => e !== 'bodyweight')
          .map((item) => (
            <Chip key={item} small selected={selected.has(item)} onClick={() => toggleEquipment(item)}>
              {EQUIPMENT_LABELS[item]}
            </Chip>
          ))}
      </div>
      <p className="tiny" style={{ marginTop: 12 }}>
        Bodyweight movements are always available.
      </p>
    </>
  );
}

function ExperienceStep({ draft, update }: StepProps): JSX.Element {
  return (
    <>
      <header className="screen-header">
        <h1 className="screen-title">How much lifting have you done?</h1>
        <p className="screen-subtitle">
          This adjusts exercise complexity and how quickly loads climb.
        </p>
      </header>
      <div className="stack">
        {EXPERIENCE_OPTIONS.map((option) => (
          <Choice
            key={option.value}
            title={option.title}
            description={option.description}
            selected={draft.experience === option.value}
            onClick={() => update({ experience: option.value })}
          />
        ))}
      </div>

      <h2 className="section">Units</h2>
      <div className="chip-row">
        <Chip selected={draft.unit === 'lb'} onClick={() => update({ unit: 'lb' })}>
          Pounds
        </Chip>
        <Chip selected={draft.unit === 'kg'} onClick={() => update({ unit: 'kg' })}>
          Kilograms
        </Chip>
      </div>
    </>
  );
}

function LimitationsStep({ draft, update }: StepProps): JSX.Element {
  const levelFor = (tag: RestrictionTag): LimitationLevel =>
    draft.limitations.find((l) => l.tag === tag)?.level ?? 'none';

  const setLevel = (tag: RestrictionTag, level: LimitationLevel): void => {
    const others = draft.limitations.filter((l) => l.tag !== tag);
    update({ limitations: level === 'none' ? others : [...others, { tag, level }] });
  };

  const active = draft.limitations.filter((l) => l.level !== 'none');

  return (
    <>
      <header className="screen-header">
        <h1 className="screen-title">Anything to work around?</h1>
        <p className="screen-subtitle">
          Optional. Tell us what to modify or avoid and we will program around it automatically.
        </p>
      </header>

      <div className="note note--warning" style={{ marginBottom: 18 }}>
        {SAFETY_DISCLAIMER}
      </div>

      <div className="stack">
        {RESTRICTION_OPTIONS.map((tag) => {
          const level = levelFor(tag);
          return (
            <div key={tag} className={level === 'none' ? 'card card--flat' : 'card'}>
              <div className="row-between">
                <strong>{RESTRICTION_LABELS[tag]}</strong>
                {level !== 'none' && (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={() => setLevel(tag, 'none')}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="chip-row" style={{ marginTop: 10 }}>
                {LIMITATION_LEVELS.map((option) => (
                  <Chip
                    key={option.value}
                    small
                    selected={level === option.value}
                    onClick={() => setLevel(tag, level === option.value ? 'none' : option.value)}
                  >
                    {option.label}
                  </Chip>
                ))}
              </div>
              {level !== 'none' && (
                <p className="tiny" style={{ margin: '9px 0 0' }}>
                  {LIMITATION_LEVELS.find((o) => o.value === level)?.hint}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {active.length > 0 && (
        <p className="muted" style={{ marginTop: 16 }}>
          {active.length} limitation{active.length === 1 ? '' : 's'} set. Your workouts will route
          around {active.length === 1 ? 'it' : 'them'} automatically.
        </p>
      )}
    </>
  );
}

/** Used by Settings to add a profile from a preset (spec 65). */
export function presetProfile(name: string) {
  const preset = PRESET_PROFILES.find((p) => p.name === name) ?? PRESET_PROFILES[0];
  return makeEquipmentProfile(preset);
}
