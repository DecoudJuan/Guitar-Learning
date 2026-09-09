# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser guitar class. The camera finds the fretboard and the fretting hand and
corrects finger placement in real time. **It produces no sound at all** — the
sound is the student's guitar. There is no synth, no MIDI, no audio recording,
and adding any would be a regression, not a feature. It does *listen*, in
exactly one place: the tuner (`src/tuner/`), because tuning is the one thing a
camera cannot do. "Acoustic" and "electric"
are *guitar shapes* (scale length, neck width, reachable frets), never timbres.

It was forked from `manos`, a gesture instrument; the vision pipeline is
inherited, the entire audio engine was deleted. `BITACORA.md` records why each
decision was made and `ROADMAP.md` where it is going — read them before large
changes, and add to `BITACORA.md` when you make one.

## Commands

```bash
npm install
npm run dev        # Vite on http://localhost:3004 (strictPort). Camera needs localhost or HTTPS.
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build -> dist/
npm run preview
```

`predev`/`prebuild` run `copy-wasm` (`scripts/copy-wasm.mjs`), which copies the
MediaPipe runtime into `public/mediapipe/` (gitignored). A WASM 404 at startup
means that step did not run.

There is no test runner and no linter; `tsc` in strict mode (with
`noUnusedLocals`/`noUnusedParameters`) is the only automated check. Much of the
hard logic is deliberately pure so it can be exercised without a camera:
`homography.ts`, `geometry.ts`, `judge.ts`, `viewport.ts`, `withHandGrace`,
`environmentHintFor`.

## Deployment

Vercel, from the domain root (`base: "/"`). `vercel.json` carries the CSP that
enforces the privacy claims in `SECURITY.md`. Runtime URLs still go through
`import.meta.env.BASE_URL` (see `WASM_PATH` in `HandTracker`).

## Architecture

Zero backend, one runtime dependency (`@mediapipe/tasks-vision`), no framework.
`src/main.ts` constructs `App`, and `App.frame()` is the spine:

1. `HandTracker.read(time)` → `HandReading[]` (unmirrored camera coordinates).
2. `FretReader.pick()` chooses the fretting hand, `.read()` projects its
   fingertips onto the neck via `Fretboard`.
3. `judge()` compares that against the `ChordTarget` the lesson asked for;
   `Session.update()` runs the hold timer and advances.
4. `chordLayer()` decides what is worth drawing, `Overlay` draws it, `Coach`
   says the one thing worth saying.

```
tuner/     the only audio in the app: microphone -> pitch (MPM) -> nearest open string
vision/    camera + MediaPipe -> HandReading; homography; classic-CV neck detector
guitar/    the instrument: geometry, tuning, chord library, Fretboard, FretReader, judge
lesson/    curriculum, Session (the hold-to-pass state machine), progress
render/    Overlay (canvas), chordLayer, viewport (the object-fit: cover maths), palette
ui/        DOM panels: Panel, Coach, Diagram, Calibrator, LessonList, SongPanel, Help
song/      pasted chord chart -> parsed chords (reused untouched from manos)
```

### The load-bearing ideas

- **Two coordinate systems, and one class that joins them.** `geometry.ts` works
  in *scale lengths* on a flat fretboard and knows nothing about cameras;
  `homography.ts` is pure projective maths. `Fretboard` holds a four-point
  homography between them and is the only thing that answers "where does this
  finger go" / "what is this fingertip pressing". Keep that split.
- **Frets are computed, not tabulated:** fret n at `1 - 2^(-n/12)`, so the 12th
  is at exactly 0.5 — which is why the calibration asks for the 12th fret. The
  neck is modelled as the trapezoid it physically is.
- **The chord library stores fingerings, not note sets.** Six entries per shape,
  thick E first, the way every tab and songbook writes them. A barre collapses
  into one `Placement` (see `targetOf`), because six contact points under one
  finger fail on chords that are correct.
- **The judge returns a verdict per finger, never per chord.** "Wrong" teaches
  nobody anything. `firstProblem()` picks the single instruction to show.
- **A chord must be *held*** (`Session`). Passing the instant fingers align
  would reward a hand sweeping past the shape.
- **`camera coordinates ≠ canvas pixels`.** The video is `object-fit: cover`;
  every conversion goes through `render/viewport.ts`, in both directions
  (calibration clicks come back the other way).
- **The camera is never mirrored.** A mirrored neck reverses the string order
  and every fret number. `readHand` therefore does *not* flip the model's
  handedness label.

### Stability machinery (do not remove it casually)

Camera input is noisy and every jitter becomes a wrong verdict on screen:

- `vision/smoothing.ts` — One Euro filter per landmark coordinate.
- `util/Steady.ts` — a discrete value must hold N frames before it is accepted;
  returning to the held value is instant. Used per finger in `FretReader`.
- Hysteresis on finger extension (`EXTEND_ABOVE`/`RETRACT_BELOW` in `readHand`).
- `withHandGrace` in `HandTracker` — a briefly-lost hand lingers for `GRACE_MS`.

The Smoothness setting drives three of these at once (`responseFor` in
`app/settings.ts` → `App.applyResponse`).

Related invariant: finger shape is measured on the model's **world**
(real-space) landmarks so it survives a turned hand; position uses the flat
image landmarks.

### The tuner

`tuner/pitch.ts` is the McLeod Pitch Method (normalised square difference), not
plain autocorrelation — whose peaks shrink with lag and therefore read the thick
E as its own octave. It picks the *first* peak within 90% of the best, not the
best, for the same octave reason. It is pure over a sample buffer, so it can be
checked against synthesised plucks with no hardware; `MIN_CLARITY` was set from
those measurements, not guessed, and it prefers answering nothing to answering
wrong. `tuner/strings.ts` maps a pitch to the nearest *open string* in cents —
a beginner needs "that is your D string", not "F#, 40 cents flat".

### The neck detector — known not to work yet

`vision/NeckDetector.ts` is classic CV on purpose (a second neural model would
cost megabytes and GPU time competing with the hand tracker), but as of F12 it
still picks bedding stripes over a fretboard on real photographs, so
`autoDetect` ships **off**. Do not turn it back on without evidence.

Measure before changing anything here: `detectInGrey` is separate from the
canvas so `npm run neck-check -- photo.png` runs the whole pipeline against a
still. Every constant with a number in its comment came from that. The open
problem is stated in ROADMAP; the untried leads are the logarithmic fret
progression and the strings sharing a vanishing point.

Manual calibration is the ground truth, and `guitar/corners.ts` makes it
independent of click order — a wrong order used to silently transpose the two
axes of the fretboard and spread every chord across the neck.

## Constraints inherited from SECURITY.md

- **No `innerHTML`, anywhere.** All DOM goes through `src/ui/dom.ts` plus
  `textContent`. Pasted charts and translations are untrusted data.
- **`localStorage` is hostile input.** Validate and clamp every field on load;
  a corrupt entry falls back to defaults. Keys: `guitar.settings.v1`,
  `guitar.calibration.v1`, `guitar.progress.v1`, `guitar.song.v1`.
- **Exactly one outbound request** — the hand model from
  `storage.googleapis.com`. The CSP's `connect-src` allows nothing else, so a
  new fetch fails in production only.
- No analytics, cookies, accounts, web fonts, third-party scripts, or file
  downloads.
- **The microphone is the tuner's and nothing else's.** Opened on
  `TunerPanel.setOpen(true)`, released on close and on `visibilitychange`. It is
  connected to an `AnalyserNode` and never to a destination — connecting it
  downstream would both break the privacy claim and create feedback.

## i18n

`src/i18n/en.ts` is the source of truth: its keys define `TranslationKey`, so a
missing Spanish string is a compile error. Add English first. Locales also pick
note notation (`letter` for en, `solfege` for es). Emphasis is written with
`**asterisks**` and rendered via `renderEmphasis` — never as markup.
