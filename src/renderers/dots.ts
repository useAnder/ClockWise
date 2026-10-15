import { el, type Renderer, type TimeParts } from "./types";

// 5x7 dot-matrix glyphs, one string per row.
const GLYPHS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  ":": ["0", "0", "1", "0", "1", "0", "0"],
};

/** One glyph cell; only toggles dot classes when its character changes. */
class Glyph {
  readonly el = el("span", "glyph");
  private char = "";
  private dots: HTMLElement[] = [];

  set(char: string): void {
    if (char === this.char) return;
    this.char = char;
    const rows = GLYPHS[char] ?? GLYPHS["0"];
    const cols = rows[0].length;
    if (this.dots.length !== cols * rows.length) {
      this.el.style.setProperty("--cols", String(cols));
      this.dots = Array.from({ length: cols * rows.length }, () => el("i"));
      this.el.replaceChildren(...this.dots);
    }
    rows.join("").split("").forEach((bit, i) => this.dots[i].classList.toggle("on", bit === "1"));
  }
}

function group(className: string, count: number): { el: HTMLElement; glyphs: Glyph[] } {
  const glyphs = Array.from({ length: count }, () => new Glyph());
  const node = el("span", className);
  node.append(...glyphs.map((g) => g.el));
  return { el: node, glyphs };
}

export function createDots(showSeconds: boolean): Renderer {
  const root = el("div", "time dots");
  const main = group("main", 5);
  const small = group("small", 2);
  const ampm = group("small ampm", 2);
  root.append(main.el);
  if (showSeconds) root.append(small.el);
  root.append(ampm.el);

  return {
    el: root,
    update(t: TimeParts) {
      `${t.hh}:${t.mm}`.split("").forEach((c, i) => main.glyphs[i].set(c));
      if (t.ss) t.ss.split("").forEach((c, i) => small.glyphs[i].set(c));
      ampm.el.hidden = !t.ampm;
      if (t.ampm) t.ampm.split("").forEach((c, i) => ampm.glyphs[i].set(c));
    },
  };
}
