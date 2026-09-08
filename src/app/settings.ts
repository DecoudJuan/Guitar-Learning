/**
 * Everything the student can change, plus saving it between visits.
 *
 * Stored values are treated as untrusted: anything can be in localStorage, so
 * every field is validated and clamped on the way in and unknown keys are
 * dropped. A corrupted entry falls back to the defaults instead of throwing.
 */

import { detectLanguage, isLanguage, type Language } from "../i18n";

const STORAGE_KEY = "guitar.settings.v1";

/**
 * Acoustic or electric. This is not a sound — nothing here makes sound. It is
 * the shape of the instrument: scale length, how wide the neck is at the nut,
 * and how far up the fretboard a lesson may reasonably send you.
 */
export type GuitarKind = "acoustic" | "electric";

/** Which hand frets. A right-handed guitar is fretted with the left hand. */
export type Handedness = "right" | "left";

export interface Settings {
  language: Language;
  guitar: GuitarKind;
  handedness: Handedness;
  /**
   * How generous the judging is, 0 (a fingertip must sit near the middle of the
   * box) to 1 (anywhere in the neighbourhood counts). A beginner needs room; a
   * student polishing a shape wants the truth.
   */
  tolerance: number;
  /** How long a shape has to be held, in seconds, before it counts as learnt. */
  holdSeconds: number;
  /**
   * How much the tracking is smoothed, 0 (immediate, twitchy) to 1 (calm,
   * a beat behind). Drives the landmark filter, how long a change has to hold,
   * and how often the model runs.
   */
  smoothness: number;
  /** Beats per minute for the silent metronome used in change drills. */
  tempo: number;
  /** Draw the hand skeleton over the camera. */
  showSkeleton: boolean;
  /** Draw the detected fretboard grid over the camera. */
  showFretboard: boolean;
  /** Write the note name (E, A, D…) on each target. */
  showNoteNames: boolean;
  /** Try to find the neck automatically instead of using only the calibration. */
  autoDetect: boolean;
}

export type SettingKey = keyof Settings;

export function defaultSettings(): Settings {
  return {
    language: detectLanguage(),
    guitar: "acoustic",
    handedness: "right",
    tolerance: 0.55,
    holdSeconds: 1,
    smoothness: 0.55,
    tempo: 72,
    showSkeleton: true,
    showFretboard: true,
    showNoteNames: true,
    autoDetect: true,
  };
}

/** Ranges for the sliders, shared by the UI and by validation. */
export const RANGES = {
  tolerance: { min: 0, max: 1, step: 0.01 },
  holdSeconds: { min: 0.3, max: 4, step: 0.1 },
  smoothness: { min: 0, max: 1, step: 0.01 },
  tempo: { min: 40, max: 180, step: 1 },
} as const;

export type RangeKey = keyof typeof RANGES;
export const RANGE_KEYS = Object.keys(RANGES) as RangeKey[];

/**
 * What the smoothness slider actually controls. Inherited from the gesture
 * instrument this project grew out of, and it matters more here, not less: a
 * fingertip judged against a fret box is a discrete decision, and a discrete
 * decision taken sixty times a second on noisy input flickers.
 */
export interface ResponseProfile {
  /** One Euro cutoff for the landmarks. Higher follows the hand more closely. */
  minCutoff: number;
  beta: number;
  /** Frames a changed reading must hold before it is believed. */
  framesNeeded: number;
  /** Minimum ms between hand-model inferences; 0 runs on every camera frame. */
  inferenceInterval: number;
}

const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function responseFor(smoothness: number): ResponseProfile {
  const s = Math.min(1, Math.max(0, smoothness));
  return {
    minCutoff: mix(2.8, 0.4, s),
    beta: mix(0.08, 0.015, s),
    framesNeeded: Math.round(mix(2, 9, s)),
    inferenceInterval: s < 0.35 ? 0 : 30,
  };
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function isGuitarKind(value: unknown): value is GuitarKind {
  return value === "acoustic" || value === "electric";
}

export function isHandedness(value: unknown): value is Handedness {
  return value === "right" || value === "left";
}

export function loadSettings(): Settings {
  const settings = defaultSettings();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked entirely; the defaults are fine.
    return settings;
  }
  if (!raw) return settings;

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return settings;
  }
  if (typeof stored !== "object" || stored === null) return settings;
  const data = stored as Record<string, unknown>;

  if (isLanguage(data.language)) settings.language = data.language;
  if (isGuitarKind(data.guitar)) settings.guitar = data.guitar;
  if (isHandedness(data.handedness)) settings.handedness = data.handedness;
  for (const key of RANGE_KEYS) {
    settings[key] = clampNumber(data[key], RANGES[key].min, RANGES[key].max, settings[key]);
  }
  settings.tempo = Math.round(settings.tempo);
  settings.showSkeleton = readBoolean(data.showSkeleton, settings.showSkeleton);
  settings.showFretboard = readBoolean(data.showFretboard, settings.showFretboard);
  settings.showNoteNames = readBoolean(data.showNoteNames, settings.showNoteNames);
  settings.autoDetect = readBoolean(data.autoDetect, settings.autoDetect);

  return settings;
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing or a full quota. Not worth interrupting anyone over.
  }
}
