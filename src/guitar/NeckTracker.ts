/**
 * Keeping the neck where it really is, after the guitar moves.
 *
 * The calibration is a photograph of a moment: four corners, marked once. A
 * guitar on a lap does not stay in that moment — it drifts as you shift, tilts
 * as you reach for a barre, and by the fourth chord the grid is a few
 * centimetres from the wood. Re-marking it every time is not a class.
 *
 * This is image registration, the panorama-stitching problem, pointed at one
 * object: find the transform between the view the student calibrated in and the
 * view the camera has now. What makes it tractable is that we are not looking
 * for the neck any more — we already know where it *was*, and where every point
 * on it *should* be. That is a much smaller question than the detector's, and
 * unlike the detector it does not need to tell a fretboard from a bedspread.
 *
 * How it works:
 *
 *   1. When the neck is marked, a grid of points is laid out across the
 *      *fretboard* — in board coordinates, so their meaning is exact — and a
 *      small square of picture is kept around each one.
 *   2. Every so often, each square is looked for again nearby.
 *   3. The transform that the largest number of them agree on is found, and
 *      fitted properly over exactly those.
 *
 * Because the fit is over a dozen points and needs only eight numbers, a hand
 * covering a third of the neck costs accuracy rather than the whole answer.
 */

import { applyHomography, homographyFrom, homographyFromMany } from "../vision/homography";
import type { Point } from "../vision/landmarks";
import { findPatch, takePatch, type Patch } from "../vision/patches";
import type { Fretboard, Corners } from "./Fretboard";
import { fretCentre, halfWidthAt, type BoardPoint, type GuitarSpec } from "./geometry";

/** The frame is shrunk to this width before anything is matched. */
const WORK_WIDTH = 320;

/** How often the neck is looked for again. Ten times a second is far more than
 *  a guitar on a lap actually moves, and a twentieth of the cost of every frame. */
const INTERVAL_MS = 100;

/** Points needed to trust a new fit. Eight numbers want more than four points. */
const MIN_TRACKED = 6;

/** A point further than this from a fitted transform is not describing the same
 *  neck as the others — a hand moved over it, or the match was luck. In working
 *  pixels, so about one per cent of the frame's width. */
const OUTLIER_PIXELS = 3;

/**
 * How many four-point guesses to try before settling.
 *
 * With a sixth of the anchors wrong, a random four are all good about half the
 * time, so a few dozen tries make missing the right answer vanishingly
 * unlikely. Sixty is far past that and still nothing next to a video frame.
 */
const CONSENSUS_TRIES = 60;

interface Anchor {
  /** Where this point lives on the instrument. Exact, and never re-estimated. */
  board: BoardPoint;
  /** The piece of picture that was there when the neck was marked. */
  patch: Patch;
  /** Where it was last seen, in working pixels. */
  seen: Point;
}

export class NeckTracker {
  private canvas = document.createElement("canvas");
  private width = 0;
  private height = 0;
  private anchors: Anchor[] = [];
  private lastRun = 0;

  /** How many anchors were matched on the last pass, for the status line. */
  held = 0;

  get ready(): boolean {
    return this.anchors.length >= MIN_TRACKED;
  }

  /** Throws the anchors away — after a recalibration, or a guitar change. */
  forget() {
    this.anchors = [];
    this.held = 0;
  }

  /**
   * Takes the reference: a grid of points over the fretboard, each with the
   * picture that was around it. Called once, when the neck is marked.
   */
  anchor(video: HTMLVideoElement, board: Fretboard, spec: GuitarSpec) {
    this.forget();
    const frame = this.grab(video);
    if (!frame) return;

    for (const point of gridOver(spec, board.farFret)) {
      const camera = board.toCamera(point);
      const inFrame = { x: camera.x * this.width, y: camera.y * this.height };
      const patch = takePatch(frame, this.width, this.height, inFrame);
      // Featureless squares are skipped rather than tracked badly: bare wood
      // between two frets matches every other piece of bare wood.
      if (!patch) continue;
      this.anchors.push({ board: point, patch, seen: inFrame });
    }
  }

  /**
   * Looks for the neck again. Returns fresh corners when it is confident, and
   * null the rest of the time — which the caller reads as "keep what you have"
   * rather than as an error. Losing the guitar for a second should never blank
   * the lesson.
   */
  track(video: HTMLVideoElement, nowMs: number, spec: GuitarSpec, farFret: number): Corners | null {
    if (!this.ready || nowMs - this.lastRun < INTERVAL_MS) return null;
    this.lastRun = nowMs;

    const frame = this.grab(video);
    if (!frame) return null;

    const boardPoints: BoardPoint[] = [];
    const imagePoints: Point[] = [];

    for (const anchor of this.anchors) {
      const match = findPatch(anchor.patch, frame, this.width, this.height, anchor.seen);
      if (!match) continue;
      anchor.seen = match.at;
      boardPoints.push(anchor.board);
      imagePoints.push(match.at);
    }

    this.held = boardPoints.length;
    if (boardPoints.length < MIN_TRACKED) return null;

    const fitted = fitRobust(boardPoints, imagePoints);
    if (!fitted) return null;

    // Back out to the four corners, because that is the shape the rest of the
    // app speaks in — and going through them means a tracked neck is checked by
    // exactly the same sanity rules as a marked one.
    const across = (x: number) => halfWidthAt(spec, x);
    const farX = 1 - Math.pow(2, -farFret / 12);
    const corners = [
      { x: 0, y: across(0) },
      { x: 0, y: -across(0) },
      { x: farX, y: -across(farX) },
      { x: farX, y: across(farX) },
    ].map((point) => {
      const image = applyHomography(fitted, point);
      return { x: image.x / this.width, y: image.y / this.height };
    }) as Corners;

    return corners;
  }

  /** One frame, shrunk and greyed. */
  private grab(video: HTMLVideoElement): Float32Array | null {
    if (video.readyState < 2 || video.videoWidth === 0) return null;

    this.width = WORK_WIDTH;
    this.height = Math.max(2, Math.round((video.videoHeight / video.videoWidth) * WORK_WIDTH));
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    const context = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0, this.width, this.height);

    const pixels = context.getImageData(0, 0, this.width, this.height).data;
    const grey = new Float32Array(this.width * this.height);
    for (let i = 0, p = 0; i < grey.length; i++, p += 4) {
      grey[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
    }
    return grey;
  }
}

/**
 * Where to put the anchors: spread along the neck and across it, but kept off
 * the very edges, where a patch would be half wood and half room and would stop
 * matching the moment the background moved.
 */
function gridOver(spec: GuitarSpec, farFret: number): BoardPoint[] {
  const points: BoardPoint[] = [];
  const lastFret = Math.max(3, farFret);

  for (let fret = 1; fret <= lastFret; fret++) {
    const x = fretCentre(fret);
    const half = halfWidthAt(spec, x) * 0.7;
    for (const y of [-half, 0, half]) points.push({ x, y });
  }
  return points;
}

/**
 * Fits the transform over the points that agree with each other.
 *
 * The first version of this fitted everything at once and then dropped whatever
 * disagreed with the result. Measured, that does not work, and the way it fails
 * is worth remembering: three bad anchors out of eighteen dragged the fit
 * forty-five pixels off, and from *there* the good points looked wrong too — it
 * kept two anchors and gave up. Least squares has no defence against outliers,
 * because it is busy accommodating them.
 *
 * So the outliers are found before they are fitted, not after. Four anchors are
 * picked at random, the exact transform through them is measured against
 * everyone else, and the guess with the largest agreement wins. Only then is
 * least squares run, over the points that agreed — which is the part it is
 * good at.
 */
function fitRobust(board: BoardPoint[], image: Point[]) {
  let bestInliers: number[] = [];

  for (let attempt = 0; attempt < CONSENSUS_TRIES; attempt++) {
    const sample = pickFour(board.length);
    if (!sample) break;

    const guess = homographyFrom(
      sample.map((i) => board[i]),
      sample.map((i) => image[i]),
    );
    if (!guess) continue;

    const inliers: number[] = [];
    for (let i = 0; i < board.length; i++) {
      const predicted = applyHomography(guess, board[i]);
      const residual = Math.hypot(predicted.x - image[i].x, predicted.y - image[i].y);
      if (residual <= OUTLIER_PIXELS) inliers.push(i);
    }
    if (inliers.length > bestInliers.length) bestInliers = inliers;
  }

  if (bestInliers.length < MIN_TRACKED) return null;
  return homographyFromMany(
    bestInliers.map((i) => board[i]),
    bestInliers.map((i) => image[i]),
  );
}

/** Four distinct anchors, at random. */
function pickFour(count: number): number[] | null {
  if (count < 4) return null;
  const chosen = new Set<number>();
  // Bounded so a pathological run cannot spin: with four needed out of six or
  // more, collisions are rare and a failed draw simply skips one attempt.
  for (let guard = 0; guard < 40 && chosen.size < 4; guard++) {
    chosen.add(Math.floor(Math.random() * count));
  }
  return chosen.size === 4 ? [...chosen] : null;
}
