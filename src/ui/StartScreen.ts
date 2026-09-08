/**
 * The card that stands between a cold page and a running camera.
 *
 * It says what the app is, what it needs, and — when the browser or the device
 * is a poor fit — says so honestly without taking the button away. Nobody is
 * blocked from trying; they are just not surprised when it stutters.
 */

import type { Translate } from "../i18n";
import { element, clear, requireElement } from "./dom";
import { environmentHint } from "./environment";

export class StartScreen {
  private root = requireElement("start");
  private card = requireElement("start-card");
  private status = requireElement("status");
  private startHandler: (() => void) | null = null;
  private starting = false;
  private error = "";

  whenStarted(handler: () => void) {
    this.startHandler = handler;
  }

  render(t: Translate) {
    clear(this.card);
    const hint = environmentHint();

    this.card.append(
      element("h2", { className: "start-title", text: t("app.title") }),
      element("p", { className: "start-lead", text: t("app.tagline") }),
      element("p", { className: "start-note", text: t("app.privacy") }),
    );

    if (hint) {
      this.card.append(element("p", { className: "start-warn", text: t(`app.hint.${hint}`) }));
    }

    const button = element("button", {
      className: "primary",
      text: this.starting ? t("app.starting") : t("app.start"),
      attrs: { type: "button" },
    });
    button.disabled = this.starting;
    button.addEventListener("click", () => this.startHandler?.());
    this.card.append(button);

    if (this.error) {
      this.card.append(element("p", { className: "start-error", text: this.error }));
    }
  }

  setStarting(starting: boolean, t: Translate) {
    this.starting = starting;
    this.render(t);
  }

  showError(message: string, t: Translate) {
    this.error = message;
    this.render(t);
  }

  hide() {
    this.root.classList.add("gone");
  }

  setStatus(text: string) {
    if (this.status.textContent !== text) this.status.textContent = text;
  }
}
