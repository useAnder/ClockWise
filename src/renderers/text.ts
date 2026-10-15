import { el, type Renderer, type TimeParts } from "./types";

export function createText(): Renderer {
  const root = el("div", "time text");
  const main = el("span", "main");
  const seconds = el("span", "sec");
  const ampm = el("span", "ampm");
  root.append(main, seconds, ampm);

  return {
    el: root,
    update(t: TimeParts) {
      main.textContent = `${t.hh}:${t.mm}`;
      seconds.textContent = t.ss ? `:${t.ss}` : "";
      ampm.textContent = t.ampm ?? "";
    },
  };
}
