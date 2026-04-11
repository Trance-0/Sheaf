"use client";

import { useEffect, useSyncExternalStore } from "react";

export const SETTINGS_VERSION = "0.1.13";
const STORAGE_KEY = "sheaf-settings-v2";
const DB_HEADER = "x-sheaf-database-url";

export type NodeSizeFactor =
  | "event_count"
  | "market_cap"
  | "employee_count"
  | "free_cash_flow";

export type EdgeSizeFactor = "event_count";
export type UserLevelOfExpertise = "intern" | "junior" | "mid" | "senior" | "staff" | "principal";

export interface JobsConfig {
  enabled: boolean;
  userResumeURL: string;
  userJobKeywords: string[];
  userLevelOfExpertise: UserLevelOfExpertise;
}

export interface ResearchConfig {
  primaryEntityOfInterest: string[];
  newsSource: string[];
  newsRefreshPeriod: string;
}

export interface AppSettings {
  version: string;
  theme: "dark" | "light";
  nodeSizeFactor: NodeSizeFactor;
  edgeSizeFactor: EdgeSizeFactor;
  databaseUrl: string;
  jobsConfig: JobsConfig;
  researchConfig: ResearchConfig;
}

const DEFAULTS: AppSettings = {
  version: SETTINGS_VERSION,
  theme: "dark",
  nodeSizeFactor: "market_cap",
  edgeSizeFactor: "event_count",
  databaseUrl: "",
  jobsConfig: {
    enabled: true,
    userResumeURL: "",
    userJobKeywords: [],
    userLevelOfExpertise: "intern",
  },
  researchConfig: {
    primaryEntityOfInterest: [
      "anthropic",
      "x",
      "microsoft",
      "google",
      "aws",
      "crowdstrike",
      "nvidia",
      "openai",
      "jpmorgan",
      "apple",
      "amazon",
      "linux foundation",
      "intel",
      "meta",
      "palantir",
      "salesforce",
      "uber",
      "amd",
      "ibm",
      "figma",
      "adobe",
      "slack",
      "tiktok",
      "TSMC",
      "bytedance",
    ],
    newsSource: [],
    newsRefreshPeriod: "0 * * * *",
  },
};

let state: AppSettings = { ...DEFAULTS };
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function applyTheme(theme: AppSettings["theme"]) {
  if (typeof document === "undefined") return;
  if (theme === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeTheme(value: unknown): AppSettings["theme"] {
  return value === "light" ? "light" : "dark";
}

function normalizeNodeSizeFactor(value: unknown): NodeSizeFactor {
  return value === "event_count" || value === "market_cap" || value === "employee_count" || value === "free_cash_flow"
    ? value
    : DEFAULTS.nodeSizeFactor;
}

function normalizeEdgeSizeFactor(value: unknown): EdgeSizeFactor {
  return value === "event_count" ? value : DEFAULTS.edgeSizeFactor;
}

function normalizeLevel(value: unknown): UserLevelOfExpertise {
  return value === "junior" || value === "mid" || value === "senior" || value === "staff" || value === "principal"
    ? value
    : "intern";
}

function normalizeUrl(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCron(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULTS.researchConfig.newsRefreshPeriod;
}

function normalizeSettings(value: unknown): AppSettings {
  const parsed = typeof value === "object" && value !== null ? (value as Partial<AppSettings>) : {};
  const jobs: Partial<JobsConfig> = typeof parsed.jobsConfig === "object" && parsed.jobsConfig !== null ? parsed.jobsConfig : {};
  const research: Partial<ResearchConfig> = typeof parsed.researchConfig === "object" && parsed.researchConfig !== null ? parsed.researchConfig : {};

  return {
    version: SETTINGS_VERSION,
    theme: normalizeTheme(parsed.theme),
    nodeSizeFactor: normalizeNodeSizeFactor(parsed.nodeSizeFactor),
    edgeSizeFactor: normalizeEdgeSizeFactor(parsed.edgeSizeFactor),
    databaseUrl: normalizeUrl(parsed.databaseUrl),
    jobsConfig: {
      enabled: typeof jobs.enabled === "boolean" ? jobs.enabled : DEFAULTS.jobsConfig.enabled,
      userResumeURL: normalizeUrl(jobs.userResumeURL),
      userJobKeywords: asStringArray(jobs.userJobKeywords),
      userLevelOfExpertise: normalizeLevel(jobs.userLevelOfExpertise),
    },
    researchConfig: {
      primaryEntityOfInterest: asStringArray(research.primaryEntityOfInterest).length
        ? asStringArray(research.primaryEntityOfInterest)
        : [...DEFAULTS.researchConfig.primaryEntityOfInterest],
      newsSource: asStringArray(research.newsSource),
      newsRefreshPeriod: normalizeCron(research.newsRefreshPeriod),
    },
  };
}

function persist() {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? normalizeSettings(JSON.parse(raw)) : { ...DEFAULTS, jobsConfig: { ...DEFAULTS.jobsConfig }, researchConfig: { ...DEFAULTS.researchConfig, primaryEntityOfInterest: [...DEFAULTS.researchConfig.primaryEntityOfInterest], newsSource: [] } };
  } catch {
    state = { ...DEFAULTS, jobsConfig: { ...DEFAULTS.jobsConfig }, researchConfig: { ...DEFAULTS.researchConfig, primaryEntityOfInterest: [...DEFAULTS.researchConfig.primaryEntityOfInterest], newsSource: [] } };
  }
  applyTheme(state.theme);
  hydrated = true;
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

function getServerSnapshot(): AppSettings {
  return DEFAULTS;
}

export function updateSettings(next: AppSettings | Partial<AppSettings>) {
  state = normalizeSettings({ ...state, ...next });
  if (typeof window !== "undefined") {
    try {
      persist();
    } catch {
      // Ignore storage failures.
    }
  }
  applyTheme(state.theme);
  emit();
}

export function exportSettingsJson(): string {
  return JSON.stringify(normalizeSettings(state), null, 2);
}

export function importSettingsJson(json: string): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json);
    updateSettings(normalizeSettings(parsed));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

export function buildDatabaseHeaders(settings: Pick<AppSettings, "databaseUrl">): HeadersInit {
  return settings.databaseUrl.trim()
    ? { [DB_HEADER]: settings.databaseUrl.trim() }
    : {};
}

export function hasDatabaseUrl(settings: Pick<AppSettings, "databaseUrl">): boolean {
  return settings.databaseUrl.trim().length > 0;
}

export function useAppSettings() {
  useEffect(() => {
    hydrate();
  }, []);
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { settings };
}
