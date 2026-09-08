/**
 * Where the class happens.
 *
 * One animation frame does four things, and this file is the only place that
 * knows about all of them:
 *
 *   1. Read the hands the camera sees.
 *   2. Put them on the fretboard.
 *   3. Judge them against the chord being taught, and let the lesson advance.
 *   4. Draw the result, on the neck and on the strip.
 *
 * Everything below the first line is delegated. App is a switchboard, not a
 * brain: the moment it starts deciding what a correct chord looks like, the
 * rules stop being checkable on their own.
 */

import { chordById, shapesFor, targetOf, type ChordShape, type ChordTarget } from "../guitar/chords";
import { FretReader, type NeckReading } from "../guitar/FretReader";
import { Fretboard, type Corners } from "../guitar/Fretboard";
import { GUITARS } from "../guitar/geometry";
import { firstProblem, judge, type ChordJudgement, type Verdict } from "../guitar/judge";
import { createTranslator, LOCALES, type Translate, type TranslationKey } from "../i18n";
import { lessonById, type Lesson } from "../lesson/curriculum";
import { loadProgress, recordResult, type Progress } from "../lesson/progress";
import { Session } from "../lesson/Session";
import { chordLayer } from "../render/chordLayer";
import { Overlay } from "../render/Overlay";
import { Calibrator } from "../ui/Calibrator";
import { Coach, type CoachTone } from "../ui/Coach";
import { requireElement } from "../ui/dom";
import { Help } from "../ui/Help";
import { LessonList } from "../ui/LessonList";
import { Panel } from "../ui/Panel";
import { SongPanel } from "../ui/SongPanel";
import { StartScreen } from "../ui/StartScreen";
import { HandTracker } from "../vision/HandTracker";
import type { Point } from "../vision/landmarks";
import type { HandReading } from "../vision/types";
import { NeckDetector } from "../vision/NeckDetector";
import { clearCalibration, loadCalibration, saveCalibration } from "./calibration";
import { loadSettings, responseFor, saveSettings, type SettingKey, type Settings } from "./settings";

/** A song loaded from a chart is a lesson too, just one nobody wrote down. */
const SONG_LESSON_ID = "song";

export class App {
  private settings: Settings = loadSettings();
  private t: Translate = createTranslator(this.settings.language);
  private progress: Progress = loadProgress();

  private stage = requireElement("stage");
  private video = requireElement<HTMLVideoElement>("video");
  private canvas = requireElement<HTMLCanvasElement>("canvas");

  private overlay = new Overlay(this.canvas);
  private tracker = new HandTracker(this.video, { maxHands: 2 });
  private detector = new NeckDetector();
  private reader = new FretReader();

  private start = new StartScreen();
  private calibrator = new Calibrator();
  private coach = new Coach();
  private help = new Help(() => this.t);
  private lessons = new LessonList(
    () => this.progress,
    () => this.t,
  );
  private songs = new SongPanel(() => this.t);
  private panel: Panel;

  /** Null until the neck has been marked or found. */
  private fretboard: Fretboard | null = null;
  /** Null when nothing is being taught: no lesson, no free chord. */
  private session: Session | null = null;
  /** In free practice this is the chord being worked on. */
  private freeChord: ChordShape | null = null;
  /** Where in the library free practice has walked to. */
  private freeIndex = 0;

  private running = false;
  private searchingUntil = 0;
  /** Shown for a moment after a lesson ends. */
  private notice = "";
  private noticeUntil = 0;

  constructor() {
    this.panel = new Panel(
      this.settings,
      (key) => this.onSettingChanged(key),
      () => this.beginCalibration(),
    );

    this.restoreCalibration();

    this.start.whenStarted(() => void this.begin());

    this.calibrator.whenDone((corners, farFret) => this.acceptCorners(corners, farFret));
    this.calibrator.whenClosed(() => this.stage.classList.remove("calibrating"));
    this.calibrator.whenAutoAsked(() => this.searchForNeck());

    this.lessons.whenChosen((lesson) => this.startLesson(lesson));
    this.lessons.whenFreeChosen(() => this.startFreePractice());
    this.songs.whenLoaded((load) => this.startSong(load.chords));

    // The same button means "I cannot get this one today" inside a lesson and
    // "show me another" in free practice — one button, because to the student
    // it is the same gesture: move on.
    this.coach.whenSkipped(() => (this.session ? this.session.skip() : this.nextFreeChord()));
    this.coach.whenLeft(() => this.stopLesson());

    requireElement("calibrate-toggle").addEventListener("click", () => this.beginCalibration());
    this.canvas.addEventListener("click", (event) => this.onCanvasClick(event));

    this.applyResponse();
    this.renderInterface();
    window.addEventListener("resize", () => this.resize());
  }

  private renderInterface() {
    document.documentElement.lang = this.settings.language;
    requireElement("calibrate-toggle").textContent = this.t("calibrate.title");
    requireElement("lesson-toggle").textContent = this.t("lesson.toggle");
    requireElement("song-toggle").textContent = this.t("song.toggle");
    requireElement("help-toggle").textContent = this.t("help.toggle");
    requireElement("panel-toggle").textContent = this.t("panel.toggle");

    this.start.render(this.t);
    this.panel.render(this.t);
    this.coach.render(this.t);
    this.calibrator.render(this.t);
    // The cards render themselves when opened, so only the open ones need
    // rebuilding — which is what makes switching language mid-session work.
    this.help.render();
    if (this.lessons.open) this.lessons.render();
  }

  /** One slider, three places: the filter, the hysteresis, and the model rate. */
  private applyResponse() {
    const response = responseFor(this.settings.smoothness);
    this.tracker.setSmoothing(response.minCutoff, response.beta);
    this.tracker.setInferenceInterval(response.inferenceInterval);
    this.reader.setFramesNeeded(response.framesNeeded);
  }

  private onSettingChanged(key: SettingKey) {
    switch (key) {
      case "language":
        this.t = createTranslator(this.settings.language);
        this.renderInterface();
        break;
      case "smoothness":
        this.applyResponse();
        break;
      case "guitar":
        // A different instrument is a different neck: the stored corners
        // describe widths that are no longer true, so the class asks again.
        this.fretboard = null;
        clearCalibration();
        this.reader.reset();
        this.beginCalibration();
        break;
      default:
        break;
    }
    saveSettings(this.settings);
  }

  // --- The neck -----------------------------------------------------------

  private restoreCalibration() {
    const stored = loadCalibration();
    if (!stored || stored.guitar !== this.settings.guitar) return;
    this.fretboard = Fretboard.from(GUITARS[this.settings.guitar], stored.corners, stored.farFret);
  }

  private acceptCorners(corners: Corners, farFret: number) {
    const board = Fretboard.from(GUITARS[this.settings.guitar], corners, farFret);
    if (!board) return;
    this.fretboard = board;
    this.reader.reset();
    saveCalibration({ guitar: this.settings.guitar, corners, farFret });
  }

  private beginCalibration() {
    this.panel.setOpen(false);
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
    if (this.running && this.settings.autoDetect) this.searchForNeck();
  }

  /**
   * Gives the detector a second of frames to find the neck.
   *
   * A second rather than one frame because a hand crossing the strings, or a
   * moment of glare, ruins a single frame often enough to be the normal case;
   * the first frame that yields a confident answer wins, and the search stops.
   */
  private searchForNeck() {
    if (!this.running) return;
    this.searchingUntil = performance.now() + 1000;
    this.calibrator.setSearching(this.t);
  }

  private tickSearch(now: number) {
    if (now > this.searchingUntil) {
      this.searchingUntil = 0;
      this.calibrator.setNotFound(this.t);
      return;
    }
    const found = this.detector.detect(this.video);
    // Below about half confidence the quad is usually a table edge or a door
    // frame, and offering it costs more trust than saying nothing.
    if (!found || found.confidence < 0.5) return;
    this.searchingUntil = 0;
    this.calibrator.setFound(found.corners, found.farFret, this.t);
  }

  private onCanvasClick(event: MouseEvent) {
    if (!this.calibrator.open) return;
    const rect = this.canvas.getBoundingClientRect();
    // Client pixels to canvas pixels to camera coordinates: the canvas is drawn
    // at device resolution and the video is cropped to cover, so both steps are
    // needed and neither is a no-op.
    const inCanvas: Point = {
      x: ((event.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * this.canvas.height,
    };
    this.calibrator.addPoint(this.overlay.view.toCamera(inCanvas), this.t);
  }

  // --- Lessons ------------------------------------------------------------

  private startLesson(lesson: Lesson) {
    this.freeChord = null;
    this.session = new Session(lesson);
    this.reader.reset();
  }

  private startSong(chords: string[]) {
    this.startLesson({ id: SONG_LESSON_ID, kind: "changes", chords, rounds: 1, requires: null });
  }

  /**
   * Free practice: no sequence, no scoring, one chord held as long as you like.
   *
   * Reachable from the first minute, including chords the course has not
   * unlocked. The locking orders a course; it was never meant to withhold a C
   * from someone who wants to try one.
   */
  private startFreePractice() {
    this.session = null;
    this.freeIndex = 0;
    this.freeChord = this.freeLibrary()[0] ?? chordById("Em") ?? null;
    this.reader.reset();
  }

  /** Only shapes this guitar can reach: an acoustic runs out of neck sooner. */
  private freeLibrary(): ChordShape[] {
    return shapesFor(GUITARS[this.settings.guitar]);
  }

  private nextFreeChord() {
    const library = this.freeLibrary();
    if (library.length === 0) return;
    this.freeIndex = (this.freeIndex + 1) % library.length;
    this.freeChord = library[this.freeIndex];
  }

  private stopLesson() {
    this.session = null;
    this.freeChord = null;
    this.coach.hide();
  }

  private finishLesson(session: Session) {
    const state = session.state;
    this.showNotice(
      this.t("lesson.done.body", {
        correct: state.firstTryCount,
        total: state.total,
        streak: state.bestStreak,
      }),
    );
    // A song is a lesson while it is being played but never part of the course,
    // so it unlocks nothing and is not written down.
    if (lessonById(session.lesson.id)) {
      this.progress = recordResult(this.progress, session.lesson.id, state.firstTryCount, state.bestStreak);
    }
    this.stopLesson();
    this.lessons.setOpen(true);
  }

  private showNotice(text: string) {
    this.notice = text;
    this.noticeUntil = performance.now() + 6000;
  }

  // --- Running ------------------------------------------------------------

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

    // Nothing can be taught until the neck is known, so the class opens on it —
    // and, if asked to, tries to spare the student the four clicks entirely.
    if (!this.fretboard) this.beginCalibration();
    else this.lessons.setOpen(true);

    requestAnimationFrame((time) => this.frame(time));
  }

  private frame(time: number) {
    if (!this.running) return;
    requestAnimationFrame((next) => this.frame(next));

    const hands = this.tracker.read(time);
    if (this.searchingUntil > 0) this.tickSearch(time);

    this.overlay.clear();

    const board = this.fretboard;
    const target = this.currentTarget();

    let reading: NeckReading | null = null;
    if (board && hands.length > 0) {
      const fretting = this.reader.pick(hands, board, this.settings.handedness);
      if (fretting) reading = this.reader.read(fretting, board);
    }

    const judgement = board && target ? judge(target, reading, this.settings.tolerance) : null;

    if (this.session && judgement) {
      const state = this.session.update(judgement, time, this.settings.holdSeconds);
      if (state.phase === "finished") this.finishLesson(this.session);
    }

    this.draw(board, target, judgement, hands);
    this.updateCoach(target, judgement);
    this.start.setStatus(this.statusLine(time, hands.length, judgement));
  }

  /** The chord being asked for right now, whatever is asking for it. */
  private currentShape(): ChordShape | null {
    if (this.session && !this.session.finished) return chordById(this.session.state.chordId) ?? null;
    return this.freeChord;
  }

  private currentTarget(): ChordTarget | null {
    const shape = this.currentShape();
    return shape ? targetOf(shape) : null;
  }

  private draw(
    board: Fretboard | null,
    target: ChordTarget | null,
    judgement: ChordJudgement | null,
    hands: HandReading[],
  ) {
    if (board && this.settings.showFretboard) {
      const lastFret = GUITARS[this.settings.guitar].maxTeachableFret;
      this.overlay.drawFretboard(board.outline(lastFret), board.fretLines(lastFret), board.stringLines(lastFret));
    }

    if (this.settings.showSkeleton) this.overlay.drawHands(hands);

    if (board && target && judgement) {
      const layer = chordLayer(board, target, judgement, {
        showNoteNames: this.settings.showNoteNames,
        notation: LOCALES[this.settings.language].notation,
      });
      // Arrows first: a marker drawn over an arrowhead reads as a target, and
      // an arrowhead drawn over a marker reads as clutter.
      for (const nudge of layer.nudges) this.overlay.drawNudge(nudge.from, nudge.to, nudge.colour);
      this.overlay.drawMarkers(layer.markers);
    }

    if (this.calibrator.open) this.overlay.drawCalibrationPoints(this.calibrator.marked);
  }

  private updateCoach(target: ChordTarget | null, judgement: ChordJudgement | null) {
    if (!target || !judgement) {
      this.coach.hide();
      return;
    }

    const state = this.session?.state;
    const verdicts = new Map<number, Verdict>();
    for (const entry of judgement.perFinger) verdicts.set(entry.placement.finger, entry.verdict);

    const meta: string[] = [];
    if (state) {
      meta.push(this.t("lesson.progress", { done: Math.min(state.index + 1, state.total), total: state.total }));
      if (state.streak > 1) meta.push(this.t("lesson.streak", { count: state.streak }));
    }

    this.coach.show({
      shape: target.shape,
      title: this.t("chord.play", { name: target.shape.name }),
      line: this.adviceFor(target, judgement),
      tone: this.toneFor(judgement),
      hold: state?.hold ?? (judgement.complete ? 1 : 0),
      meta,
      verdicts,
    });
  }

  private toneFor(judgement: ChordJudgement): CoachTone {
    if (judgement.complete) return "right";
    return judgement.perFinger.some((entry) => entry.verdict === "wrongFret" || entry.verdict === "wrongString")
      ? "wrong"
      : "neutral";
  }

  /**
   * The one sentence worth saying.
   *
   * A barre gets its own line because "index: wrong fret" is a useless thing to
   * tell someone whose whole problem is that a barre is one finger doing six
   * jobs; naming it as a barre is what makes the instruction match the hand.
   */
  private adviceFor(target: ChordTarget, judgement: ChordJudgement): string {
    if (judgement.complete) return this.t("judge.allGood");

    const problem = firstProblem(judgement);
    if (!problem) return this.t("judge.allGood");

    const { placement, verdict } = problem;
    if (placement.underBarre && target.barre) {
      return this.t("chord.barre", { fret: target.barre.fret });
    }

    const finger = this.t(`finger.${placement.finger}` as TranslationKey);
    const stringName = this.t(`string.${placement.string}` as TranslationKey);
    switch (verdict) {
      case "missing":
        return this.t("judge.missing", { finger, fret: placement.fret, string: stringName });
      case "wrongFret":
        return this.t("judge.wrongFret", { finger, fret: placement.fret });
      case "wrongString":
        return this.t("judge.wrongString", { finger, string: stringName });
      default:
        return this.t("judge.correct", { finger });
    }
  }

  private statusLine(now: number, handCount: number, judgement: ChordJudgement | null): string {
    if (now < this.noticeUntil) return this.notice;
    if (this.searchingUntil > 0) return this.t("status.searching");
    if (!this.fretboard) return this.t("status.calibrate");
    if (handCount === 0) return this.t("status.noHand");
    if (judgement?.complete) return this.t("status.good");
    const shape = this.currentShape();
    return this.t("status.ready", { fps: this.tracker.fps, name: shape?.name ?? "—" });
  }
}
