"use client";

/**
 * Tiny singleton-backed settings store for the Sheaf frontend.
 *
 * Persists to `localStorage['sheaf-settings-v1']` on every update, and
 * publishes to subscribers via `useSyncExternalStore` so multiple
 * components stay in sync within a single page-load. Exposed mutators
 * (`updateSettings`, `importSettingsJson`) are plain module functions —
 * SettingsPanel writes, page.tsx / GraphCanvas / SidePanel read.
 *
 * Why not Context: we only have two or three consumers and they all sit
 * inside `app/page.tsx`; a module-level store keeps the wiring honest
 * without forcing every component that needs `theme` or
 * `nodeSizeFactor` to thread a provider.
 */
import { useEffect, useSyncExternalStore } from "react";

export type NodeSizeFactor =
  | "event_count"
  | "market_cap"
  | "employee_count"
  | "free_cash_flow";

export interface AppSettings {
  theme: "dark" | "light";
  nodeSizeFactor: NodeSizeFactor;
}

const STORAGE_KEY = "sheaf-settings-v1";
const DEFAULTS: AppSettings = {
  theme: "dark",
  nodeSizeFactor: "event_count",
};

let state: AppSettings = { ...DEFAULTS };
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function applyTheme(theme: AppSettings["theme"]) {
  if (typeof document === "undefined") return;
  if (theme === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      state = { ...DEFAULTS, ...parsed };
    }
  } catch {
    // Corrupt JSON in localStorage — fall back to defaults.
  }
  applyTheme(state.theme);
  hydrated = true;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return state;
}

function getServerSnapshot(): AppSettings {
  // Server render always sees defaults; real state is applied on hydrate.
  return DEFAULTS;
}

export function updateSettings(patch: Partial<AppSettings>) {
  state = { ...state, ...patch };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage quota or privacy mode — silently drop.
    }
    if (patch.theme !== undefined) applyTheme(state.theme);
  }
  emit();
}

export function exportSettingsJson(): string {
  return JSON.stringify(state, null, 2);
}

export function importSettingsJson(json: string): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json) as Partial<AppSettings>;
    if (typeof parsed !== "object" || parsed === null) {
      return { ok: false, error: "Expected a JSON object at the top level" };
    }
    // Only accept keys we know about; silently ignore the rest.
    const next: AppSettings = { ...DEFAULTS };
    if (parsed.theme === "dark" || parsed.theme === "light") next.theme = parsed.theme;
    if (
      parsed.nodeSizeFactor === "event_count" ||
      parsed.nodeSizeFactor === "market_cap" ||
      parsed.nodeSizeFactor === "employee_count" ||
      parsed.nodeSizeFactor === "free_cash_flow"
    ) {
      next.nodeSizeFactor = parsed.nodeSizeFactor;
    }
    updateSettings(next);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" };
  }
}

export function useAppSettings() {
  // Hydrate from localStorage after mount so SSR markup matches the server snapshot.
  useEffect(() => {
    hydrate();
  }, []);
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { settings };
}
