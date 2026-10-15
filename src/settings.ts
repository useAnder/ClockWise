import { invoke } from "@tauri-apps/api/core";
import { DEFAULTS, loadSettings, onSettingsChanged, updateSettings, type Settings } from "./settings-model";

type Field = HTMLInputElement | HTMLSelectElement;

const form = document.getElementById("form") as HTMLFormElement;
const fields = [...form.querySelectorAll<Field>("[name]")];

function readField(field: Field): unknown {
  if (field instanceof HTMLInputElement) {
    if (field.type === "checkbox") return field.checked;
    if (field.type === "range") return Number(field.value);
  }
  if (field.dataset.type === "bool") return field.value === "true";
  return field.value;
}

function fill(s: Settings): void {
  for (const field of fields) {
    // Don't fight the control the user is currently dragging or typing in.
    if (field === document.activeElement && field.type !== "radio" && field.type !== "checkbox") continue;
    const value = s[field.name as keyof Settings];
    if (field instanceof HTMLInputElement && field.type === "radio") field.checked = field.value === value;
    else if (field instanceof HTMLInputElement && field.type === "checkbox") field.checked = Boolean(value);
    else field.value = String(value);
  }
  for (const out of form.querySelectorAll<HTMLOutputElement>("output[data-for]")) {
    out.value = `${Math.round(Number(s[out.dataset.for as keyof Settings]) * 100)}%`;
  }
  for (const row of form.querySelectorAll<HTMLElement>("[data-show-when]")) {
    const [key, expected] = row.dataset.showWhen!.split("=");
    row.hidden = String(s[key as keyof Settings]) !== expected;
  }
}

// Sliders fire many input events; coalesce them into one write.
let pending: Partial<Record<keyof Settings, unknown>> = {};
let flushTimer = 0;
function queue(key: keyof Settings, value: unknown): void {
  pending[key] = value;
  clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    const patch = pending;
    pending = {};
    void updateSettings(patch);
  }, 60);
}

for (const field of fields) {
  field.addEventListener("input", () => {
    if (field instanceof HTMLInputElement && field.type === "radio" && !field.checked) return;
    queue(field.name as keyof Settings, readField(field));
  });
}

document.getElementById("reset")!.addEventListener("click", () => {
  const patch = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, null]));
  void updateSettings(patch);
});
document.getElementById("quit")!.addEventListener("click", () => void invoke("quit"));

async function main(): Promise<void> {
  fill(await loadSettings());
  await onSettingsChanged(fill);
}

void main();
