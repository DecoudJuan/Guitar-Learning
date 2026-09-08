/**
 * English strings. This file is the source of truth: its keys define the type
 * every other language has to satisfy, so a missing translation is a build
 * error rather than a blank label.
 */

export const enDictionary = {
  "app.title": "Guitar Learning",
  "app.tagline":
    "A guitar class that watches. The camera finds your fretboard and your hand and tells you which finger goes where — the sound is your own guitar's.",
  "app.privacy":
    "Needs camera access. The first run downloads the hand-tracking model, about 8 MB. Nothing is uploaded.",
  "app.start": "Start the class",
  "app.starting": "starting…",
  "app.error.camera": "Camera access is needed to see your hands and your guitar.",
  "app.error.generic": "Could not start: {message}",
  "app.hint.safari": "A heads-up: Safari can stutter under camera load. Chrome or Edge track much more smoothly.",
  "app.hint.mobile": "This really wants a computer — a phone frames a whole guitar neck poorly. Do look around, though!",

  "status.calibrate": "point the camera at the neck and mark it",
  "status.searching": "looking for the neck…",
  "status.noHand": "bring your fretting hand into the frame",
  "status.ready": "{fps} fps · {name}",
  "status.hold": "hold it… {seconds}s",
  "status.good": "that's it",

  "calibrate.title": "Mark the neck",
  "calibrate.intro":
    "Rest the guitar where the camera sees the whole neck, then click the four corners of the fretboard. Once marked, it is remembered.",
  "calibrate.step.1": "Click the **nut**, on the **thick E** side.",
  "calibrate.step.2": "Click the **nut**, on the **thin E** side.",
  "calibrate.step.3": "Click the **12th fret**, on the **thin E** side.",
  "calibrate.step.4": "Click the **12th fret**, on the **thick E** side.",
  "calibrate.hint": "The 12th fret is the one with the double dot, halfway along the string.",
  "calibrate.undo": "Undo point",
  "calibrate.reset": "Start over",
  "calibrate.auto": "Find it for me",
  "calibrate.auto.searching": "Looking for the neck…",
  "calibrate.auto.failed": "Could not find the neck. More light, or mark it by hand.",
  "calibrate.auto.found": "Neck found. Adjust it by hand if it sits wrong.",
  "calibrate.flip": "Flip the sides",
  "calibrate.done": "Done",
  "calibrate.saved": "Neck saved.",
  "calibrate.recalibrate": "Mark the neck again",

  "panel.toggle": "settings",
  "panel.guitar": "Guitar",
  "panel.hands": "Hands",
  "panel.practice": "Practice",
  "panel.view": "View",
  "panel.language": "Language",
  "panel.tolerance": "Tolerance",
  "panel.holdSeconds": "Hold to pass",
  "panel.smoothness": "Smoothness",
  "panel.tempo": "Tempo",
  "panel.showSkeleton": "Show the hand",
  "panel.showFretboard": "Show the fretboard grid",
  "panel.showNoteNames": "Name the notes",
  "panel.autoDetect": "Find the neck automatically",

  "guitar.acoustic": "Acoustic",
  "guitar.electric": "Electric",
  "hand.right": "Right-handed",
  "hand.left": "Left-handed",

  "lesson.toggle": "lessons",
  "lesson.title": "Lessons",
  "lesson.locked": "Finish the one before it",
  "lesson.start": "Start",
  "lesson.resume": "Continue",
  "lesson.stop": "Leave the lesson",
  "lesson.next": "Next",
  "lesson.skip": "Skip this one",
  "lesson.step": "{index} of {total}",
  "lesson.done.title": "Lesson finished",
  "lesson.done.body": "{correct} of {total} on the first try, best streak {streak}.",
  "lesson.progress": "{done}/{total}",
  "lesson.streak": "streak {count}",
  "lesson.freeplay": "Free practice",
  "lesson.freeplay.body": "Any chord you like. Pick one and the class checks it.",

  "chord.play": "Play {name}",
  "chord.open": "open string",
  "chord.muted": "do not play this one",
  "chord.barre": "barre with your index across fret {fret}",

  "judge.correct": "{finger}: right where it should be",
  "judge.wrongString": "{finger}: one string off — move it to the {string}",
  "judge.wrongFret": "{finger}: wrong fret — it goes on fret {fret}",
  "judge.missing": "{finger}: missing — fret {fret} of the {string}",
  "judge.extra": "{finger}: this one is not part of the chord",
  "judge.allGood": "The whole shape is right.",

  "finger.0": "Thumb",
  "finger.1": "Index",
  "finger.2": "Middle",
  "finger.3": "Ring",
  "finger.4": "Pinky",

  "string.1": "thin E",
  "string.2": "B",
  "string.3": "G",
  "string.4": "D",
  "string.5": "A",
  "string.6": "thick E",

  "song.toggle": "song",
  "song.title": "Practise a song",
  "song.intro": "Paste a chord chart. The class turns each chord into a shape to learn.",
  "song.placeholder": "Am        F         C         G",
  "song.load": "Load it",
  "song.clear": "Clear",
  "song.empty": "No chords found in that text.",
  "song.unknown": "{count} chord(s) in the chart are not in the library yet and were skipped.",
  "song.loaded": "{count} chords loaded.",

  "help.toggle": "how it works",
  "help.title": "How the class works",
  "help.body.1":
    "**Mark the neck once.** Four clicks on the corners of the fretboard, and the camera knows where every fret is.",
  "help.body.2": "**Put your fretting hand on the neck.** The class watches your fingertips, not the sound.",
  "help.body.3":
    "**Hold the shape.** A chord counts when you keep it right for a moment — that is the part that has to become automatic.",
  "help.body.4": "**Nothing leaves your machine.** No account, no upload, no recording.",
  "help.close": "Close",
} as const;

export type TranslationKey = keyof typeof enDictionary;
export type Dictionary = Record<TranslationKey, string>;
