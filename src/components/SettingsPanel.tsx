"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Moon, Sun, Download, Upload, Sparkles, Database, Briefcase, Search, Star } from "lucide-react";

/**
 * Tiny inline GitHub mark. Lucide dropped its branded `Github` icon so
 * we ship a minimal SVG instead of pulling another icon dependency just
 * for the footer link.
 */
function GitHubMark({ size = 12 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.73.5.77 5.46.77 11.73c0 4.96 3.22 9.16 7.68 10.65.56.1.77-.25.77-.54 0-.27-.01-.98-.02-1.92-3.12.68-3.79-1.5-3.79-1.5-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.49-.28-5.11-1.25-5.11-5.54 0-1.22.44-2.22 1.16-3-.12-.28-.5-1.43.11-2.98 0 0 .94-.3 3.09 1.15a10.7 10.7 0 0 1 2.81-.38c.95 0 1.91.13 2.81.38 2.15-1.45 3.09-1.15 3.09-1.15.61 1.55.23 2.7.11 2.98.72.78 1.16 1.78 1.16 3 0 4.3-2.63 5.26-5.13 5.54.4.35.76 1.02.76 2.07 0 1.5-.01 2.7-.01 3.07 0 .29.2.65.78.54 4.46-1.5 7.67-5.69 7.67-10.65C23.23 5.46 18.27.5 12 .5Z" />
    </svg>
  );
}
import {
  SETTINGS_VERSION,
  useAppSettings,
  updateSettings,
  exportSettingsJson,
  importSettingsJson,
  getSettingsSnapshot,
  type AppSettings,
  type EdgeSizeFactor,
  type NodeSizeFactor,
  type SettingsIssues,
  type UserLevelOfExpertise,
} from "@/lib/useAppSettings";

const NODE_SIZE_FACTORS: { value: NodeSizeFactor; label: string; hint: string }[] = [
  { value: "event_count", label: "Event Count", hint: "Size nodes by how often they appear in recent events" },
  { value: "market_cap", label: "Market Cap", hint: "Log-scaled market capitalization" },
  { value: "employee_count", label: "Employee Count", hint: "Log-scaled headcount" },
  { value: "free_cash_flow", label: "Free Cash Flow", hint: "Log-scaled free cash flow" },
];

const EDGE_SIZE_FACTORS: { value: EdgeSizeFactor; label: string; hint: string }[] = [
  { value: "event_count", label: "Event Count", hint: "Scale relationship thickness by the number of clustered events" },
];

const EXPERTISE_LEVELS: UserLevelOfExpertise[] = [
  "intern/entry",
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
];

// Shared input styling so every <input>/<textarea>/<select> in the Jobs
// and Research columns follows the same theme contract. The previous
// version was missing the explicit text color — native form elements
// default to black and became unreadable in dark mode against the dark
// translucent background. `[color-scheme]` hints make the native select
// arrow and date picker match the theme too.
const FORM_FIELD_CLASS =
  "mt-1 w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-blue-500 transition-colors [color-scheme:light] dark:[color-scheme:dark]";

// <option> elements do NOT inherit the parent <select>'s background in
// most browsers — we have to set it explicitly so the dropdown list
// matches the app theme instead of popping as white-on-white.
const OPTION_CLASS = "bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100";

function listToText(items: string[]) {
  return items.join("\n");
}

function textToList(text: string) {
  return text
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildDraft(settings: AppSettings) {
  return {
    theme: settings.theme,
    nodeSizeFactor: settings.nodeSizeFactor,
    edgeSizeFactor: settings.edgeSizeFactor,
    databaseUrl: settings.databaseUrl,
    jobsEnabled: settings.jobsConfig.enabled,
    resumeURL: settings.jobsConfig.resumeURL,
    locationKeywords: listToText(settings.jobsConfig.locationKeywords),
    jobKeywords: listToText(settings.jobsConfig.jobKeywords),
    skillsKeywords: listToText(settings.jobsConfig.skillsKeywords),
    userLevelOfExpertise: settings.jobsConfig.userLevelOfExpertise,
    primaryEntityOfInterest: listToText(settings.researchConfig.primaryEntityOfInterest),
    newsSource: listToText(settings.researchConfig.newsSource),
    newsRefreshPeriod: settings.researchConfig.newsRefreshPeriod,
  };
}

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings } = useAppSettings();
  const [draft, setDraft] = useState(() => buildDraft(settings));
  const [importMsg, setImportMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [importIssues, setImportIssues] = useState<SettingsIssues | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // 0.1.19 — the Save button was removed in favor of debounced
  // auto-save. We can't just call `updateSettings` on every keystroke
  // because that would re-trigger the `[settings]` subscription in
  // every other consumer of `useAppSettings` for every character typed.
  // Strategy: wait 400ms after the last user edit, then commit.
  //
  // The `isUserEditRef` gate is critical. Without it, these two
  // effects would ping-pong:
  //   1. A user keystroke fires the debounced save.
  //   2. `updateSettings` normalizes + emits, which re-runs the
  //      `[settings]` sync effect below, which overwrites the draft
  //      with the normalized value, which re-fires the save effect.
  // By flipping the ref only on user-origin edits (via `patchDraft`)
  // and clearing it when the settings subscription seeds the draft
  // from external state, we ensure the save effect only runs when the
  // user — not the store — caused the latest draft change.
  const isUserEditRef = useRef(false);

  const patchDraft = useCallback((patch: Partial<typeof draft>) => {
    isUserEditRef.current = true;
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  // Seed the draft from the store whenever settings change from an
  // outside source (hydration on first mount, or a JSON import). We
  // gate on `isUserEditRef` so a just-committed auto-save doesn't loop
  // back and wipe the user's in-flight edits.
  //
  // This is the legitimate "sync external store → local draft" case
  // that effects exist for: `useAppSettings` hydrates from localStorage
  // after mount, so our initial `useState` fallback doesn't see the
  // persisted values. We intentionally suppress the cascading-render
  // lint — the ref guard makes it idempotent after the first hydration.
  useEffect(() => {
    if (isUserEditRef.current) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(buildDraft(settings));
  }, [settings]);

  // Debounced auto-save. Kicks in only when `isUserEditRef` is set,
  // which means the latest `draft` change came from a user interaction
  // in this panel — not from the sync effect above.
  useEffect(() => {
    if (!isUserEditRef.current) return;
    const timer = window.setTimeout(() => {
      updateSettings({
        version: SETTINGS_VERSION,
        theme: draft.theme,
        nodeSizeFactor: draft.nodeSizeFactor,
        edgeSizeFactor: draft.edgeSizeFactor,
        databaseUrl: draft.databaseUrl.trim(),
        jobsConfig: {
          enabled: draft.jobsEnabled,
          resumeURL: draft.resumeURL.trim(),
          locationKeywords: textToList(draft.locationKeywords),
          jobKeywords: textToList(draft.jobKeywords),
          skillsKeywords: textToList(draft.skillsKeywords),
          userLevelOfExpertise: draft.userLevelOfExpertise,
        },
        researchConfig: {
          primaryEntityOfInterest: textToList(draft.primaryEntityOfInterest),
          newsSource: textToList(draft.newsSource),
          newsRefreshPeriod: draft.newsRefreshPeriod.trim() || "0 * * * *",
        },
      });
      // Ref clears AFTER commit so the [settings] sync effect, which
      // will fire on the next emit from `updateSettings`, knows to
      // skip the reseed — our local draft already matches.
      isUserEditRef.current = false;
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft]);

  const handleExport = () => {
    const json = exportSettingsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sheaf-settings-${SETTINGS_VERSION}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setImportMsg({ kind: "ok", text: "Settings exported." });
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const result = importSettingsJson(text);
      if (result.ok) {
        setImportIssues(result.issues ?? null);
        if (result.issues) {
          const counts = [
            result.issues.missing.length && `${result.issues.missing.length} missing`,
            result.issues.unknown.length && `${result.issues.unknown.length} unknown`,
            result.issues.typeMismatch.length && `${result.issues.typeMismatch.length} type mismatch`,
          ]
            .filter(Boolean)
            .join(", ");
          setImportMsg({ kind: "ok", text: `Imported with warnings: ${counts}.` });
        } else {
          setImportMsg({ kind: "ok", text: "Settings imported." });
        }
        // Explicitly re-seed the draft from the freshly-imported
        // snapshot. The normal `[settings]` sync effect would also do
        // this, but only on the next render cycle — and only if the
        // user-edit ref isn't set. Clearing the ref and reseeding here
        // keeps the UI in immediate sync with the imported JSON.
        isUserEditRef.current = false;
        setDraft(buildDraft(getSettingsSnapshot()));
      } else {
        setImportIssues(null);
        setImportMsg({ kind: "err", text: result.error ?? "Import failed" });
      }
    } catch (error: unknown) {
      setImportIssues(null);
      setImportMsg({ kind: "err", text: error instanceof Error ? error.message : "Import failed" });
    }
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-md z-[100]">
      <div className="w-[760px] max-h-[90vh] bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 shadow-xl rounded-xl flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">Settings</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">JSON schema version {SETTINGS_VERSION}</p>
          </div>
          <button className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6 overflow-y-auto">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-3">Appearance</h3>
            <div className="flex bg-black/5 dark:bg-black/20 rounded-lg p-1 gap-1">
              <button className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm transition-all ${draft.theme === "light" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-300"}`} onClick={() => patchDraft({ theme: "light" })}>
                <Sun size={18} /> Light Mode
              </button>
              <button className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm transition-all ${draft.theme === "dark" ? "bg-slate-800 text-white shadow-[0_2px_4px_rgba(0,0,0,0.1)]" : "text-gray-500 hover:text-gray-700"}`} onClick={() => patchDraft({ theme: "dark" })}>
                <Moon size={18} /> Dark Mode
              </button>
            </div>
          </div>

          <hr className="border-t border-slate-200 dark:border-white/10" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-2">
                <Sparkles size={14} className="text-blue-500" /> Node Size Factor
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Choose which signal drives node radius in the graph.</p>
              <div className="grid grid-cols-2 gap-2">
                {NODE_SIZE_FACTORS.map((option) => (
                  <button key={option.value} type="button" title={option.hint} onClick={() => patchDraft({ nodeSizeFactor: option.value })} className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${draft.nodeSizeFactor === option.value ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300" : "border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-white/10"}`}>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-[0.7rem] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{option.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-2">
                <Sparkles size={14} className="text-violet-500" /> Edge Size Factor
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Relationship thickness is now part of the same local settings file.</p>
              <div className="grid grid-cols-1 gap-2">
                {EDGE_SIZE_FACTORS.map((option) => (
                  <button key={option.value} type="button" title={option.hint} onClick={() => patchDraft({ edgeSizeFactor: option.value })} className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${draft.edgeSizeFactor === option.value ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-white/10"}`}>
                    <div className="font-medium">{option.label}</div>
                    <div className="text-[0.7rem] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{option.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <hr className="border-t border-slate-200 dark:border-white/10" />

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
              <Database size={14} className="text-emerald-500" /> Database Connection
            </h3>
            <input
              type="password"
              placeholder="postgres://user:password@region.aws.neon.tech/neondb?sslmode=require"
              value={draft.databaseUrl}
              onChange={(e) => patchDraft({ databaseUrl: e.target.value })}
              className="w-full px-4 py-3 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white font-sans text-sm outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <hr className="border-t border-slate-200 dark:border-white/10" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
                <Briefcase size={14} className="text-amber-500" /> Jobs Config
              </h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input type="checkbox" checked={draft.jobsEnabled} onChange={(e) => patchDraft({ jobsEnabled: e.target.checked })} />
                  Enable jobs mode
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Resume URL</span>
                  <input type="url" value={draft.resumeURL} onChange={(e) => patchDraft({ resumeURL: e.target.value })} placeholder="https://resume.example.com" className={FORM_FIELD_CLASS} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Job Keywords</span>
                  <textarea value={draft.jobKeywords} onChange={(e) => patchDraft({ jobKeywords: e.target.value })} rows={3} placeholder="software engineer&#10;ai engineer&#10;data scientist" className={FORM_FIELD_CLASS} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Location Keywords</span>
                  <textarea value={draft.locationKeywords} onChange={(e) => patchDraft({ locationKeywords: e.target.value })} rows={3} placeholder="San Francisco&#10;San Jose&#10;Los Angeles" className={FORM_FIELD_CLASS} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Skills Keywords</span>
                  <textarea value={draft.skillsKeywords} onChange={(e) => patchDraft({ skillsKeywords: e.target.value })} rows={4} placeholder="Python&#10;PyTorch&#10;CUDA" className={FORM_FIELD_CLASS} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Level of Expertise</span>
                  <select value={draft.userLevelOfExpertise} onChange={(e) => patchDraft({ userLevelOfExpertise: e.target.value as UserLevelOfExpertise })} className={FORM_FIELD_CLASS}>
                    {EXPERTISE_LEVELS.map((level) => <option key={level} value={level} className={OPTION_CLASS}>{level}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-3 flex items-center gap-2">
                <Search size={14} className="text-cyan-500" /> Research Config
              </h3>
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Primary Entities of Interest</span>
                  <textarea value={draft.primaryEntityOfInterest} onChange={(e) => patchDraft({ primaryEntityOfInterest: e.target.value })} rows={8} className={FORM_FIELD_CLASS} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">News Sources</span>
                  <textarea value={draft.newsSource} onChange={(e) => patchDraft({ newsSource: e.target.value })} rows={3} placeholder="Leave empty to use default sources" className={FORM_FIELD_CLASS} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">News Refresh Period</span>
                  <input type="text" value={draft.newsRefreshPeriod} onChange={(e) => patchDraft({ newsRefreshPeriod: e.target.value })} placeholder="0 * * * *" className={FORM_FIELD_CLASS} />
                </label>
              </div>
            </div>
          </div>

          <hr className="border-t border-slate-200 dark:border-white/10" />

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-3">Backup & Restore</h3>
            <div className="flex gap-2">
              <button type="button" onClick={handleExport} className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/10 transition-colors">
                <Download size={14} /> Export JSON
              </button>
              <button type="button" onClick={() => importInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/10 transition-colors">
                <Upload size={14} /> Import JSON
              </button>
              <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFile(file);
                e.target.value = "";
              }} />
            </div>
            {importMsg && <p className={`mt-2 text-xs ${importMsg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>{importMsg.text}</p>}
            {importIssues && (
              <div className="mt-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                {importIssues.typeMismatch.length > 0 && (
                  <div>
                    <span className="font-semibold">Type mismatches:</span> {importIssues.typeMismatch.join(", ")}
                  </div>
                )}
                {importIssues.unknown.length > 0 && (
                  <div>
                    <span className="font-semibold">Unknown fields (ignored):</span> {importIssues.unknown.join(", ")}
                  </div>
                )}
                {importIssues.missing.length > 0 && (
                  <div>
                    <span className="font-semibold">Missing fields (defaulted):</span> {importIssues.missing.join(", ")}
                  </div>
                )}
              </div>
            )}
            {/* Tiny project link + star-if-you-like affordance. Keeps the
                footer unobtrusive but gives the single user (and anyone
                they hand a build to) a one-click path to the repo. */}
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <a
                href="https://github.com/Trance-0/Sheaf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                <GitHubMark size={12} />
                <span>Trance-0/Sheaf</span>
              </a>
              <a
                href="https://github.com/Trance-0/Sheaf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 hover:bg-amber-500/10 hover:border-amber-500/40 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
              >
                <Star size={12} />
                <span>Star if you like it</span>
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
