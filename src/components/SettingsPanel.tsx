"use client";

import { useEffect, useRef, useState } from "react";
import { X, Save, Moon, Sun, Download, Upload, Sparkles, Database, Briefcase, Search } from "lucide-react";
import {
  SETTINGS_VERSION,
  useAppSettings,
  updateSettings,
  exportSettingsJson,
  importSettingsJson,
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
  const [status, setStatus] = useState<string>("");
  const [importMsg, setImportMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [importIssues, setImportIssues] = useState<SettingsIssues | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(buildDraft(settings));
  }, [settings]);

  const saveSettings = () => {
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
    setStatus("Saved locally. The app now uses this JSON-backed config directly; no server-side .env write is needed.");
  };

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
        setStatus("Imported settings are active locally.");
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
              <button className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm transition-all ${draft.theme === "light" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-300"}`} onClick={() => setDraft((prev) => ({ ...prev, theme: "light" }))}>
                <Sun size={18} /> Light Mode
              </button>
              <button className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm transition-all ${draft.theme === "dark" ? "bg-slate-800 text-white shadow-[0_2px_4px_rgba(0,0,0,0.1)]" : "text-gray-500 hover:text-gray-700"}`} onClick={() => setDraft((prev) => ({ ...prev, theme: "dark" }))}>
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
                  <button key={option.value} type="button" title={option.hint} onClick={() => setDraft((prev) => ({ ...prev, nodeSizeFactor: option.value }))} className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${draft.nodeSizeFactor === option.value ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300" : "border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-white/10"}`}>
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
                  <button key={option.value} type="button" title={option.hint} onClick={() => setDraft((prev) => ({ ...prev, edgeSizeFactor: option.value }))} className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${draft.edgeSizeFactor === option.value ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-white/10"}`}>
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
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 mb-3">
              Sheaf no longer rewrites <code>.env</code> through the backend. The database URL lives in your local settings JSON and is sent with each request.
            </p>
            <input
              type="password"
              placeholder="postgres://user:password@region.aws.neon.tech/neondb?sslmode=require"
              value={draft.databaseUrl}
              onChange={(e) => setDraft((prev) => ({ ...prev, databaseUrl: e.target.value }))}
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
                  <input type="checkbox" checked={draft.jobsEnabled} onChange={(e) => setDraft((prev) => ({ ...prev, jobsEnabled: e.target.checked }))} />
                  Enable jobs mode
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Resume URL</span>
                  <input type="url" value={draft.resumeURL} onChange={(e) => setDraft((prev) => ({ ...prev, resumeURL: e.target.value }))} placeholder="https://resume.example.com" className="mt-1 w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Job Keywords</span>
                  <textarea value={draft.jobKeywords} onChange={(e) => setDraft((prev) => ({ ...prev, jobKeywords: e.target.value }))} rows={3} placeholder="software engineer&#10;ai engineer&#10;data scientist" className="mt-1 w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Location Keywords</span>
                  <textarea value={draft.locationKeywords} onChange={(e) => setDraft((prev) => ({ ...prev, locationKeywords: e.target.value }))} rows={3} placeholder="San Francisco&#10;San Jose&#10;Los Angeles" className="mt-1 w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Skills Keywords</span>
                  <textarea value={draft.skillsKeywords} onChange={(e) => setDraft((prev) => ({ ...prev, skillsKeywords: e.target.value }))} rows={4} placeholder="Python&#10;PyTorch&#10;CUDA" className="mt-1 w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Level of Expertise</span>
                  <select value={draft.userLevelOfExpertise} onChange={(e) => setDraft((prev) => ({ ...prev, userLevelOfExpertise: e.target.value as UserLevelOfExpertise }))} className="mt-1 w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm">
                    {EXPERTISE_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
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
                  <textarea value={draft.primaryEntityOfInterest} onChange={(e) => setDraft((prev) => ({ ...prev, primaryEntityOfInterest: e.target.value }))} rows={8} className="mt-1 w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">News Sources</span>
                  <textarea value={draft.newsSource} onChange={(e) => setDraft((prev) => ({ ...prev, newsSource: e.target.value }))} rows={3} placeholder="Leave empty to use default sources" className="mt-1 w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">News Refresh Period</span>
                  <input type="text" value={draft.newsRefreshPeriod} onChange={(e) => setDraft((prev) => ({ ...prev, newsRefreshPeriod: e.target.value }))} placeholder="0 * * * *" className="mt-1 w-full px-3 py-2 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm" />
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
          </div>

          {status && <p className="text-sm text-emerald-600 dark:text-emerald-400">{status}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end flex-shrink-0">
          <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity" onClick={saveSettings}>
            <Save size={16} /> Save Local Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
