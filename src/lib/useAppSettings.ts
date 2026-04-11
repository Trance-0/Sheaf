"use client";

import { useEffect, useSyncExternalStore } from "react";

export const SETTINGS_VERSION = "0.1.16";
const STORAGE_KEY = "sheaf-settings-v2";
const DB_HEADER = "x-sheaf-database-url";

export type NodeSizeFactor =
  | "event_count"
  | "market_cap"
  | "employee_count"
  | "free_cash_flow";

export type EdgeSizeFactor = "event_count";
// 0.1.16: "intern/entry" was added because the hand-written settings
// file uses that literal string. We keep the older singletons too so
// existing exports still round-trip.
export type UserLevelOfExpertise =
  | "intern/entry"
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "principal";

export interface JobsConfig {
  enabled: boolean;
  resumeURL: string;
  locationKeywords: string[];
  jobKeywords: string[];
  skillsKeywords: string[];
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
    resumeURL: "",
    locationKeywords: [],
    jobKeywords: [],
    skillsKeywords: [],
    userLevelOfExpertise: "intern/entry",
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

const LEVEL_VALUES: UserLevelOfExpertise[] = [
  "intern/entry",
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
];

function normalizeLevel(value: unknown): UserLevelOfExpertise {
  return typeof value === "string" && (LEVEL_VALUES as string[]).includes(value)
    ? (value as UserLevelOfExpertise)
    : "intern/entry";
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
      resumeURL: normalizeUrl(jobs.resumeURL),
      locationKeywords: asStringArray(jobs.locationKeywords),
      jobKeywords: asStringArray(jobs.jobKeywords),
      skillsKeywords: asStringArray(jobs.skillsKeywords),
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

/**
 * Non-hook accessor for the current settings snapshot. Used by
 * `SettingsPanel` to re-seed its draft after `importSettingsJson`
 * rewrites the store wholesale — the panel's auto-save effect is
 * gated on a user-edit ref, so it can't rely on the `[settings]`
 * subscription to pick up external mutations.
 */
export function getSettingsSnapshot(): AppSettings {
  return state;
}

export function exportSettingsJson(): string {
  return JSON.stringify(normalizeSettings(state), null, 2);
}

/**
 * Strip trailing commas before `}` or `]`. JSON.parse is strict and
 * rejects them, but hand-written settings files (the user's
 * `sheaf-settings-2026-04-11.json` for example) often leave them in.
 *
 * This is a naive pre-processor — a literal `,}` inside a string
 * value would be corrupted. Sheaf settings don't contain such strings
 * in practice, and a fully-correct implementation would need a real
 * JSON5 parser, which isn't worth the dependency here.
 */
function stripTrailingCommas(json: string): string {
  // Walk the string character by character, tracking whether we're
  // inside a string literal. Only remove `,` that is followed (after
  // whitespace) by `}` or `]` AND is not inside a string.
  let result = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escape) {
      result += ch;
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        result += ch;
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }
    if (ch === ",") {
      // Lookahead for the next non-whitespace character.
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j]!)) j++;
      if (json[j] === "}" || json[j] === "]") {
        // Drop the comma.
        continue;
      }
    }
    result += ch;
  }
  return result;
}

// Shape descriptor used by `collectSettingsIssues` to spot missing /
// unknown / mismatched field paths in an imported settings JSON.
// Strings are primitive type tags; nested objects describe sub-shapes.
type FieldType = "string" | "boolean" | "string[]" | ShapeObject;
interface ShapeObject {
  [key: string]: FieldType;
}

const EXPECTED_SHAPE: ShapeObject = {
  version: "string",
  theme: "string",
  nodeSizeFactor: "string",
  edgeSizeFactor: "string",
  databaseUrl: "string",
  jobsConfig: {
    enabled: "boolean",
    resumeURL: "string",
    locationKeywords: "string[]",
    jobKeywords: "string[]",
    skillsKeywords: "string[]",
    userLevelOfExpertise: "string",
  },
  researchConfig: {
    primaryEntityOfInterest: "string[]",
    newsSource: "string[]",
    newsRefreshPeriod: "string",
  },
};

export interface SettingsIssues {
  missing: string[];
  unknown: string[];
  typeMismatch: string[];
}

export function collectSettingsIssues(value: unknown, shape: ShapeObject = EXPECTED_SHAPE, path = ""): SettingsIssues {
  const issues: SettingsIssues = { missing: [], unknown: [], typeMismatch: [] };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.typeMismatch.push(`${path || "<root>"} (expected object)`);
    return issues;
  }
  const obj = value as Record<string, unknown>;

  for (const [key, expected] of Object.entries(shape)) {
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in obj)) {
      issues.missing.push(childPath);
      continue;
    }
    const actual = obj[key];
    if (typeof expected === "object") {
      const sub = collectSettingsIssues(actual, expected, childPath);
      issues.missing.push(...sub.missing);
      issues.unknown.push(...sub.unknown);
      issues.typeMismatch.push(...sub.typeMismatch);
    } else if (expected === "string[]") {
      if (!Array.isArray(actual) || !actual.every((v) => typeof v === "string")) {
        issues.typeMismatch.push(`${childPath} (expected string[], got ${describeType(actual)})`);
      }
    } else if (typeof actual !== expected) {
      issues.typeMismatch.push(`${childPath} (expected ${expected}, got ${describeType(actual)})`);
    }
  }

  for (const key of Object.keys(obj)) {
    if (!(key in shape)) {
      issues.unknown.push(path ? `${path}.${key}` : key);
    }
  }

  return issues;
}

function describeType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

export interface ImportOutcome {
  ok: boolean;
  error?: string;
  issues?: SettingsIssues;
}

/**
 * Parse a JSON string and apply it as the active settings. Returns a
 * structured outcome: a hard parse error (`ok: false, error`) or
 * success (`ok: true`) with an optional `issues` field describing
 * fields that were normalized away (unknown), missing, or had the
 * wrong type. Callers display these to the user so nothing is silently
 * dropped on mismatched imports.
 */
export function importSettingsJson(json: string): ImportOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripTrailingCommas(json));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
  const issues = collectSettingsIssues(parsed);
  updateSettings(normalizeSettings(parsed));
  const hasAny =
    issues.missing.length > 0 || issues.unknown.length > 0 || issues.typeMismatch.length > 0;
  return hasAny ? { ok: true, issues } : { ok: true };
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
