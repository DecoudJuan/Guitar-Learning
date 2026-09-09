<div align="center">

# Guitar Learning

**A guitar class that watches. Point a camera at your guitar, and it finds the
neck, follows your fretting hand, and tells you which finger goes where — while
you play, on your own instrument, with nothing leaving your machine.**

### [→ Open the class](https://guitar-learning-ten.vercel.app)

You need a guitar, a webcam, and four clicks on the corners of your fretboard.

[![License: MIT](https://img.shields.io/badge/license-MIT-d9b45f)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-any%20modern%20browser-1f2430)](https://guitar-learning-ten.vercel.app)
[![Dependencies](https://img.shields.io/badge/runtime%20dependencies-1-4a6fa5)](package.json)
[![Network](https://img.shields.io/badge/network-one%20model%20download-2b6e4f)](SECURITY.md)

</div>

## What it does

It makes no sound. That is the point: the sound is your guitar, and a
synthesiser would only compete with it. Everything the class knows, it knows by
looking.

1. **You mark the neck, once.** Four clicks — the two ends of the nut and the
   two ends of the 12th fret — and a four-point homography turns any pixel into
   a (string, fret) position and back. It is remembered for next time.
2. **It keeps the grid on the guitar as it moves.** A guitar on a lap does not
   stay still, so the marked neck is *tracked*: a grid of anchors over the
   fretboard, matched by normalised cross-correlation against the frame you
   calibrated in, and the homography re-fitted by consensus.
3. **It follows your hand.** MediaPipe's hand model runs on the GPU in your
   browser, and every fingertip is projected onto the fretboard, so the class
   knows which string and which fret each finger is on.
4. **It corrects you, finger by finger.** Not "wrong" — *"your ring finger is
   one string too low"*, with an arrow drawn from where it is to where it goes.
   "Wrong" teaches nobody anything.
5. **It makes you hold it.** A chord counts when you keep it right for a
   moment. Sweeping past the right shape on the way somewhere else is exactly
   what should not be rewarded.

## What is in it

- **A tuner**, because a class that starts on an out-of-tune guitar teaches the
  wrong thing. Six rows, one per string, each ticking off when it holds in tune.
  It is the only part of the app that listens, and only while it is open.
- **Eight lessons, in the order a teacher gives them.** Em first, because it is
  two fingers on adjacent strings; C later, because your hand has to open; the
  barre last, because it is the wall, and arriving at it with four working
  chords is the difference between a hard week and quitting.
- **Two kinds of lesson.** *Shapes* — one chord at a time, held until it is
  right. *Changes* — the same few chords in a cycle, which is the part that
  actually takes months.
- **39 chord shapes**, free to practise from the first minute.
- **Your own songs.** Paste a chord chart — chords alone or over lyrics — and
  the class turns it into a sequence of shapes to learn, saying plainly which
  chords it does not know yet.
- **Acoustic or electric.** Not a sound: the shape of the instrument. Scale
  length, how wide the neck is, and how far up the fretboard a lesson may
  reasonably send you.
- **English and Spanish**, with the notes named the way each language names
  them.

## How it works

Zero backend, one runtime dependency (`@mediapipe/tasks-vision`), no framework.
`App.frame()` is the spine: read the hands, pick the fretting one, project its
fingertips onto the neck, judge them against the chord the lesson asked for,
draw the one correction worth drawing.

```
tuner/     the only audio in the app: microphone -> pitch (MPM) -> nearest open string
vision/    camera + MediaPipe -> hand readings; homography; the neck detector
guitar/    geometry, tuning, chord library, Fretboard, FretReader, judge, NeckTracker
lesson/    curriculum, the hold-to-pass state machine, progress
render/    canvas overlay, what is worth drawing, the object-fit: cover maths
ui/        DOM panels, built without innerHTML, anywhere
song/      pasted chord chart -> chords
```

Three ideas carry most of it:

- **Frets are computed, not tabulated.** Fret *n* sits at `1 - 2^(-n/12)` of the
  scale length, so the 12th is at exactly 0.5 — which is why the calibration
  asks for the 12th fret, and why the neck is modelled as the trapezoid it
  physically is.
- **The homography does double duty.** As a *mapping*, it is what makes a
  fingertip into a (string, fret). As a *registration* — the panorama-stitching
  problem, pointed at one object — it is what keeps the grid on the guitar when
  the guitar moves.
- **The judge answers per finger, never per chord**, and then exactly one
  problem is shown. The camera knows more than a student can act on.

## Measured without a camera

Most of the hard logic is deliberately pure, so it can be exercised on a laptop
with the lid pointed at a wall:

```bash
npm run fret-check    # the fret-progression maths that tells a fretboard from a bedspread
npm run track-check   # the neck tracker's robust fit, against a known homography
npm run neck-check -- photo.png   # the whole detector pipeline over a still
node scripts/scene.mjs out/       # draws test scenes: a neck, a blanket, both, a hand in the way
```

Every constant with a number in its comment came from one of those, and
[BITACORA.md](BITACORA.md) records what each measurement changed — including the
ideas that were measured and thrown away.

## Things that look like bugs and are not

- **The automatic neck detector is off, on purpose.** *Find it for me* exists,
  and as of now it prefers answering nothing to answering wrong: measured
  against seven webcam frames of a real guitar in a real room, it returns
  nothing on all seven. Classic CV finds a bedspread, a headboard and the folds
  of a shirt before it finds six thin strings, and the honest state of that
  work — including what the fret progression `2^(-n/12)` does and does not
  settle — is written down in [BITACORA.md](BITACORA.md). Four clicks are the
  ground truth.
- **The first visit hangs for a few seconds.** It is downloading the
  hand-tracking model (~8 MB) once; your browser caches it after that.
- **The camera is not mirrored.** It cannot be: a mirrored neck reverses the
  string order and turns every fret number into its opposite.
- **A barre is judged as one finger, not six.** It is one finger doing one
  thing, and asking the camera to confirm six contact points under it would fail
  chords that are, in fact, correct.
- **The class is stricter or looser than you expect.** That is the Tolerance
  slider. A fingertip is wider than a string and the projection has error, so
  the strict end is still not merciless.

## Getting it running

```bash
npm install
npm run dev      # http://localhost:3004
```

The camera needs HTTPS or localhost. `npm run build` produces a static `dist/`
that deploys to any static host — with the caveat that `vercel.json` carries the
security headers the privacy claims below rest on, and a host that cannot send
headers cannot make those claims.

`tsc` in strict mode, with `noUnusedLocals` and `noUnusedParameters`, is the
only automated gate: `npm run typecheck`.

## Privacy

- Everything runs inside your browser. The camera image is never uploaded —
  there is no server to upload it to. The microphone is opened only while the
  tuner is on screen, is never recorded, and never reaches the speakers.
- No accounts, no analytics, no cookies, no web fonts, no third-party scripts.
  Your settings, your marked neck, your progress and your pasted chart live in
  your browser's local storage.
- The only network request is the one-time download of the hand-tracking model.
  That claim is enforced by a Content-Security-Policy, not merely promised —
  details in [SECURITY.md](SECURITY.md).

## Where it came from

This started as [manos](https://github.com/malenitaa/manos), an instrument
played with bare hands in the air. The audio engine is gone; what was kept is
the part that was hard to build and applies just as well to watching a hand on a
fretboard — the tracking pipeline, the One Euro filtering, the hysteresis that
keeps a discrete reading from flickering, and the discipline of building every
piece of DOM without `innerHTML`.

[ROADMAP.md](ROADMAP.md) is where it is going; [BITACORA.md](BITACORA.md) is why
each decision was made.

## License

[MIT](LICENSE)
