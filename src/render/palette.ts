/**
 * The colours the class speaks in.
 *
 * Only three carry meaning, and they are the three a student needs at a
 * glance: this finger is right, this finger is wrong, this is where it should
 * go. Everything else on screen is deliberately quiet so those three read from
 * across a room.
 */

export const INK = "#f4f1ea";
export const DIM = "rgba(244, 241, 234, 0.55)";

/** A finger that is where the chord wants it. */
export const RIGHT = "hsl(146 62% 55%)";
export const RIGHT_SOFT = "hsl(146 62% 55% / 0.22)";

/** A finger on the wrong string or the wrong fret. */
export const WRONG = "hsl(6 78% 62%)";
export const WRONG_SOFT = "hsl(6 78% 62% / 0.22)";

/** Where a finger still has to go: the target that is not filled yet. */
export const TARGET = "hsl(38 92% 62%)";
export const TARGET_SOFT = "hsl(38 92% 62% / 0.20)";

/** The fretboard grid itself — present, never competing. */
export const GRID = "rgba(244, 241, 234, 0.22)";
export const GRID_STRONG = "rgba(244, 241, 234, 0.45)";

/** The hand skeleton. */
export const SKELETON = "rgba(120, 200, 255, 0.55)";

/** One colour per fretting finger, so a diagram and the camera agree. */
export const FINGER_COLOURS: Record<number, string> = {
  1: "hsl(200 85% 62%)",
  2: "hsl(268 70% 68%)",
  3: "hsl(320 70% 66%)",
  4: "hsl(48 90% 60%)",
};

export function fingerColour(finger: number): string {
  return FINGER_COLOURS[finger] ?? DIM;
}
