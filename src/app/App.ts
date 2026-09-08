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
 * F1 of the roadmap builds the first and the last; the middle two arrive in
 * the phases that follow.
 */

import { createTranslator, type Translate } from "../i18n";
import { Overlay } from "../render/Overlay";
import { requireElement } from "../ui/dom";
import { StartScreen } from "../ui/StartScreen";
import { HandTracker } from "../vision/HandTracker";
import { loadSettings, responseFor, type Settings } from "./settings";

export class App {
  private settings: Settings = loadSettings();
  private t: Translate = createTranslator(this.settings.language);

  private video = requireElement<HTMLVideoElement>("video");
  private canvas = requireElement<HTMLCanvasElement>("canvas");

  private overlay = new Overlay(this.canvas);
  private tracker = new HandTracker(this.video, { maxHands: 2 });
  private start = new StartScreen();

  private running = false;

  constructor() {
    document.documentElement.lang = this.settings.language;
    this.start.whenStarted(() => void this.begin());
    this.start.render(this.t);
    this.applyResponse();
    window.addEventListener("resize", () => this.resize());
  }

  /** One slider, three places: the filter, the hysteresis, and the model rate. */
  private applyResponse() {
    const response = responseFor(this.settings.smoothness);
    this.tracker.setSmoothing(response.minCutoff, response.beta);
    this.tracker.setInferenceInterval(response.inferenceInterval);
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
    requestAnimationFrame((time) => this.frame(time));
  }

  private frame(time: number) {
    if (!this.running) return;
    requestAnimationFrame((next) => this.frame(next));

    const hands = this.tracker.read(time);

    this.overlay.clear();
    if (this.settings.showSkeleton) this.overlay.drawHands(hands);

    this.start.setStatus(
      hands.length === 0
        ? this.t("status.noHand")
        : this.t("status.ready", { fps: this.tracker.fps, name: "—" }),
    );
  }
}
