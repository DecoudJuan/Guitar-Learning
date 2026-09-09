/**
 * Following a small piece of picture from one frame to the next.
 *
 * This is the oldest trick in image registration and still the right one for
 * small motion: take a square of pixels around a point, then in the next frame
 * look for the square that matches it best, a few pixels either way.
 *
 * Two details do all the work of making it not drift and not lie:
 *
 *   - **Normalised cross-correlation**, not raw difference. A cloud passing the
 *     window, or a hand shading the neck, changes every pixel's brightness at
 *     once; NCC divides that out and compares *shape*, so the match survives
 *     the room's lighting changing under it.
 *   - **The template stays the original.** Matching each frame against the
 *     previous one accumulates a fraction of a pixel of error every time, and
 *     after a minute the grid has walked off the guitar. Matching always
 *     against the frame the student calibrated in cannot drift at all — it can
 *     only lose the point, which is a failure that announces itself.
 *
 * Pure arithmetic over greyscale buffers: no canvas, no camera.
 */

import type { Point } from "./landmarks";

/** Side of the square taken around each tracked point, in working pixels. */
export const PATCH = 15;

/** How far a point is allowed to have moved between two tracked frames. */
export const SEARCH = 12;

/** Below this correlation the point is considered lost rather than moved. */
export const MIN_SCORE = 0.55;

export interface Patch {
  /** Where this patch was taken from, in the reference frame. */
  origin: Point;
  /** The pixels, mean-removed, ready for correlation. */
  values: Float32Array;
  /** The square root of the sum of squares, precomputed for the denominator. */
  norm: number;
}

/**
 * Lifts a patch out of a frame. Returns null near the edges, and — importantly
 * — for a patch with no contrast in it: a flat piece of wood correlates equally
 * well with every other flat piece of wood, so tracking it produces confident
 * nonsense.
 */
export function takePatch(grey: Float32Array, width: number, height: number, at: Point): Patch | null {
  const half = Math.floor(PATCH / 2);
  const cx = Math.round(at.x);
  const cy = Math.round(at.y);
  if (cx - half < 0 || cy - half < 0 || cx + half >= width || cy + half >= height) return null;

  const values = new Float32Array(PATCH * PATCH);
  let sum = 0;
  for (let y = 0; y < PATCH; y++) {
    for (let x = 0; x < PATCH; x++) {
      const value = grey[(cy - half + y) * width + (cx - half + x)];
      values[y * PATCH + x] = value;
      sum += value;
    }
  }

  const mean = sum / values.length;
  let energy = 0;
  for (let i = 0; i < values.length; i++) {
    values[i] -= mean;
    energy += values[i] * values[i];
  }

  // Featureless. Tracking it would return whichever position the noise
  // happened to favour, with a high score, which is the worst kind of answer.
  if (energy < 12 * values.length) return null;

  return { origin: { x: cx, y: cy }, values, norm: Math.sqrt(energy) };
}

export interface Match {
  at: Point;
  score: number;
}

/**
 * Finds a patch again, searching around where it was last seen.
 *
 * The answer is refined to sub-pixel by fitting a parabola through the best
 * score and its neighbours — the same trick the pitch detector uses, and for
 * the same reason: whole-pixel answers quantise the homography into visible
 * steps as the guitar moves.
 */
export function findPatch(
  patch: Patch,
  grey: Float32Array,
  width: number,
  height: number,
  near: Point,
): Match | null {
  const half = Math.floor(PATCH / 2);
  let best = -Infinity;
  let bestX = 0;
  let bestY = 0;
  // Scores around the winner, for the sub-pixel fit.
  let left = 0;
  let right = 0;
  let up = 0;
  let down = 0;

  const scoreAt = (cx: number, cy: number): number => {
    if (cx - half < 0 || cy - half < 0 || cx + half >= width || cy + half >= height) return -Infinity;

    let sum = 0;
    for (let y = 0; y < PATCH; y++) {
      const row = (cy - half + y) * width + (cx - half);
      for (let x = 0; x < PATCH; x++) sum += grey[row + x];
    }
    const mean = sum / (PATCH * PATCH);

    let dot = 0;
    let energy = 0;
    for (let y = 0; y < PATCH; y++) {
      const row = (cy - half + y) * width + (cx - half);
      for (let x = 0; x < PATCH; x++) {
        const value = grey[row + x] - mean;
        dot += value * patch.values[y * PATCH + x];
        energy += value * value;
      }
    }
    if (energy <= 0) return -Infinity;
    return dot / (patch.norm * Math.sqrt(energy));
  };

  const centreX = Math.round(near.x);
  const centreY = Math.round(near.y);
  const scores = new Map<string, number>();

  for (let dy = -SEARCH; dy <= SEARCH; dy++) {
    for (let dx = -SEARCH; dx <= SEARCH; dx++) {
      const score = scoreAt(centreX + dx, centreY + dy);
      scores.set(`${dx},${dy}`, score);
      if (score > best) {
        best = score;
        bestX = dx;
        bestY = dy;
      }
    }
  }

  if (!Number.isFinite(best) || best < MIN_SCORE) return null;

  left = scores.get(`${bestX - 1},${bestY}`) ?? best;
  right = scores.get(`${bestX + 1},${bestY}`) ?? best;
  up = scores.get(`${bestX},${bestY - 1}`) ?? best;
  down = scores.get(`${bestX},${bestY + 1}`) ?? best;

  return {
    at: {
      x: centreX + bestX + parabolic(left, best, right),
      y: centreY + bestY + parabolic(up, best, down),
    },
    score: best,
  };
}

/** The offset of a parabola's peak, given three samples around it. */
function parabolic(before: number, here: number, after: number): number {
  const curvature = before - 2 * here + after;
  if (curvature === 0) return 0;
  const shift = (0.5 * (before - after)) / curvature;
  return Math.abs(shift) < 1 ? shift : 0;
}
