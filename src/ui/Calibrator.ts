/**
 * Marking the neck: four clicks, in a fixed order.
 *
 * The order is not arbitrary. Going around the quadrilateral — nut thick-E,
 * nut thin-E, 12th thin-E, 12th thick-E — means a half-finished calibration
 * still draws as a sensible shape, and it tells the app which side of the neck
 * is which without asking. A student who marks the corners in the wrong order
 * would otherwise get a fretboard mapped inside out, with every string mirrored
 * and no clue why.
 *
 * The card explains; the clicking happens on the canvas itself, which App
 * routes here. This class owns the four points and nothing else.
 */

import { renderEmphasis, type Translate, type TranslationKey } from "../i18n";
import type { Corners } from "../guitar/Fretboard";
import type { Point } from "../vision/landmarks";
import { clear, element, requireElement } from "./dom";

export type CalibratorPhase = "idle" | "marking" | "searching";

export class Calibrator {
  private root = requireElement("calibrate");
  private card = requireElement("calibrate-card");
  private points: Point[] = [];
  private phase: CalibratorPhase = "idle";
  private notice = "";
  private t: Translate | null = null;

  /** Which fret the far pair sits on: 12 by hand, whatever the detector saw. */
  private farFret = 12;
  private doneHandler: ((corners: Corners, farFret: number) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private autoHandler: (() => void) | null = null;

  whenDone(handler: (corners: Corners, farFret: number) => void) {
    this.doneHandler = handler;
  }

  whenClosed(handler: () => void) {
    this.closeHandler = handler;
  }

  whenAutoAsked(handler: () => void) {
    this.autoHandler = handler;
  }

  get open(): boolean {
    return this.phase !== "idle";
  }

  /** The points marked so far, for the overlay to draw. */
  get marked(): Point[] {
    return this.points;
  }

  start(t: Translate, keepPoints = false) {
    this.t = t;
    if (!keepPoints) {
      this.points = [];
      this.farFret = 12;
    }
    this.phase = "marking";
    this.notice = "";
    this.root.classList.remove("gone");
    this.render(t);
  }

  close() {
    this.phase = "idle";
    this.root.classList.add("gone");
    this.closeHandler?.();
  }

  /** Called by App for every click on the canvas while marking. */
  addPoint(point: Point, t: Translate) {
    if (this.phase !== "marking" || this.points.length >= 4) return;
    this.points.push(point);
    if (this.points.length === 4) {
      // Marked by hand means the 12th fret, because that is what was asked for.
      this.farFret = 12;
      this.doneHandler?.(this.points.slice(0, 4) as Corners, this.farFret);
    }
    this.render(t);
  }

  /** Feedback from the automatic detector, which runs outside this class. */
  setSearching(t: Translate) {
    this.phase = "searching";
    this.notice = t("calibrate.auto.searching");
    this.render(t);
  }

  setFound(corners: Corners, farFret: number, t: Translate) {
    this.points = [...corners];
    this.farFret = farFret;
    this.phase = "marking";
    this.notice = t("calibrate.auto.found");
    this.doneHandler?.(corners, farFret);
    this.render(t);
  }

  /**
   * Swaps which side of the neck is the thick E.
   *
   * Nothing in the geometry says which side is which — a neck is the same
   * shape either way round — so when the detector guesses, this is how a
   * student says "the other way". Both ends swap together, or the quad folds
   * over on itself into a bow tie.
   */
  private flip(t: Translate) {
    if (this.points.length < 4) return;
    const [a, b, c, d] = this.points;
    this.points = [b, a, d, c];
    this.doneHandler?.(this.points.slice(0, 4) as Corners, this.farFret);
    this.render(t);
  }

  setNotFound(t: Translate) {
    this.phase = "marking";
    this.notice = t("calibrate.auto.failed");
    this.render(t);
  }

  private undo(t: Translate) {
    this.points.pop();
    this.notice = "";
    this.render(t);
  }

  private reset(t: Translate) {
    this.points = [];
    this.notice = "";
    this.render(t);
  }

  render(t: Translate = this.t ?? (() => "")) {
    this.t = t;
    clear(this.card);

    this.card.append(
      element("h2", { text: t("calibrate.title") }),
      element("p", { text: t("calibrate.intro") }),
    );

    // The step being asked for right now, in bold where it matters.
    if (this.points.length < 4) {
      const step = element("p", { className: "step" });
      step.append(renderEmphasis(t(`calibrate.step.${this.points.length + 1}` as TranslationKey)));
      this.card.append(step, element("p", { className: "quiet", text: t("calibrate.hint") }));
    } else {
      this.card.append(element("p", { className: "step", text: t("calibrate.saved") }));
    }

    if (this.notice) this.card.append(element("p", { className: "quiet", text: this.notice }));

    const row = element("div", { className: "row" });

    const auto = element("button", { className: "ghost", text: t("calibrate.auto"), attrs: { type: "button" } });
    auto.disabled = this.phase === "searching";
    auto.addEventListener("click", () => this.autoHandler?.());

    const flip = element("button", { className: "ghost", text: t("calibrate.flip"), attrs: { type: "button" } });
    flip.disabled = this.points.length < 4;
    flip.addEventListener("click", () => this.flip(t));

    const undo = element("button", { className: "ghost", text: t("calibrate.undo"), attrs: { type: "button" } });
    undo.disabled = this.points.length === 0;
    undo.addEventListener("click", () => this.undo(t));

    const reset = element("button", { className: "ghost", text: t("calibrate.reset"), attrs: { type: "button" } });
    reset.disabled = this.points.length === 0;
    reset.addEventListener("click", () => this.reset(t));

    const done = element("button", { className: "primary", text: t("calibrate.done"), attrs: { type: "button" } });
    done.disabled = this.points.length < 4;
    done.addEventListener("click", () => this.close());

    row.append(auto, flip, undo, reset, done);
    this.card.append(row);
  }
}
