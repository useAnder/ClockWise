import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type ClockStyle = "flip-light" | "flip-dark" | "dots" | "text";
export type Panel = "none" | "light" | "dark";
export type Animation = "smooth" | "lite" | "off";

export interface Settings {
  style: ClockStyle;
  hour12: boolean;
  showSeconds: boolean;
  showWeekday: boolean;
  showDate: boolean;
  showYear: boolean;
  /** BCP 47 tag, or "auto" for the system language. */
  locale: string;
  scale: number;
  opacity: number;
  panel: Panel;
  /** Pick a readable color from the panel; otherwise use `color`. */
  autoColor: boolean;
  color: string;
  shadow: boolean;
  /** Flip animation; "lite" draws few frames, which matters with GPU disabled. */
  animation: Animation;
  /** Disables dragging the clock around. */
  locked: boolean;
  autostart: boolean;
}

export const DEFAULTS: Settings = {
  style: "flip-light",
  hour12: false,
  showSeconds: true,
  showWeekday: true,
  showDate: true,
  showYear: false,
  locale: "auto",
  scale: 1,
  opacity: 1,
  panel: "light",
  autoColor: true,
  color: "#ffffff",
  shadow: true,
  animation: "lite",
  locked: false,
  autostart: true,
};

/** Fills missing or mistyped keys from DEFAULTS; the stored file is never trusted. */
export function withDefaults(raw: Record<string, unknown>): Settings {
  const out: Record<string, unknown> = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    if (typeof raw[key] === typeof DEFAULTS[key]) out[key] = raw[key];
  }
  return out as unknown as Settings;
}

export async function loadSettings(): Promise<Settings> {
  return withDefaults(await invoke<Record<string, unknown>>("get_settings"));
}

/** `null` resets a key to its default. */
export function updateSettings(patch: Partial<Record<keyof Settings, unknown>>): Promise<unknown> {
  return invoke("update_settings", { patch });
}

export function onSettingsChanged(cb: (s: Settings) => void): Promise<UnlistenFn> {
  return listen<Record<string, unknown>>("settings-changed", (e) => cb(withDefaults(e.payload)));
}

export function resolveLocale(locale: string): string {
  return locale === "auto" ? navigator.language : locale;
}
