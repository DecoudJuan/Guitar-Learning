/**
 * Finding the neck without being told where it is.
 *
 * A fretboard is close to the ideal case for the oldest trick in computer
 * vision: it is a bundle of long parallel lines (the strings) crossed by a
 * second bundle at right angles (the frets), all of them high-contrast against
 * dark wood. That is exactly what a Hough transform is for, and it needs no
 * model, no download and no GPU time competing with the hand tracker — which
 * is precisely why this is classic vision and not a second neural network.
 *
 * The pipeline, once, on demand — never per frame:
 *
 *   1. Shrink the frame. Detail beyond ~320 px wide only adds noise and cost.
 *   2. Grey it, then Sobel for gradients.
 *   3. Keep the strong edges; find their principal axis. That axis is the neck,
 *      because the strings dominate any picture with a guitar in it.
 *   4. Hough over the strong edges, using each edge's own gradient direction so
 *      every pixel votes for one angle instead of all of them.
 *   5. Split the peaks into the two bundles, take the outermost line of each,
 *      and intersect them. Those four intersections are the fretboard.
 *
 * What it cannot do, and does not pretend to: it cannot tell the thick E from
 * the thin E. Nothing in the geometry distinguishes them — that is which way
 * round the guitar is, not what shape it is. So the result is offered as a
 * suggestion with a flip, and marking by hand stays the ground truth.
 */

import type { Corners } from "../guitar/Fretboard";
import type { Point } from "./landmarks";

/** Everything downstream is normalised, so the working size is ours to choose. */
const WORK_WIDTH = 320;

/** An edge has to be this fraction of the strongest one to vote at all. */
const EDGE_THRESHOLD = 0.32;

/** A Hough peak has to be this fraction of the best peak to count as a line. */
const PEAK_THRESHOLD = 0.38;

/** How far from the neck's axis a line can lean and still count as a string. */
const AXIS_TOLERANCE_DEG = 22;

export interface NeckDetection {
  /** In camera coordinates, going around the quad. */
  corners: Corners;
  /** Which fret the far edge is: the corners are the nut and this fret. */
  farFret: number;
  /** 0 to 1 — how much of the expected structure was actually found. */
  confidence: number;
}

/** A line in the working image, as normal angle and distance from the origin. */
interface HoughLine {
  theta: number;
  rho: number;
  votes: number;
}

export class NeckDetector {
  private canvas = document.createElement("canvas");

  /**
   * Looks at one frame. Returns null whenever the picture does not clearly
   * contain a neck — too dark, too few edges, no second bundle of lines — which
   * is the common case and must stay cheap and quiet.
   */
  detect(video: HTMLVideoElement): NeckDetection | null {
    const grey = this.grab(video);
    if (!grey) return null;
    const { data, width, height } = grey;

    const edges = sobelEdges(data, width, height);
    if (edges.length < 250) return null;

    const axis = principalAxis(edges);
    const lines = hough(edges, width, height);
    if (lines.length < 4) return null;

    // A line's own direction is its normal turned by a quarter turn.
    const alongAxis = (line: HoughLine) => angleGap(line.theta + Math.PI / 2, axis) <= toRadians(AXIS_TOLERANCE_DEG);
    const acrossAxis = (line: HoughLine) =>
      angleGap(line.theta + Math.PI / 2, axis + Math.PI / 2) <= toRadians(AXIS_TOLERANCE_DEG);

    const strings = lines.filter(alongAxis);
    const frets = lines.filter(acrossAxis);
    // Two edges of a neck and two ends of it: fewer than that is not a neck.
    if (strings.length < 2 || frets.length < 2) return null;

    const centre = centroidOf(edges);

    // The two outermost strings are the edges of the fretboard; the two
    // outermost frets are the ends of the stretch the camera can see.
    const acrossOrder = [...strings].sort((a, b) => offsetFrom(a, centre, axis + Math.PI / 2) - offsetFrom(b, centre, axis + Math.PI / 2));
    const alongOrder = [...frets].sort((a, b) => offsetFrom(a, centre, axis) - offsetFrom(b, centre, axis));

    const edgeA = acrossOrder[0];
    const edgeB = acrossOrder[acrossOrder.length - 1];
    const endNear = alongOrder[0];
    const endFar = alongOrder[alongOrder.length - 1];

    const cornerNearA = intersect(endNear, edgeA);
    const cornerNearB = intersect(endNear, edgeB);
    const cornerFarB = intersect(endFar, edgeB);
    const cornerFarA = intersect(endFar, edgeA);
    if (!cornerNearA || !cornerNearB || !cornerFarB || !cornerFarA) return null;

    // Which end is the nut? The one where the neck is narrower. A fretboard
    // tapers, and that taper is the only thing in the picture that says which
    // way is up — a guitar photographed from either end looks otherwise alike.
    const nearWidth = span(cornerNearA, cornerNearB);
    const farWidth = span(cornerFarA, cornerFarB);
    const nutIsNear = nearWidth <= farWidth;

    const nut: [Point, Point] = nutIsNear ? [cornerNearA, cornerNearB] : [cornerFarA, cornerFarB];
    const far: [Point, Point] = nutIsNear ? [cornerFarB, cornerFarA] : [cornerNearB, cornerNearA];

    // How many frets lie between the two ends: every detected fret line, plus
    // the far end itself, minus the nut. Wrong by one now and then, which is
    // why the student is shown the grid and given a way to redo it.
    const farFret = Math.max(3, Math.min(17, frets.length - 1));

    const toCamera = (point: Point): Point => ({ x: point.x / width, y: point.y / height });
    const corners: Corners = [toCamera(nut[0]), toCamera(nut[1]), toCamera(far[0]), toCamera(far[1])];

    if (!corners.every((point) => point.x > -0.4 && point.x < 1.4 && point.y > -0.4 && point.y < 1.4)) return null;

    return {
      corners,
      farFret,
      confidence: Math.min(1, (Math.min(frets.length, 12) / 12) * 0.7 + (strings.length >= 4 ? 0.3 : 0.15)),
    };
  }

  /** One frame, shrunk and greyed. Null while the camera has nothing to give. */
  private grab(video: HTMLVideoElement): { data: Float32Array; width: number; height: number } | null {
    if (video.readyState < 2 || video.videoWidth === 0) return null;

    const width = WORK_WIDTH;
    const height = Math.max(2, Math.round((video.videoHeight / video.videoWidth) * width));
    this.canvas.width = width;
    this.canvas.height = height;

    const context = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height).data;
    const grey = new Float32Array(width * height);
    for (let i = 0, p = 0; i < grey.length; i++, p += 4) {
      // Rec. 601 luma: strings are bright metal on dark wood, and weighting
      // green the way the eye does keeps that contrast.
      grey[i] = 0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2];
    }
    return { data: grey, width, height };
  }
}

interface Edge {
  x: number;
  y: number;
  /** Gradient direction, which is the normal of the line the edge lies on. */
  theta: number;
  magnitude: number;
}

function sobelEdges(grey: Float32Array, width: number, height: number): Edge[] {
  const magnitudes = new Float32Array(width * height);
  const angles = new Float32Array(width * height);
  let strongest = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const tl = grey[i - width - 1];
      const t = grey[i - width];
      const tr = grey[i - width + 1];
      const l = grey[i - 1];
      const r = grey[i + 1];
      const bl = grey[i + width - 1];
      const b = grey[i + width];
      const br = grey[i + width + 1];

      const gx = tr + 2 * r + br - (tl + 2 * l + bl);
      const gy = bl + 2 * b + br - (tl + 2 * t + tr);
      const magnitude = Math.hypot(gx, gy);

      magnitudes[i] = magnitude;
      angles[i] = Math.atan2(gy, gx);
      if (magnitude > strongest) strongest = magnitude;
    }
  }

  if (strongest < 1e-6) return [];
  const cutoff = strongest * EDGE_THRESHOLD;

  const edges: Edge[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (magnitudes[i] < cutoff) continue;
      edges.push({ x, y, theta: normalizeAngle(angles[i]), magnitude: magnitudes[i] });
    }
  }
  return edges;
}

/**
 * The direction the edge cloud is longest in — the neck, in any picture where
 * the guitar is the subject. Found with a two-by-two eigen decomposition, which
 * at this size is one line of trigonometry rather than a matrix library.
 */
function principalAxis(edges: Edge[]): number {
  const centre = centroidOf(edges);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const edge of edges) {
    const dx = edge.x - centre.x;
    const dy = edge.y - centre.y;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  return normalizeAngle(0.5 * Math.atan2(2 * xy, xx - yy));
}

function centroidOf(edges: Edge[]): Point {
  let x = 0;
  let y = 0;
  for (const edge of edges) {
    x += edge.x;
    y += edge.y;
  }
  return { x: x / edges.length, y: y / edges.length };
}

/**
 * The Hough transform, with one shortcut that matters: an edge pixel already
 * knows which way its line runs, so it votes for one angle instead of all 180.
 * That turns the transform from the expensive part of this file into the cheap
 * one, and sharpens the peaks as a side effect.
 */
function hough(edges: Edge[], width: number, height: number): HoughLine[] {
  const thetaBins = 180;
  const diagonal = Math.hypot(width, height);
  const rhoBins = Math.ceil(diagonal * 2);
  const accumulator = new Float32Array(thetaBins * rhoBins);

  const thetaStep = Math.PI / thetaBins;

  for (const edge of edges) {
    const centreBin = Math.round(edge.theta / thetaStep);
    // A small spread absorbs the wobble in a single pixel's gradient estimate.
    for (let offset = -2; offset <= 2; offset++) {
      const bin = ((centreBin + offset) % thetaBins + thetaBins) % thetaBins;
      const theta = bin * thetaStep;
      const rho = edge.x * Math.cos(theta) + edge.y * Math.sin(theta);
      const rhoBin = Math.round(rho + diagonal);
      if (rhoBin < 0 || rhoBin >= rhoBins) continue;
      accumulator[bin * rhoBins + rhoBin] += edge.magnitude * (offset === 0 ? 1 : 0.5);
    }
  }

  let best = 0;
  for (const value of accumulator) if (value > best) best = value;
  if (best <= 0) return [];
  const cutoff = best * PEAK_THRESHOLD;

  // Non-maximum suppression, so one thick line is one peak and not forty.
  const peaks: HoughLine[] = [];
  const window = 4;
  for (let bin = 0; bin < thetaBins; bin++) {
    for (let rhoBin = 0; rhoBin < rhoBins; rhoBin++) {
      const value = accumulator[bin * rhoBins + rhoBin];
      if (value < cutoff) continue;

      let isPeak = true;
      for (let db = -window; db <= window && isPeak; db++) {
        for (let dr = -window; dr <= window; dr++) {
          if (db === 0 && dr === 0) continue;
          const nb = ((bin + db) % thetaBins + thetaBins) % thetaBins;
          const nr = rhoBin + dr;
          if (nr < 0 || nr >= rhoBins) continue;
          if (accumulator[nb * rhoBins + nr] > value) {
            isPeak = false;
            break;
          }
        }
      }
      if (isPeak) peaks.push({ theta: bin * thetaStep, rho: rhoBin - diagonal, votes: value });
    }
  }

  return peaks.sort((a, b) => b.votes - a.votes).slice(0, 60);
}

/** Where two lines cross, or null when they are parallel. */
function intersect(a: HoughLine, b: HoughLine): Point | null {
  const ca = Math.cos(a.theta);
  const sa = Math.sin(a.theta);
  const cb = Math.cos(b.theta);
  const sb = Math.sin(b.theta);
  const determinant = ca * sb - sa * cb;
  if (Math.abs(determinant) < 1e-9) return null;
  return {
    x: (a.rho * sb - b.rho * sa) / determinant,
    y: (b.rho * ca - a.rho * cb) / determinant,
  };
}

/** How far a line sits from a point, measured along a chosen direction. */
function offsetFrom(line: HoughLine, from: Point, direction: number): number {
  // The point on the line closest to the origin, projected onto the direction.
  const onLine = { x: line.rho * Math.cos(line.theta), y: line.rho * Math.sin(line.theta) };
  return (onLine.x - from.x) * Math.cos(direction) + (onLine.y - from.y) * Math.sin(direction);
}

function span(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Angles here are directions of lines, so they live modulo π, not 2π. */
function normalizeAngle(angle: number): number {
  const wrapped = angle % Math.PI;
  return wrapped < 0 ? wrapped + Math.PI : wrapped;
}

function angleGap(a: number, b: number): number {
  const gap = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(gap, Math.PI - gap);
}
