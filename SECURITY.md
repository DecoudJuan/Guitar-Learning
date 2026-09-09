# Security notes

Guitar Learning is a static site with no server component: the code your browser
downloads is the whole product, and this document describes exactly what that
code touches. Every claim here comes from reading the source, not from
intentions.

## What it touches

| Surface | Access | Written by |
| --- | --- | --- |
| Camera | Read, live, while the class runs (`getUserMedia`, video only) | Nothing — frames are drawn to a local canvas and discarded |
| Microphone | Read, **only** while the tuner panel is open | Nothing — the signal reaches an analyser and stops there |
| `localStorage["guitar.settings.v1"]` | Read/write | The app — your control-panel choices |
| `localStorage["guitar.calibration.v1"]` | Read/write | The app — the four corners of your neck |
| `localStorage["guitar.progress.v1"]` | Read/write | The app — which lessons you have finished |
| `localStorage["guitar.song.v1"]` | Read/write | The app — the chord chart you pasted |

That is the complete list. There is no recording, no file download and no MIDI:
the class produces no sound, and the permissions policy shipped with the site
turns those capabilities off rather than leaving them merely unused.

The microphone is the one exception, and it is worth being precise about. It is
opened when the tuner panel opens and released — tracks stopped, context closed
— when it closes or when the tab is hidden, so the browser's own recording
indicator is an accurate account of when the app is listening. The signal is
connected to an `AnalyserNode` and to nothing else: it never reaches the
speakers (which is also what makes feedback impossible), it is never written
anywhere, and only the *pitch* derived from it is ever used. Tuning is the one
thing a camera cannot do — a slack string and a tight one are the same picture.

## Network

Exactly one request leaves your machine: the hand-tracking model (~8 MB) is
fetched once from Google's MediaPipe CDN (`storage.googleapis.com`) and cached
by the browser. Everything else — including the MediaPipe WASM runtime, which
is copied out of `node_modules` at build time — is served from the site's own
origin. There are no web fonts and no third-party scripts.

This is enforced rather than promised: the deployed site ships a
Content-Security-Policy whose `connect-src` allows only the site itself and that
single host. A future feature that tried to phone anywhere else would fail
loudly until the policy was consciously widened.

## What it never does

- No analytics, no telemetry, no cookies, no accounts.
- The camera image and the microphone signal are never uploaded, stored, or kept
  after the tab closes.
- Nothing is recorded. There is no code path that produces a file.
- The microphone is never opened outside the tuner, and its signal is never
  routed to an output.

## Untrusted input

Foreign text enters in two places, and neither can inject anything:

- **Pasted chord charts** are parsed with a strict grammar and rendered
  exclusively through `createElement`/`textContent`. The code base contains zero
  `innerHTML` — a chart is data, never markup.
- **`localStorage` is treated as hostile.** Every stored field is validated
  against whitelists and clamped ranges when loaded; anything malformed falls
  back to defaults. That includes the calibration corners, which are checked for
  finite numbers in a plausible range before they are ever fed to the
  homography.

**A warning for future editors:** keep it that way. All DOM construction goes
through `src/ui/dom.ts`; the first string-built markup added anywhere creates
exactly the injection this design rules out.

## Less proven

- Chrome and Edge are the tested browsers. Safari runs but can stutter under
  camera load — the start screen says so.
- The automatic neck detector is heuristic and fails quietly rather than
  wrongly: below a confidence threshold it reports nothing and the student marks
  the neck by hand. It cannot distinguish the thick E side from the thin E side
  at all, which is why the interface offers a flip rather than guessing twice.
- The projection assumes a fingertip sits on the plane of the fretboard. It sits
  a few millimetres above it, so a camera far off-axis will read fingers
  slightly out of place. The tolerance setting exists to absorb that.
- The pitch detector is checked against synthesised plucks, not against a room.
  It refuses to answer below a measured clarity threshold rather than reporting
  a confident wrong note, so a noisy room reads as silence — the failure it was
  tuned to prefer. It also cannot always tell a fretted note from a badly
  mis-tuned open string; a pitch more than a semitone and a half from any open
  string is reported as nothing at all.
- Phones render the site but frame a whole guitar neck poorly; this is a desktop
  experience and the start screen is honest about it.

## Reporting

Found something? Open an issue at
[github.com/DecoudJuan/Guitar-Learning/issues](https://github.com/DecoudJuan/Guitar-Learning/issues).
