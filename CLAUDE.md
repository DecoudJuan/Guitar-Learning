# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev        # Vite on http://localhost:3004 (strictPort). Needs localhost or HTTPS for camera access.
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build -> dist/
npm run preview
```

`predev`/`prebuild` run `copy-wasm`, which copies the MediaPipe WASM out of
`node_modules` into `public/mediapipe/` (gitignored). If the tracker fails to
start with a WASM 404, that step did not run — `npm run copy-wasm` fixes it.

There is no test runner and no linter; `tsc` in strict mode (plus
`noUnusedLocals`/`noUnusedParameters`) is the only automated check. Several
modules deliberately export pure helpers so behaviour can be exercised without
a camera (`withHandGrace`, `environmentHintFor`, `readHand`, `qualityFromTilt`).

## Deployment

Two targets, and they disagree about the base path:
- **GitHub Pages** — `.github/workflows/deploy-pages.yml` on push to `main`.
  `vite.config.ts` sets `base: "/manos/"` for this. Anything that builds a URL
  must go through `import.meta.env.BASE_URL` (see `WASM_PATH` in `HandTracker`).
- **Vercel** — `vercel.json` carries the production security headers, including
  the CSP that enforces the privacy claims.

## Architecture

A zero-backend TypeScript app with one dependency (`@mediapipe/tasks-vision`).
Everything is a hand-written class over the Web Audio, Canvas, MediaDevices and
Web MIDI APIs; there is no framework. `src/main.ts` just constructs `App`.

`src/app/App.ts` is the only place the three halves meet, and its `frame()`
loop is the spine of the whole program — one `requestAnimationFrame` does:

1. `HandTracker.read(time)` → `HandReading[]`, sorted left-to-right.
2. `assignRoles()` decides which hand plays the chord and which shapes it,
   then `GestureReader.read()` turns each into a `PlayIntent`, and
   `buildChord`/`buildNote` turn that into frequencies + display names.
3. The frequencies are pushed to `Synth` (and mirrored to `MidiOut`).
4. `Visuals` draws; a video take composites its own frame separately.

Data flows one way through layers that do not know about each other:

```
vision/      camera + MediaPipe -> smoothed, mirrored, interpreted HandReading
gesture/     HandReading -> PlayIntent / ExpressionIntent (the rules of play)
music/       PlayIntent + scale + key -> Chord (frequencies, names, numeral)
audio/       Chord frequencies -> sound; also drums, WAV and video recording
render/,ui/  canvas overlay and the DOM panels
song/        pasted chart -> parsed chords -> a key choice + a gesture per chord
```

Layer boundaries worth respecting:

- **`src/gesture/mapping.ts` is the single source of truth for what a gesture
  means.** Finger count → degree, lean → quality zone, height → octave,
  horizontal edge → chromatic shift, other hand → volume/brightness/family.
  Changing how the instrument plays means changing this file, not App.
- **`src/music/theory.ts` derives chords from scale step tables** rather than
  listing them. A new scale is one line of semitone offsets and still gets
  correct triads, sevenths and roman numerals. `Scale` is a union: `kind:
  "steps"` (transposable) vs `kind: "tones"` (fixed Hz, e.g. solfeggio — it
  has no key and ignores tuning; several call sites branch on this).
- **`Synth` is declarative.** Callers never say play/stop; they say "these are
  the notes sounding now" (`setNoteGroups` / `glideNotes` / `releaseAll`) and
  the synth diffs against the previous frame. That diff is what makes held
  notes not re-attack across chord changes.
- **`src/song/plan.ts`** scores every parsed chord in every candidate key and
  picks the key with the lowest total cost — i.e. the key where the song needs
  the fewest leans, family changes and edge shifts.

### Stability machinery (do not remove it casually)

Camera input is noisy and every jitter is audible. Four separate mechanisms
exist for this, each solving a different failure the naive version had:

- `vision/smoothing.ts` — One Euro filter per landmark coordinate.
- `gesture/Steady.ts` — a discrete value must hold N frames before it is
  accepted; returning to the held value is instant.
- Hysteresis on every threshold: finger extension (`EXTEND_ABOVE` /
  `RETRACT_BELOW` in `readHand.ts`), lean zones, octave edges, edge shift.
- `withHandGrace` in `HandTracker.ts` — a briefly-lost hand keeps playing for
  `GRACE_MS`, per hand, so losing one of two does not reshuffle roles.

The Smoothness setting drives three of these at once (`responseFor` in
`app/settings.ts` → `App.applyResponse`).

Two related invariants: finger shape and openness are measured on the model's
**world** (real-space) landmarks so they survive hand rotation, while position
and lean use the flat, mirrored image landmarks. Hand roles are sticky by
physical hand id, never by the model's left/right label, which flickers exactly
when a hand turns.

## Constraints inherited from SECURITY.md

These are enforced properties, not style preferences — read `SECURITY.md`
before touching any of them:

- **No `innerHTML`, anywhere.** All DOM construction goes through
  `src/ui/dom.ts` (`element`, `requireElement`, `clear`) plus `textContent`.
  Pasted chord charts and translation strings are untrusted data.
- **`localStorage` is hostile input.** `app/settings.ts` validates and clamps
  every field on load and drops unknown keys; a corrupt entry falls back to
  defaults. Keep new settings validated. Keys: `manos.settings.v1`,
  `manos.song.v1`.
- **Exactly one outbound request** — the hand-tracking model from
  `storage.googleapis.com`. The production CSP's `connect-src` allows only that
  and `'self'`; anything else fails in production only.
- **`recorder-processor.js` must stay a real file.** `vite.config.ts` pins its
  `assetsInlineLimit` to false, because an AudioWorklet inlined as a `data:`
  URL works in dev and is blocked by the CSP in production.
- No analytics, cookies, accounts, web fonts, audio files or third-party
  scripts. Every sound is synthesized live.

## i18n

`src/i18n/en.ts` is the source of truth: its keys define `TranslationKey`, so a
missing Spanish string is a compile error. Add English first. Locales also
choose note notation (`letter` for en, `solfege` for es) — most user-facing
labels show both, led by the locale's preference. Emphasis in translations is
written with `**asterisks**` and rendered via `renderEmphasis`.
