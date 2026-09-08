<div align="center">

# Guitar Learning

**A guitar class that watches. Point a camera at your guitar, and it finds the
neck, follows your fretting hand, and tells you which finger goes where — while
you play, on your own instrument, with nothing leaving your machine.**

[![License: MIT](https://img.shields.io/badge/license-MIT-d9b45f)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-any%20modern%20browser-1f2430)](#)
[![Network](https://img.shields.io/badge/network-one%20model%20download-2b6e4f)](SECURITY.md)

</div>

## What it does

It does not make sound. That is the point: the sound is your guitar, and a
synthesiser would only compete with it. Everything the class knows, it knows by
looking.

1. **It finds the neck.** Either automatically — the strings and frets are two
   bundles of parallel lines, which is exactly what a Hough transform is for —
   or from four clicks on the corners of the fretboard. Once marked, it is
   remembered.
2. **It follows your hand.** MediaPipe's hand model runs on the GPU in your
   browser, and every fingertip is projected onto the fretboard, so the class
   knows which string and which fret each finger is on.
3. **It corrects you, finger by finger.** Not "wrong" — *"your ring finger is
   one string too low"*, with an arrow drawn from where it is to where it goes.
4. **It makes you hold it.** A chord counts when you keep it right for a
   moment. Sweeping past the right shape on the way somewhere else is exactly
   what should not be rewarded.

## What is in it

- **A course, in the order a teacher gives it.** Em first, because it is two
  fingers on adjacent strings; C later, because your hand has to open; the barre
  last, because it is the wall and arriving with four working chords is the
  difference between a hard week and quitting.
- **Two kinds of lesson.** *Shapes* — one chord at a time, held until it is
  right. *Changes* — the same few chords in a cycle, which is the part that
  actually takes months.
- **Free practice** over the whole chord library, unlocked from the first
  minute.
- **Your own songs.** Paste a chord chart — chords alone or over lyrics — and
  the class turns it into a sequence of shapes to learn, saying plainly which
  chords it does not know yet.
- **Acoustic or electric.** Not a sound: the shape of the instrument. Scale
  length, how wide the neck is, and how far up the fretboard a lesson may
  reasonably send you.
- **English and Spanish**, with the notes named the way each one names them.

## Things that look like bugs and are not

- **The first visit hangs for a few seconds.** It is downloading the
  hand-tracking model (~8 MB) once; your browser caches it after that.
- **The camera is not mirrored.** It cannot be: a mirrored neck reverses the
  string order and turns every fret number into its opposite.
- **The automatic detector cannot tell which side is the thick E.** Nothing in
  the geometry distinguishes them — that is which way round the guitar is, not
  what shape it is. Hence the *flip the sides* button.
- **A barre is judged as one finger, not six.** It is one finger doing one
  thing, and asking the camera to confirm six contact points under it would fail
  chords that are, in fact, correct.
- **The class is stricter or looser than you expect.** That is the Tolerance
  slider. A fingertip is wider than a string and the projection has error, so
  the strict end is still not merciless.

## Getting it running

```bash
npm install
npm run dev
```

Open http://localhost:3004 and allow the camera (it needs HTTPS or localhost).
`npm run build` produces a static `dist/` that deploys to any static host;
`vercel.json` carries the production security headers.

For the best chance at the automatic detector: light on the strings, the whole
neck in frame, and the guitar against a background that is not also full of
straight lines.

## Privacy

- Everything runs inside your browser. The camera image is never uploaded —
  there is no server to upload it to.
- No accounts, no analytics, no cookies. Your settings, your marked neck, your
  progress and your pasted chart live in your browser's local storage.
- The only network request is the one-time download of the hand-tracking model.
  That claim is enforced by a Content-Security-Policy, not just promised —
  details in [SECURITY.md](SECURITY.md).

## Where it came from

This started as [manos](https://github.com/malenitaa/manos), an instrument
played with bare hands in the air. The audio engine is gone; what was kept is
the part that was hard to build and applies just as well to watching a hand on a
fretboard — the tracking pipeline, the One Euro filtering, the hysteresis that
keeps a discrete reading from flickering, and the discipline of building every
piece of DOM without `innerHTML`.

See [ROADMAP.md](ROADMAP.md) for where it is going and [BITACORA.md](BITACORA.md)
for why each decision was made.

## License

[MIT](LICENSE)
