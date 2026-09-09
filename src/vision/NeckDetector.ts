/**
 * Finding the neck without being told where it is.
 *
 * The first version of this file failed on the first real photograph it ever
 * saw — a guitar on a lap, in a bedroom — and the mistake is worth writing down
 * because it was conceptual, not a bad constant.
 *
 * It took the principal axis of every strong edge in the frame and assumed it
 * would be the neck, "because the strings dominate any picture with a guitar in
 * it". They do not. A bed, a pillow, a shirt with lettering across it and a
 * doorway all have edges, and together they outvote six thin strings easily. It
 * then took the outermost line in each direction as the edge of the fretboard,
 * which in that frame was the edge of the mattress.
 *
 * What identifies a guitar in a photograph of a bedroom is not brightness or
 * dominance. It is a very specific pattern: **six roughly parallel lines at
 * roughly equal spacing.** Nothing else in an ordinary room does that. So that
 * pattern is what is searched for, and the rest follows from it:
 *
 *   1. Shrink, grey, Sobel. Keep the strongest edges by *percentile*, so one
 *      bright object cannot raise the bar until the strings fall under it.
 *   2. Hough, with each edge voting only for its own gradient direction.
 *   3. Among the peaks, find the evenly-spaced bundle. That is the strings, and
 *      its direction is the neck — nothing is inferred from the whole frame.
 *   4. Frets are looked for *only* among lines that cross that bundle, so the
 *      rest of the room is not merely outvoted, it is never consulted.
 *
 * What it still cannot do, and does not pretend to: tell the thick E from the
 * thin E. That is which way round the guitar is, not what shape it is.
 */

import type { Corners } from "../guitar/Fretboard";
import { looksLikeNeck } from "../guitar/corners";
import type { Point } from "./landmarks";

/**
 * The width the frame is shrunk to before anything is measured.
 *
 * Measured against a real photograph rather than picked: at 320 the six strings
 * land about three pixels apart and the bundle that comes back is tilted some
 * ten degrees off the real neck. At 480 the same photograph gives the neck
 * angle to within a degree. Wider costs more and gains nothing here, because
 * the search runs on demand and never per frame.
 */
const WORK_WIDTH = 480;

/**
 * The share of pixels kept as edges. A percentile, not a ratio to the single
 * strongest edge: that ratio is what let a white logo on a T-shirt put the bar
 * above every string in the picture.
 */
const EDGE_PERCENTILE = 0.08;

/**
 * How strong a Hough peak has to be, relative to the strongest one, to count.
 *
 * This one constant was the whole failure on the first real photograph. At 0.25
 * that frame produced *three* lines in total: a guitar string is thin and
 * short, and the edge of a bed or a bright doorway outvotes it many times over,
 * so everything that mattered fell under a quarter of the best peak. Dropped to
 * 0.05, the same frame yields sixty-odd lines, six of which are the strings.
 *
 * Letting junk through is safe here in a way it would not be in a classical
 * pipeline, because nothing downstream trusts an individual line: the bundle
 * search only accepts lines that are parallel *and* evenly spaced, and a room
 * does not produce those by accident.
 */
const PEAK_THRESHOLD = 0.05;

/** How far two lines can differ in angle and still belong to one bundle. */
const BUNDLE_SPREAD_DEG = 12;

/** How far a fret can be from square to the strings. */
const CROSS_TOLERANCE_DEG = 30;

/** A string bundle needs at least this many lines. Six exist; some hide. */
const MIN_STRINGS = 4;

/** How much the gaps in a bundle may wander from their average. */
const SPACING_TOLERANCE = 0.3;

/**
 * The share of pixels kept as edges *inside the string band*, where the fret
 * wires are looked for.
 *
 * Separate from the frame-wide figure, and that separation is the point. A
 * fretboard is the darkest thing in a lit room, so a threshold set over the
 * whole picture keeps the window frame and throws the frets away — measured on
 * a real photograph, the band held 121 edge pixels and not one fret survived.
 * Thresholding within the band asks the right question: which edges are strong
 * *for a fretboard*.
 */
const BAND_PERCENTILE = 0.25;

export interface NeckDetection {
  /** In camera coordinates, going around the quad. */
  corners: Corners;
  /** These corners sit on the outer strings, not on the edge of the wood. */
  cornersAt: "strings";
  /** Which fret the far pair is on: the corners are the nut and this fret. */
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

interface Bundle {
  lines: HoughLine[];
  /** The shared normal direction the bundle was measured along. */
  theta: number;
  /** How uneven the spacing is: 0 is perfect. */
  unevenness: number;
  /** The average gap between neighbouring lines, in working pixels. */
  spacing: number;
}

export class NeckDetector {
  private canvas = document.createElement("canvas");

  /**
   * Looks at one frame. Returns null whenever the picture does not clearly
   * contain a neck, which is the common case and must stay cheap and quiet.
   */
  /**
   * Looks at one frame. Returns null whenever the picture does not clearly
   * contain a neck, which is the common case and must stay cheap and quiet.
   */
  detect(video: HTMLVideoElement): NeckDetection | null {
    const frame = this.grab(video);
    if (!frame) return null;
    return detectInGrey(frame.data, frame.width, frame.height);
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

/**
 * The detector proper, over a greyscale frame.
 *
 * Separated from the class so it can be run against a still photograph with no
 * canvas and no camera — which is how the constants above were set, and how the
 * bedroom frame that broke the first version is now a regression check rather
 * than a story.
 */
export function detectInGrey(grey: Float32Array, width: number, height: number): NeckDetection | null {
  const fields = gradients(grey, width, height);
  const edges = edgesFrom(fields, width, height, EDGE_PERCENTILE);
  if (edges.length < 250) return null;

  const lines = hough(edges, width, height);
  if (lines.length < MIN_STRINGS + 2) return null;

  const centre = { x: width / 2, y: height / 2 };

  // Several things in a room are stripes. A bed, a blanket, a radiator, the
  // slats of a blind — and on the photograph that this detector was built
  // against, the winning "string bundle" was a stretch of bedding along the
  // bottom of the frame, at almost exactly the angle of the real neck.
  //
  // What separates a guitar from all of them is that it has stripes in *both*
  // directions: strings, and wires crossing them. So every plausible bundle is
  // tried and the frets choose between them. A blanket has no frets.
  const candidates = findEvenBundles(lines, centre);
  if (candidates.length === 0) return null;

  let strings: Bundle | null = null;
  let fretEdges: Edge[] = [];
  let wires: HoughLine[] = [];

  for (const candidate of candidates) {
    const edgesInBand = edgesFrom(fields, width, height, BAND_PERCENTILE, bandFilter(candidate, centre));
    if (edgesInBand.length < 60) continue;

    const outerPair: [HoughLine, HoughLine] = [candidate.lines[0], candidate.lines[candidate.lines.length - 1]];
    const crossing = crossingLines(hough(edgesInBand, width, height), candidate, outerPair, width, height);
    if (crossing.length > wires.length) {
      strings = candidate;
      fretEdges = edgesInBand;
      wires = crossing;
    }
  }

  // No wires anywhere means no guitar in the picture, whatever else is striped.
  if (!strings || wires.length < 2) return null;

  const outer: [HoughLine, HoughLine] = [strings.lines[0], strings.lines[strings.lines.length - 1]];
  const axis = strings.theta + Math.PI / 2;

  // The ends of the neck come from how far the strings run, not from finding
  // two fret wires far apart. Measured on a real photograph, the fret search
  // reliably finds three or four wires and they are all near the nut, where the
  // light is: asking those to span the neck produced a "neck" twenty pixels
  // long. Where the strings stop, on the other hand, is exactly where the neck
  // stops — at the nut on one side, and at the hand or the body on the other.
  const along = fretEdges
    .map((edge) => (edge.x - centre.x) * Math.cos(axis) + (edge.y - centre.y) * Math.sin(axis))
    .sort((a, b) => a - b);
  // Trimmed ends, so one stray edge cannot stretch the neck across the room.
  const nearAt = along[Math.floor(along.length * 0.02)];
  const farAt = along[Math.min(along.length - 1, Math.floor(along.length * 0.98))];
  if (!Number.isFinite(nearAt) || !Number.isFinite(farAt)) return null;

  const near = lineAcross(centre, axis, strings.theta + Math.PI / 2, nearAt);
  const far = lineAcross(centre, axis, strings.theta + Math.PI / 2, farAt);

  const nearA = intersect(near, outer[0]);
  const nearB = intersect(near, outer[1]);
  const farA = intersect(far, outer[0]);
  const farB = intersect(far, outer[1]);
  if (!nearA || !nearB || !farA || !farB) return null;

  // Which end is the nut? The one where the strings sit closer together. A
  // fretboard widens towards the body, and now that the strings themselves have
  // been found, that taper is measured rather than assumed.
  const nutIsNear = span(nearA, nearB) <= span(farA, farB);
  const nut: [Point, Point] = nutIsNear ? [nearA, nearB] : [farA, farB];
  const end: [Point, Point] = nutIsNear ? [farB, farA] : [nearB, nearA];

  // How many frets that stretch covers is a guess, and it is offered as one:
  // the wires that were found are counted, and the student is shown the grid
  // over the real neck with a stepper to correct the number. Guessing here is
  // acceptable in a way that guessing the neck's position never was.
  const farFret = wires.length >= 3 ? Math.max(5, Math.min(19, wires.length + 2)) : 12;

  const toCamera = (point: Point): Point => ({ x: point.x / width, y: point.y / height });
  const corners: Corners = [toCamera(nut[0]), toCamera(nut[1]), toCamera(end[0]), toCamera(end[1])];

  if (!corners.every((point) => point.x > -0.4 && point.x < 1.4 && point.y > -0.4 && point.y < 1.4)) return null;
  // A last check on the shape itself: long, thin, and not folded over.
  if (!looksLikeNeck(corners)) return null;

  // And big. A student points a camera at a guitar; a neck that occupies a
  // twentieth of the frame is something else in the room that happens to be
  // striped, and accepting it wastes the one moment of trust the feature gets.
  const length = (span(nut[0], end[1]) + span(nut[1], end[0])) / 2;
  if (length < Math.max(width, height) * 0.25) return null;

  // Confidence is about the strings, because the strings are what was actually
  // found. The fret count only nudges it: a neck with wires visible on it is a
  // better bet than one without, but the quad does not rest on them.
  const stringScore = Math.min(1, strings.lines.length / 6);
  const evenness = Math.max(0, 1 - strings.unevenness / SPACING_TOLERANCE);
  const wireScore = Math.min(1, wires.length / 4);
  return {
    corners,
    cornersAt: "strings",
    farFret,
    confidence: stringScore * 0.45 + evenness * 0.35 + wireScore * 0.2,
  };
}

interface Edge {
  x: number;
  y: number;
  /** Gradient direction, which is the normal of the line the edge lies on. */
  theta: number;
  magnitude: number;
}

interface Gradients {
  magnitude: Float32Array;
  angle: Float32Array;
}

/** Sobel over the whole frame, kept as raw fields so any region can be
 *  thresholded on its own terms afterwards. */
export function gradients(grey: Float32Array, width: number, height: number): Gradients {
  const magnitude = new Float32Array(width * height);
  const angle = new Float32Array(width * height);

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

      magnitude[i] = Math.hypot(gx, gy);
      angle[i] = Math.atan2(gy, gx);
    }
  }

  return { magnitude, angle };
}

/**
 * The strongest edges among the pixels a filter admits, by percentile *of that
 * selection*. Passing no filter gives the frame-wide edges; passing the string
 * band gives the fret wires, which are strong locally and invisible globally.
 */
export function edgesFrom(
  fields: Gradients,
  width: number,
  height: number,
  keep: number,
  accepts?: (x: number, y: number, theta: number) => boolean,
): Edge[] {
  const candidates: Edge[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const magnitude = fields.magnitude[i];
      if (magnitude <= 0) continue;
      const theta = normalizeAngle(fields.angle[i]);
      if (accepts && !accepts(x, y, theta)) continue;
      candidates.push({ x, y, theta, magnitude });
    }
  }
  if (candidates.length === 0) return [];

  const wanted = Math.max(1, Math.round(candidates.length * keep));
  candidates.sort((a, b) => b.magnitude - a.magnitude);
  return candidates.slice(0, wanted);
}

/**
 * The Hough transform, with one shortcut that matters: an edge pixel already
 * knows which way its line runs, so it votes for one angle instead of all 180.
 * That turns the transform from the expensive part of this file into the cheap
 * one, and sharpens the peaks as a side effect.
 */
export function hough(edges: Edge[], width: number, height: number): HoughLine[] {
  const thetaBins = 180;
  const diagonal = Math.hypot(width, height);
  const rhoBins = Math.ceil(diagonal * 2);
  const accumulator = new Float32Array(thetaBins * rhoBins);
  const thetaStep = Math.PI / thetaBins;

  for (const edge of edges) {
    const centreBin = Math.round(edge.theta / thetaStep);
    // A small spread absorbs the wobble in a single pixel's gradient estimate.
    for (let offset = -2; offset <= 2; offset++) {
      const bin = (((centreBin + offset) % thetaBins) + thetaBins) % thetaBins;
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
          const nb = (((bin + db) % thetaBins) + thetaBins) % thetaBins;
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

  return peaks.sort((a, b) => b.votes - a.votes).slice(0, 90);
}

/**
 * The strings: the best run of nearly-parallel lines at nearly-equal spacing.
 *
 * This is the idea the whole file rests on. Six evenly spaced parallel lines is
 * a guitar; a bed frame and a doorway are not evenly spaced, and a shirt is not
 * six of anything. Every candidate direction is tried, and within each one the
 * best arithmetic progression of line positions wins.
 */
export function findEvenBundles(lines: HoughLine[], centre: Point, limit = 5): Bundle[] {
  const spread = toRadians(BUNDLE_SPREAD_DEG);
  const found: Bundle[] = [];

  for (const anchor of lines) {
    const group = lines.filter((line) => angleGap(line.theta, anchor.theta) <= spread);
    if (group.length < MIN_STRINGS) continue;

    // Positions measured along one shared normal, because near-parallel lines
    // at slightly different angles have rho values that are not comparable.
    const theta = anchor.theta;
    const placed = group
      .map((line) => ({ line, at: offsetFrom(line, centre, theta) }))
      .sort((a, b) => a.at - b.at);

    const run = longestEvenRun(placed.map((entry) => entry.at));
    if (!run || run.indices.length < MIN_STRINGS || run.unevenness > SPACING_TOLERANCE) continue;

    found.push({
      lines: run.indices.map((index) => placed[index].line),
      theta,
      unevenness: run.unevenness,
      spacing: run.spacing,
    });
  }

  // More lines first; among equals, the more evenly spaced. Near-duplicates —
  // the same bundle found from a neighbouring anchor — are dropped.
  found.sort((a, b) => b.lines.length - a.lines.length || a.unevenness - b.unevenness);

  const distinct: Bundle[] = [];
  for (const bundle of found) {
    const seen = distinct.some(
      (kept) =>
        angleGap(kept.theta, bundle.theta) < toRadians(4) &&
        Math.abs(offsetFrom(kept.lines[0], centre, kept.theta) - offsetFrom(bundle.lines[0], centre, bundle.theta)) <
          Math.abs(bundle.spacing),
    );
    if (!seen) distinct.push(bundle);
    if (distinct.length >= limit) break;
  }
  return distinct;
}

/** The longest arithmetic progression hiding in a sorted list of positions. */
export function longestEvenRun(positions: number[]): { indices: number[]; unevenness: number; spacing: number } | null {
  let best: { indices: number[]; unevenness: number; spacing: number } | null = null;

  for (let first = 0; first < positions.length - 1; first++) {
    for (let second = first + 1; second < positions.length; second++) {
      const step = positions[second] - positions[first];
      if (step <= 1) continue;

      const indices = [first, second];
      let expected = positions[second] + step;
      for (let next = second + 1; next < positions.length; next++) {
        if (Math.abs(positions[next] - expected) <= step * SPACING_TOLERANCE) {
          indices.push(next);
          expected = positions[next] + step;
        }
      }
      if (indices.length < MIN_STRINGS) continue;
      // Six strings, no more. A longer run is a picket fence, not a guitar.
      if (indices.length > 7) continue;

      const gaps = indices.slice(1).map((index, i) => positions[index] - positions[indices[i]]);
      const mean = gaps.reduce((total, gap) => total + gap, 0) / gaps.length;
      const unevenness =
        mean === 0 ? Infinity : Math.sqrt(gaps.reduce((t, g) => t + (g - mean) ** 2, 0) / gaps.length) / mean;

      if (
        !best ||
        indices.length > best.indices.length ||
        (indices.length === best.indices.length && unevenness < best.unevenness)
      ) {
        best = { indices, unevenness, spacing: mean };
      }
    }
  }

  return best;
}

/**
 * A test for "this pixel could belong to a fret wire": it lies between the
 * outer strings, and its gradient runs along them rather than across.
 *
 * Everything else in the picture is simply never shown to the second transform,
 * which is cheaper than out-voting it and far more reliable.
 */
function bandFilter(strings: Bundle, centre: Point): (x: number, y: number, theta: number) => boolean {
  const offsets = strings.lines.map((line) => offsetFrom(line, centre, strings.theta));
  const margin = Math.abs(strings.spacing);
  const low = Math.min(...offsets) - margin;
  const high = Math.max(...offsets) + margin;

  const cos = Math.cos(strings.theta);
  const sin = Math.sin(strings.theta);
  const square = strings.theta + Math.PI / 2;
  const tolerance = toRadians(CROSS_TOLERANCE_DEG);

  return (x, y, theta) => {
    const across = (x - centre.x) * cos + (y - centre.y) * sin;
    if (across < low || across > high) return false;
    // A fret runs across the strings, so its gradient points along them.
    return angleGap(theta, square) <= tolerance;
  };
}

/**
 * The fret wires: lines square to the strings that cross the bundle where the
 * bundle actually is.
 *
 * "Crosses the outer strings somewhere inside the frame" is not enough, and
 * getting that wrong produced the most confusing failure of this whole file:
 * two near-parallel string lines meet eventually, and a line through that
 * meeting point technically crosses both. The detector duly reported a neck
 * thirty pixels long in the corner of the room.
 *
 * So the width of the crossing is checked against the bundle itself. Six
 * strings are five gaps wide; a line that cuts the outer two much closer
 * together than that is cutting them where they converge, which is nowhere
 * near the guitar.
 */
export function crossingLines(
  lines: HoughLine[],
  strings: Bundle,
  outer: [HoughLine, HoughLine],
  width: number,
  height: number,
): HoughLine[] {
  const tolerance = toRadians(CROSS_TOLERANCE_DEG);
  const square = strings.theta + Math.PI / 2;
  const gaps = strings.lines.length - 1;
  const expected = Math.abs(strings.spacing) * gaps;

  return lines.filter((line) => {
    if (angleGap(line.theta, square) > tolerance) return false;

    const a = intersect(line, outer[0]);
    const b = intersect(line, outer[1]);
    if (!a || !b) return false;

    const inside = (point: Point) =>
      point.x > -width * 0.1 && point.x < width * 1.1 && point.y > -height * 0.1 && point.y < height * 1.1;
    if (!inside(a) || !inside(b)) return false;

    const across = span(a, b);
    return across > expected * 0.55 && across < expected * 1.8;
  });
}

/**
 * A line square to the strings, sitting a given distance along the neck from
 * the centre of the frame. Used to close the ends of the quadrilateral.
 */
function lineAcross(centre: Point, axis: number, theta: number, at: number): HoughLine {
  const point = { x: centre.x + Math.cos(axis) * at, y: centre.y + Math.sin(axis) * at };
  return { theta, rho: point.x * Math.cos(theta) + point.y * Math.sin(theta), votes: 0 };
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
