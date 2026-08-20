# Adaptive Strength Training App

> The user decides when they can train. The app decides what they should do.

A mobile-first adaptive strength-training coach. It is not an exercise library or
a workout logger — its job is to remove decision-making from training. The user
says what they want, when they can train, what equipment they have and what they
need to work around; the app decides the exercises, sets, reps, load, rest,
substitutions, recovery and scheduling.

**Product mantra:** Show up. Do the work. Tell us how it felt. We'll handle the rest.

---

## Running it

```bash
npm install
npm run dev        # development server
npm test           # 126 engine tests
npm run build      # production build
npm run preview    # serve the production build
```

No backend and no accounts — state persists to `localStorage` through a single
data-layer module, so the storage engine can be swapped without touching any
programming logic.

---

## Architecture

The system is split so that **all programming rules live in pure, testable
functions** and the UI only renders their output (spec 68, 69).

```
src/
├── domain/types.ts        Shared vocabulary. Plain data, no behaviour.
├── data/
│   ├── exercises.ts       96-exercise database with full metadata
│   ├── defaults.ts        Starter equipment profiles and user defaults
│   ├── storage.ts         Data layer — the only module that touches storage
│   └── store.tsx          Reducer; delegates every rule to the engine
├── engine/                Deterministic programming core
│   ├── safety.ts          Restriction/equipment gate — runs before everything
│   ├── efficiency.ts      Exercise Efficiency Score
│   ├── split.ts           Full-body vs anterior/posterior rotations
│   ├── generator.ts       Workout construction
│   ├── prescription.ts    Rep ranges, sets, rest intervals
│   ├── progression.ts     Double progression and load adjustment
│   ├── substitution.ts    Compatible-alternative selection
│   ├── scheduling.ts      Dynamic schedule, rescheduling, availability
│   ├── fatigue.ts         Adaptive fatigue index
│   ├── volume.ts          Muscle coverage and weekly volume
│   └── records.ts         PRs, achievements, consistency
└── ui/                    Screens and components. No programming logic.
```

### Why the engine is separate

Every number the user sees is derived on read from the workout log rather than
cached. That single decision is what makes editing history work correctly: when
a user corrects a mistyped weight, their PRs, strength graphs, volume totals and
next session's load all recompute automatically, because nothing was ever stored
downstream of the log (spec 50, 52, 61).

The engine is deterministic — same inputs, same workout, ties broken on a stable
key — which is what makes it testable. AI is not in the loop for programming or
safety decisions (spec 69).

---

## How the programming works

### Selection: the Exercise Efficiency Score

Rather than picking from a list, the generator scores every eligible movement on
muscles trained, goal relevance, time efficiency, skill demand, fatigue cost,
progression potential, the user's preferences, and which muscles the current week
is short on. Compounds naturally score higher because they buy more training per
minute; isolation work wins a slot only when it fills a real gap (spec 20, 21).

Selection walks the session's pattern priorities in order and stops once it has
enough movements, so the same slot produces different sessions as equipment,
recovery and fatigue change. Nothing is hard-coded per workout (spec 69).

### Splits

| Days/week | Structure |
|---|---|
| 1 | Full Body |
| 2 | Full Body A / B |
| 3 | Full Body A / B / C |
| 4+ | Alternating anterior / posterior |

The pattern lists are priorities, not fixed workouts. Internally the engine
reasons about movement patterns, muscle groups, recovery and volume rather than
anatomical labels alone (spec 17).

### Progression

Double progression is the default: hold the load, add reps inside the target
range, then add load and return toward the bottom. Increments come from the
equipment actually available and the size of the movement, never one universal
percentage (spec 30, 33). Bodyweight movements progress by reps and timed
movements by duration (spec 34).

Technique breakdown or a "too difficult" rating reduces the load regardless of
reps completed — safety outranks progression.

### Safety

`engine/safety.ts` is the single authority on whether a movement may be shown.
Clinician-provided restrictions are absolute: no preference, goal, volume target
or substitution may relax them. The app never diagnoses anything and never tells
a user that pain is safe (spec 35, 36).

A heavily restricted user still gets a complete four-to-six exercise session —
the substitution engine routes around restrictions rather than leaving holes.

### Scheduling

Planned date and actual date are stored separately, so a session done on a
different day is recognised as *rescheduled*, not failed (spec 43). Completed and
in-progress workouts are immutable; only future scheduled sessions are ever
regenerated (spec 39, 68). Moving a workout preserves its place in the split
sequence, so the user still gets the session they were owed.

Availability changes take an effective date, so switching days never rewrites the
week already underway (spec 42).

---

## Test coverage

126 tests across eight suites, covering everything spec 69 asks for:

| Suite | What it pins down |
|---|---|
| `database` | Id uniqueness, substitution graph integrity, pattern coverage |
| `split` | 1–7 day structures, alternation, complementary sessions |
| `generator` | 4–6 exercises at every frequency, determinism, time fitting, short modes |
| `progression` | Double progression, load reduction, per-exercise increments, rep ranges |
| `safety` | Clinician restrictions, equipment AND/OR logic, substitutions, preferences |
| `scheduling` | Rescheduling, skipping, availability changes, repeated changes, data integrity |
| `records` | PR detection and recalculation, consistency, achievements, fatigue |
| `integration` | Full journeys: progression across sessions, missed workouts, corrections |

Notable invariants under test:

- Completed workouts are byte-identical before and after any schedule change.
- Repeated rescheduling and repeated availability changes never corrupt history.
- A user who hates every exercise in the database still gets a safe, full workout.
- Editing a historical load moves the PR and the next session's prescription.
- A minimum-mode session still counts as completed and keeps its priority-1 work.

---

## Spec coverage

All 70 sections are implemented. The MVP list in spec 70 is complete:

onboarding · goals · workout-day selection · equipment · limitations · exercise
database · workout generation · full-body 1–3 day · anterior/posterior 4+ day ·
logging · autosave · editing · submit confirmation · automatic progression ·
difficulty feedback · substitutions · rescheduling · dynamic scheduling ·
calendar · weight and strength tracking · graphs · PRs · rewards/confetti ·
dark mode · mobile-first UI

**Not built** (explicitly listed as future work in spec 37 / 70): voice coaching,
health-platform and wearable integrations, heart rate, sleep/recovery data,
nutrition, progress photos, exercise videos, conversational AI, multiple
concurrent programs, social features, cloud sync, and smartwatch support.

Screen-wake, haptics and offline logging are implemented; notifications are
wired as preferences but no scheduled push is delivered, since that requires a
service worker and platform permissions beyond the local-only MVP.

---

## Evidence basis

Training defaults are evidence-informed and kept configurable rather than treated
as immutable truth. Current ACSM resistance-training guidance supports
consistency, individualised programming, heavier loading for strength, sufficient
weekly volume for hypertrophy, and moderate loading with fast concentric intent
for power. Rep ranges, set targets, rest intervals and weekly volume targets are
all data in `engine/prescription.ts` and `engine/volume.ts` and can be tuned
without touching selection or progression logic.

---

## Safety

This application is a fitness programming tool, not a medical device. It does not
diagnose injuries or conditions, does not tell users that pain is harmless, does
not override clinician restrictions, and does not recommend training through
significant pain.
