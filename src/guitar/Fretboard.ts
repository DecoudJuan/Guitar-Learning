/**
 * The bridge between the guitar and the picture of it.
 *
 * `geometry.ts` knows where every fret is on a fretboard. `homography.ts` knows
 * how a flat plane looks through a lens. This class holds the two together and
 * answers the only two questions the rest of the app ever asks:
 *
 *   - Where on screen should this finger go?  (board → camera)
 *   - What is this fingertip pressing?        (camera → board)
 *
 * It is built from the four corners of the fretboard, in camera coordinates —
 * whether a student clicked them or the detector found them. Nothing else in
 * the app needs to know which of the two it was.
 */

import { applyHomography, homographyFrom, invert, quadArea, type Matrix3 } from "../vision/homography";
import type { Point } from "../vision/landmarks";
import {
  boardOutline,
  boardPoint,
  fretWire,
  halfWidthAt,
  positionOf,
  stringLine,
  STRING_COUNT,
  type BoardPoint,
  type BoardPosition,
  type GuitarSpec,
} from "./geometry";

/**
 * The four corners, in the order the student is asked for them:
 * nut/thick-E, nut/thin-E, 12th/thin-E, 12th/thick-E — going around the
 * quadrilateral rather than criss-crossing it, so a half-finished calibration
 * still draws as a sensible shape.
 */
export type Corners = [Point, Point, Point, Point];

/** A quadrilateral this thin is a mis-click, not a neck. */
const MIN_AREA = 0.004;

export class Fretboard {
  private constructor(
    readonly spec: GuitarSpec,
    readonly corners: Corners,
    private readonly toImage: Matrix3,
    private readonly toBoardMatrix: Matrix3,
  ) {}

  /**
   * Builds one, or returns null if those four points cannot describe a neck.
   * The corners are given in camera coordinates (0..1 across the frame).
   */
  static from(spec: GuitarSpec, corners: Corners): Fretboard | null {
    if (quadArea(corners) < MIN_AREA) return null;

    const board = Fretboard.boardCorners(spec);
    const toImage = homographyFrom(board, corners);
    if (!toImage) return null;
    const toBoardMatrix = invert(toImage);
    if (!toBoardMatrix) return null;

    return new Fretboard(spec, corners, toImage, toBoardMatrix);
  }

  /**
   * Where those four corners sit on the real instrument. The 12th fret is at
   * exactly half the scale length, which is what makes it the landmark worth
   * asking for: it is unambiguous, it is marked with a double dot on almost
   * every guitar, and it is far enough from the nut for the two to pin down
   * the perspective properly.
   */
  private static boardCorners(spec: GuitarSpec): BoardPoint[] {
    const atNut = halfWidthAt(spec, 0);
    const atTwelfth = halfWidthAt(spec, 0.5);
    return [
      { x: 0, y: atNut }, // nut, thick E
      { x: 0, y: -atNut }, // nut, thin E
      { x: 0.5, y: -atTwelfth }, // 12th fret, thin E
      { x: 0.5, y: atTwelfth }, // 12th fret, thick E
    ];
  }

  /** Board coordinates to a point in the camera's picture. */
  toCamera(point: BoardPoint): Point {
    return applyHomography(this.toImage, point);
  }

  /** A point in the camera's picture back onto the board. */
  toBoard(point: Point): BoardPoint {
    return applyHomography(this.toBoardMatrix, point);
  }

  /** What a point in the picture is pressing: a string and a fret. */
  positionAt(point: Point): BoardPosition {
    return positionOf(this.spec, this.toBoard(point));
  }

  /** Where a given string and fret should be touched, on screen. */
  pointFor(stringNumber: number, fret: number): Point {
    return this.toCamera(boardPoint(this.spec, stringNumber, fret));
  }

  /** True when a picture point falls on the fretboard at all. */
  covers(point: Point, slack = 0.15): boolean {
    const board = this.toBoard(point);
    const half = halfWidthAt(this.spec, Math.max(0, board.x)) * (1 + slack);
    return board.x > -0.02 && board.x < 0.75 && Math.abs(board.y) <= half;
  }

  /** The outline of the visible neck, in camera coordinates, for drawing. */
  outline(lastFret: number): Point[] {
    return boardOutline(this.spec, lastFret).map((point) => this.toCamera(point));
  }

  /** Every fret wire from the nut to `lastFret`, in camera coordinates. */
  fretLines(lastFret: number): [Point, Point][] {
    const lines: [Point, Point][] = [];
    for (let fret = 0; fret <= lastFret; fret++) {
      const [a, b] = fretWire(this.spec, fret);
      lines.push([this.toCamera(a), this.toCamera(b)]);
    }
    return lines;
  }

  /** Every string from the nut to `lastFret`, in camera coordinates. */
  stringLines(lastFret: number): [Point, Point][] {
    const lines: [Point, Point][] = [];
    for (let stringNumber = 1; stringNumber <= STRING_COUNT; stringNumber++) {
      const [a, b] = stringLine(this.spec, stringNumber, lastFret);
      lines.push([this.toCamera(a), this.toCamera(b)]);
    }
    return lines;
  }
}
