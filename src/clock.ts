import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { createDots } from "./renderers/dots";
import { createFlip } from "./renderers/flip";
import { createText } from "./renderers/text";
import { el, type Renderer, type TimeParts } from "./renderers/types";
import { loadSettings, onSettingsChanged, resolveLocale, type Settings } from "./settings-model";

const win = getCurrentWindow();
const root = document.getElementById("clock")!;
const dateLine = el("div", "date");

let settings: Settings;
let renderer: Renderer;
let dateFormat: Intl.DateTimeFormat | null;
let timer = 0;

function timeParts(now: Date, s: Settings): TimeParts {
  let hours = now.getHours();
  let ampm: string | null = null;
  if (s.hour12) {
    ampm = hours < 12 ? "AM" : "PM";
    hours = hours % 12 || 12;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    hh: pad(hours),
    mm: pad(now.getMinutes()),
    ss: s.showSeconds ? pad(now.getSeconds()) : null,
    ampm,
  };
}

function buildDateFormat(s: Settings): Intl.DateTimeFormat | null {
  const opts: Intl.DateTimeFormatOptions = {};
  if (s.showWeekday) opts.weekday = "long";
  if (s.showDate) Object.assign(opts, { day: "numeric", month: "long" });
  if (s.showYear) opts.year = "numeric";
  if (!Object.keys(opts).length) return null;
  try {
    return new Intl.DateTimeFormat(resolveLocale(s.locale), opts);
  } catch {
    return new Intl.DateTimeFormat(undefined, opts);
  }
}

function render(): void {
  const now = new Date();
  renderer.update(timeParts(now, settings));
  if (dateFormat) {
    const text = dateFormat.format(now);
    dateLine.textContent = text.charAt(0).toLocaleUpperCase() + text.slice(1);
  }
}

/** Wakes exactly on the next second (or minute) boundary; nothing runs in between. */
function schedule(): void {
  clearTimeout(timer);
  const period = settings.showSeconds ? 1000 : 60_000;
  timer = window.setTimeout(() => {
    render();
    schedule();
  }, period - (Date.now() % period) + 5);
}

function apply(s: Settings): void {
  settings = s;
  const create = { "flip-light": () => createFlip(s.showSeconds), "flip-dark": () => createFlip(s.showSeconds), dots: () => createDots(s.showSeconds), text: createText }[s.style];
  renderer = create();
  dateFormat = buildDateFormat(s);

  root.className = [`style-${s.style}`, `panel-${s.panel}`, s.shadow ? "shadow" : "", s.locked ? "locked" : ""].join(" ");
  root.style.fontSize = `${16 * s.scale}px`;
  root.style.opacity = String(s.opacity);
  if (s.autoColor) root.style.removeProperty("--fg");
  else root.style.setProperty("--fg", s.color);

  dateLine.hidden = !dateFormat;
  root.replaceChildren(renderer.el, dateLine);
  render();
  schedule();
}

/** The window hugs the widget; body padding leaves room for the drop shadow. */
function fitWindow(): void {
  const rect = root.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(document.body).paddingLeft) * 2;
  void win.setSize(new LogicalSize(Math.ceil(rect.width + pad), Math.ceil(rect.height + pad)));
}

// A click opens the settings panel; pressing and moving drags the clock instead.
let pressedAt: { x: number; y: number } | null = null;
document.addEventListener("pointerdown", (e) => {
  if (e.button === 0) pressedAt = { x: e.screenX, y: e.screenY };
});
document.addEventListener("pointermove", (e) => {
  if (!pressedAt || settings.locked) return;
  if (Math.hypot(e.screenX - pressedAt.x, e.screenY - pressedAt.y) > 4) {
    pressedAt = null;
    void win.startDragging();
  }
});
document.addEventListener("pointerup", () => {
  if (!pressedAt) return;
  pressedAt = null;
  void invoke("open_settings");
});
document.addEventListener("contextmenu", (e) => e.preventDefault());

// Timers can be throttled or paused across sleep; resync when we come back.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && settings) {
    render();
    schedule();
  }
});

async function main(): Promise<void> {
  apply(await loadSettings());
  await onSettingsChanged(apply);
  let shown = false;
  new ResizeObserver(() => {
    fitWindow();
    if (!shown) {
      shown = true;
      void win.show();
    }
  }).observe(root);
}

void main();
