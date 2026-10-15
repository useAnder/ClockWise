import { el, type Renderer, type TimeParts } from "./types";

function half(position: "top" | "bottom", text: string, flap = false): HTMLElement {
  const node = el("div", `half ${position}${flap ? " flap" : ""}`);
  node.append(el("span", "", text));
  return node;
}

import type { Animation } from "../settings-model";

// "lite" frames: [top flap angle, bottom flap angle]. Each step is one repaint;
// a CSS animation would repaint at 60 fps, which is costly in software rendering.
const LITE_FRAMES: [number, number][] = [
  [-45, 90],
  [-90, 90],
  [-90, 45],
  [-90, 0],
];
const LITE_FRAME_MS = 90;

/**
 * A split-flap card. On change the old top half folds down over the new one,
 * then the new bottom half folds down over the old one.
 */
class FlipCard {
  readonly el = el("div", "card");
  private value = "";
  private frameTimer = 0;
  private readonly top = half("top", "");
  private readonly bottom = half("bottom", "");

  constructor(private readonly animation: Animation) {
    this.el.append(this.top, this.bottom);
  }

  set(next: string): void {
    if (next === this.value) return;
    const prev = this.value;
    this.value = next;
    clearTimeout(this.frameTimer);
    for (const flap of this.el.querySelectorAll(".flap")) flap.remove();

    this.top.firstChild!.textContent = next;
    if (!prev || this.animation === "off" || document.hidden) {
      this.bottom.firstChild!.textContent = next;
      return;
    }
    const flapTop = half("top", prev, true);
    const flapBottom = half("bottom", next, true);
    const finish = () => {
      this.bottom.firstChild!.textContent = next;
      flapTop.remove();
      flapBottom.remove();
    };

    if (this.animation === "smooth") {
      flapBottom.addEventListener("animationend", finish, { once: true });
    } else {
      flapTop.classList.add("manual");
      flapBottom.classList.add("manual");
      let i = 0;
      const step = () => {
        if (i === LITE_FRAMES.length) return finish();
        const [topAngle, bottomAngle] = LITE_FRAMES[i++];
        flapTop.style.transform = `rotateX(${topAngle}deg)`;
        flapBottom.style.transform = `rotateX(${bottomAngle}deg)`;
        this.frameTimer = window.setTimeout(step, LITE_FRAME_MS);
      };
      this.frameTimer = window.setTimeout(step, LITE_FRAME_MS);
    }
    this.el.append(flapTop, flapBottom);
  }
}

export function createFlip(showSeconds: boolean, animation: Animation): Renderer {
  const root = el("div", "time flip");
  const units = (showSeconds ? ["hh", "mm", "ss"] : ["hh", "mm"]).map(() => new FlipCard(animation));
  const ampm = el("span", "ampm");
  root.append(...units.map((u) => u.el), ampm);

  return {
    el: root,
    update(t: TimeParts) {
      const values = [t.hh, t.mm, t.ss ?? ""];
      units.forEach((u, i) => u.set(values[i]));
      ampm.textContent = t.ampm ?? "";
      ampm.hidden = !t.ampm;
    },
  };
}
