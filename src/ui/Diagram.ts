/**
 * The chord box — the diagram every guitar book has printed for a century.
 *
 * It is here because it is the notation the student will meet everywhere else,
 * and a class that teaches its own private notation leaves them unable to read
 * a songbook. The camera view shows *their* neck; this shows the same chord the
 * way the rest of the world writes it, with the two coloured identically so the
 * link is obvious without a word of explanation.
 *
 * Drawn on a canvas rather than built from elements: it is a picture, it is
 * redrawn whenever the verdict changes, and a canvas keeps that a repaint
 * instead of thirty DOM nodes.
 */

import type { ChordShape } from "../guitar/chords";
import { lowestFret } from "../guitar/chords";
import type { Verdict } from "../guitar/judge";
import { DIM, GRID_STRONG, INK, RIGHT, TARGET, WRONG } from "../render/palette";

const WIDTH = 128;
const HEIGHT = 152;
const ROWS = 5;

export class Diagram {
  readonly canvas = document.createElement("canvas");
  private context: CanvasRenderingContext2D | null;

  constructor() {
    this.canvas.className = "diagram";
    this.canvas.style.width = `${WIDTH}px`;
    this.canvas.style.height = `${HEIGHT}px`;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = WIDTH * ratio;
    this.canvas.height = HEIGHT * ratio;
    this.context = this.canvas.getContext("2d");
    this.context?.scale(ratio, ratio);
  }

  /**
   * Draws a shape, tinted by how the student is doing on each finger.
   * With no verdicts it draws plainly, which is what the lesson list wants.
   */
  render(shape: ChordShape | null, verdicts?: Map<number, Verdict>) {
    const context = this.context;
    if (!context) return;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    if (!shape) return;

    // Where the box starts. An open chord starts at the nut; anything higher up
    // is drawn from its lowest fret with the number beside it, exactly as a
    // songbook does, so a barre chord does not need a five-inch diagram.
    const lowest = lowestFret(shape);
    const startFret = lowest <= 1 ? 1 : lowest;
    const showsNut = startFret === 1;

    const left = 22;
    const right = WIDTH - 14;
    const top = 30;
    const bottom = HEIGHT - 14;
    const stringGap = (right - left) / 5;
    const fretGap = (bottom - top) / ROWS;

    // Strings: thick E on the left, the way a chord box is always drawn —
    // looking at the guitar held up in front of you.
    context.strokeStyle = GRID_STRONG;
    context.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const x = left + i * stringGap;
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, bottom);
      context.stroke();
    }
    for (let row = 0; row <= ROWS; row++) {
      const y = top + row * fretGap;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(right, y);
      context.stroke();
    }

    if (showsNut) {
      context.lineWidth = 4;
      context.strokeStyle = INK;
      context.beginPath();
      context.moveTo(left - 2, top);
      context.lineTo(right + 2, top);
      context.stroke();
    } else {
      context.fillStyle = DIM;
      context.font = "11px ui-sans-serif, system-ui, sans-serif";
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(String(startFret), left - 6, top + fretGap / 2);
    }

    // The marks above the box: open, or don't play.
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "12px ui-sans-serif, system-ui, sans-serif";
    shape.frets.forEach((fret, index) => {
      const x = left + index * stringGap;
      if (fret === null) {
        context.fillStyle = DIM;
        context.fillText("×", x, top - 12);
      } else if (fret === 0) {
        context.strokeStyle = DIM;
        context.lineWidth = 1.4;
        context.beginPath();
        context.arc(x, top - 12, 4.5, 0, Math.PI * 2);
        context.stroke();
      }
    });

    // A barre is one bar, not a row of dots: that is what it feels like to play
    // and what makes it recognisable at a glance.
    const barre = shape.barre;
    if (barre) {
      const fromIndex = 6 - barre.toString;
      const toIndex = 6 - barre.fromString;
      const y = top + (barre.fret - startFret + 0.5) * fretGap;
      context.fillStyle = colourFor(verdicts?.get(barre.finger));
      context.beginPath();
      context.roundRect(left + fromIndex * stringGap - 8, y - 8, (toIndex - fromIndex) * stringGap + 16, 16, 8);
      context.fill();
      context.fillStyle = "#0b0a0f";
      context.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      context.fillText(String(barre.finger), left + fromIndex * stringGap, y);
    }

    shape.frets.forEach((fret, index) => {
      if (fret === null || fret === 0) return;
      const finger = shape.fingers[index];
      if (finger === null) return;
      // Already drawn as part of the bar.
      if (barre && finger === barre.finger && fret === barre.fret) return;

      const x = left + index * stringGap;
      const y = top + (fret - startFret + 0.5) * fretGap;
      context.fillStyle = colourFor(verdicts?.get(finger));
      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = "#0b0a0f";
      context.font = "600 11px ui-sans-serif, system-ui, sans-serif";
      context.fillText(String(finger), x, y + 0.5);
    });
  }
}

/** The same three colours the camera view uses, for the same three meanings. */
function colourFor(verdict: Verdict | undefined): string {
  if (verdict === "correct") return RIGHT;
  if (verdict === "wrongFret" || verdict === "wrongString") return WRONG;
  return TARGET;
}
