import { el, type Renderer, type TimeParts } from "./types";

function half(position: "top" | "bottom", text: string, flap = false): HTMLElement {
  const node = el("div", `half ${position}${flap ? " flap" : ""}`);
  node.append(el("span", "", text));
  return node;
}

/**
 * A split-flap card. On change the old top half folds down over the new one,
 * then the new bottom half folds down over the old one.
 */
class FlipCard {
  readonly el = el("div", "card");
  private value = "";
  private readonly top = half("top", "");
  private readonly bottom = half("bottom", "");

  constructor() {
    this.el.append(this.top, this.bottom);
  }

  set(next: string): void {
    if (next === this.value) return;
    const prev = this.value;
    this.value = next;
    for (const flap of this.el.querySelectorAll(".flap")) flap.remove();

    this.top.firstChild!.textContent = next;
    if (!prev || document.hidden) {
      this.bottom.firstChild!.textContent = next;
      return;
    }
    const flapTop = half("top", prev, true);
    const flapBottom = half("bottom", next, true);
    flapBottom.addEventListener(
      "animationend",
      () => {
        this.bottom.firstChild!.textContent = next;
        flapTop.remove();
        flapBottom.remove();
      },
      { once: true },
    );
    this.el.append(flapTop, flapBottom);
  }
}

export function createFlip(showSeconds: boolean): Renderer {
  const root = el("div", "time flip");
  const units = (showSeconds ? ["hh", "mm", "ss"] : ["hh", "mm"]).map(() => new FlipCard());
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
