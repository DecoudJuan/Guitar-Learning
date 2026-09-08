/**
 * Where the class happens.
 *
 * One animation frame does four things, and this file is the only place that
 * knows about all of them:
 *
 *   1. Read the hands the camera sees.
 *   2. Work out where the fretboard is.
 *   3. Turn fingertips into fret positions and judge them against the lesson.
 *   4. Draw the result.
 *
 * Everything below the first line is delegated. App is a switchboard, not a
 * brain: the moment it starts deciding what a correct chord looks like, the
 * rules stop being checkable on their own.
 */

import { Fretboard, type Corners } from "../guitar/Fretboard";
import { GUITARS } from "../guitar/geometry";
import { createTranslator, type Translate } from "../i18n";
import { Overlay } from "../render/Overlay";
import { Calibrator } from "../ui/Calibrator";
import { requireElement } from "../ui/dom";
import { StartScreen } from "../ui/StartScreen";
import { HandTracker } from "../vision/HandTracker";
import type { Point } from "../vision/landmarks";
import { clearCalibration, loadCalibration, saveCalibration } from "./calibration";
import { loadSettings, responseFor, saveSettings, type Settings } from "./settings";

export class App {
  private settings: Settings = loadSettings();
  private t: Translate = createTranslator(this.settings.language);

  private stage = requireElement("stage");
  private video = requireElement<HTMLVideoElement>("video");
  private canvas = requireElement<HTMLCanvasElement>("canvas");

  private overlay = new Overlay(this.canvas);
  private tracker = new HandTracker(this.video, { maxHands: 2 });
  private start = new StartScreen();
  private calibrator = new Calibrator();

  /** Null until the neck has been marked or found. */
  private fretboard: Fretboard | null = null;
  private running = false;

  constructor() {
    document.documentElement.lang = this.settings.language;
    this.restoreCalibration();

    this.start.whenStarted(() => void this.begin());
    this.start.render(this.t);

    this.calibrator.whenDone((corners) => this.acceptCorners(corners));
    this.calibrator.whenClosed(() => this.stage.classList.remove("calibrating"));

    requireElement("calibrate-toggle").addEventListener("click", () => this.toggleCalibration());
    this.canvas.addEventListener("click", (event) => this.onCanvasClick(event));

    this.applyResponse();
    this.renderInterface();
    window.addEventListener("resize", () => this.resize());
  }

  private renderInterface() {
    requireElement("calibrate-toggle").textContent = this.t("calibrate.title");
    requireElement("lesson-toggle").textContent = this.t("lesson.toggle");
    requireElement("song-toggle").textContent = this.t("song.toggle");
    requireElement("help-toggle").textContent = this.t("help.toggle");
    requireElement("panel-toggle").textContent = this.t("panel.toggle");
  }

  /** One slider, three places: the filter, the hysteresis, and the model rate. */
  private applyResponse() {
    const response = responseFor(this.settings.smoothness);
    this.tracker.setSmoothing(response.minCutoff, response.beta);
    this.tracker.setInferenceInterval(response.inferenceInterval);
  }

  /**
   * A calibration is only reloaded for the guitar it was measured on. The same
   * four corners mean different physical widths on an acoustic and an electric,
   * so reading one as the other would put every string half a string out.
   */
  private restoreCalibration() {
    const stored = loadCalibration();
    if (!stored || stored.guitar !== this.settings.guitar) return;
    this.fretboard = Fretboard.from(GUITARS[this.settings.guitar], stored.corners);
  }

  private acceptCorners(corners: Corners) {
    const board = Fretboard.from(GUITARS[this.settings.guitar], corners);
    if (!board) return;
    this.fretboard = board;
    saveCalibration({ guitar: this.settings.guitar, corners });
  }

  private toggleCalibration() {
    if (this.calibrator.open) {
      this.calibrator.close();
      return;
    }
    // Starting over from scratch: the old neck is forgotten so a stale grid is
    // never left sitting on screen half-replaced by a new one.
    clearCalibration();
    this.fretboard = null;
    this.stage.classList.add("calibrating");
    this.calibrator.start(this.t);
  }

  private onCanvasClick(event: MouseEvent) {
    if (!this.calibrator.open) return;
    const rect = this.canvas.getBoundingClientRect();
    // Client pixels to canvas pixels to camera coordinates: the canvas is
    // drawn at device resolution and the video is cropped to cover, so both
    // steps are needed and neither is a no-op.
    const inCanvas: Point = {
      x: ((event.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * this.canvas.height,
    };
    this.calibrator.addPoint(this.overlay.view.toCamera(inCanvas), this.t);
  }

  private resize() {
    this.overlay.resize(this.video.videoWidth, this.video.videoHeight);
  }

  private async begin() {
    if (this.running) return;
    this.start.setStarting(true, this.t);
    this.start.showError("", this.t);
    try {
      await this.tracker.start();
    } catch (error) {
      this.start.setStarting(false, this.t);
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      this.start.showError(
        denied
          ? this.t("app.error.camera")
          : this.t("app.error.generic", { message: error instanceof Error ? error.message : String(error) }),
        this.t,
      );
      return;
    }

    this.start.hide();
    this.resize();
    this.running = true;

    // Nothing can be taught until the neck is known, so the class opens on it.
    if (!this.fretboard) this.toggleCalibration();

    requestAnimationFrame((time) => this.frame(time));
  }

  private frame(time: number) {
    if (!this.running) return;
    requestAnimationFrame((next) => this.frame(next));

    const hands = this.tracker.read(time);

    this.overlay.clear();
    if (this.fretboard && this.settings.showFretboard) {
      const lastFret = GUITARS[this.settings.guitar].maxTeachableFret;
      this.overlay.drawFretboard(
        this.fretboard.outline(lastFret),
        this.fretboard.fretLines(lastFret),
        this.fretboard.stringLines(lastFret),
      );
    }
    if (this.settings.showSkeleton) this.overlay.drawHands(hands);
    if (this.calibrator.open) this.overlay.drawCalibrationPoints(this.calibrator.marked);

    this.start.setStatus(this.statusLine(hands.length));
  }

  private statusLine(handCount: number): string {
    if (!this.fretboard) return this.t("status.calibrate");
    if (handCount === 0) return this.t("status.noHand");
    return this.t("status.ready", { fps: this.tracker.fps, name: "—" });
  }

  /** Kept for the settings panel, which arrives with the interface phase. */
  protected persist() {
    saveSettings(this.settings);
  }
}
