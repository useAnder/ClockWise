export interface TimeParts {
  hh: string;
  mm: string;
  /** null when seconds are hidden. */
  ss: string | null;
  /** "AM"/"PM" in 12h mode, null in 24h mode. */
  ampm: string | null;
}

/** Builds its DOM once per settings change; `update` runs every tick and must be cheap. */
export interface Renderer {
  el: HTMLElement;
  update(t: TimeParts): void;
}

export function el(tag: string, className = "", text = ""): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
