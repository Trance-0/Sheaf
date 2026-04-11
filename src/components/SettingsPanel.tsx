"use client";

import { useRef, useState } from "react";
import { X, Save, Moon, Sun, Download, Upload, Sparkles } from "lucide-react";
import { useAppSettings, updateSettings, exportSettingsJson, importSettingsJson, type NodeSizeFactor } from "@/lib/useAppSettings";

const SIZE_FACTORS: { value: NodeSizeFactor; label: string; hint: string }[] = [
  { value: "event_count", label: "Event Count", hint: "Size nodes by how often they appear in recent events (default)" },
  { value: "market_cap", label: "Market Cap", hint: "Log-scaled market capitalization (falls back to event count if unknown)" },
  { value: "employee_count", label: "Employee Count", hint: "Log-scaled headcount" },
  { value: "free_cash_flow", label: "Free Cash Flow", hint: "Log-scaled FCF" },
];

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings } = useAppSettings();
  const [dbUrl, setDbUrl] = useState("");
  const [status, setStatus] = useState("");
  const [importMsg, setImportMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const setTheme = (theme: "dark" | "light") => updateSettings({ theme });
  const setSizeFactor = (nodeSizeFactor: NodeSizeFactor) => updateSettings({ nodeSizeFactor });

  const saveSettings = async () => {
    setStatus("Saving...");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dbUrl })
      });
      if (!res.ok) throw new Error("Failed to save DB URL");
      setStatus("Successfully saved! Restart your terminal server for Prisma to connect.");
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Settings JSON export → drop a file download in the browser. We build the
  // Blob in-memory so there's no server round-trip and no file written to
  // disk beyond whatever the user picks at the save dialog.
  const handleExport = () => {
    const json = exportSettingsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sheaf-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setImportMsg({ kind: "ok", text: "Settings exported." });
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const result = importSettingsJson(text);
      if (result.ok) {
        setImportMsg({ kind: "ok", text: "Settings imported." });
      } else {
        setImportMsg({ kind: "err", text: result.error });
      }
    } catch (e: unknown) {
      setImportMsg({ kind: "err", text: e instanceof Error ? e.message : "Import failed" });
    }
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-md z-[100]">
      <div className="w-[520px] max-h-[90vh] bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 shadow-xl rounded-xl flex flex-col overflow-hidden">

        <div className="px-6 py-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-semibold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">Settings</h2>
          <button className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6 overflow-y-auto">
          {/* Theme Toggle Section */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-3">Appearance</h3>
            <div className="flex bg-black/5 dark:bg-black/20 rounded-lg p-1 gap-1">
              <button
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm transition-all
                  ${settings.theme === 'light' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                onClick={() => setTheme("light")}
              >
                <Sun size={18} /> Light Mode
              </button>
              <button
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm transition-all
                  ${settings.theme === 'dark' ? 'bg-slate-800 text-white shadow-[0_2px_4px_rgba(0,0,0,0.1)]' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setTheme("dark")}
              >
                <Moon size={18} /> Dark Mode
              </button>
            </div>
          </div>

          <hr className="border-t border-slate-200 dark:border-white/10" />

          {/* Node size factor */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-2">
              <Sparkles size={14} className="text-blue-500" /> Node Size Factor
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Choose which signal drives node radius in the graph. Missing values fall back to event count.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SIZE_FACTORS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.hint}
                  onClick={() => setSizeFactor(opt.value)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors
                    ${settings.nodeSizeFactor === opt.value
                      ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                      : "border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-white/10"}`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[0.7rem] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{opt.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <hr className="border-t border-slate-200 dark:border-white/10" />

          {/* Import / Export settings */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-3">Backup & Restore</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/10 transition-colors"
              >
                <Download size={14} /> Export JSON
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-white/10 transition-colors"
              >
                <Upload size={14} /> Import JSON
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportFile(f);
                  // Reset so the same file can be re-selected later.
                  e.target.value = "";
                }}
              />
            </div>
            {importMsg && (
              <p className={`mt-2 text-xs ${importMsg.kind === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                {importMsg.text}
              </p>
            )}
          </div>

          <hr className="border-t border-slate-200 dark:border-white/10" />

          {/* Database Setup Section */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-3">Database Integration</h3>
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300 mb-3">
              Provide your Neon Postgres connection string. Warning: updating this will rewrite your local <code>.env</code> file.
            </p>
            <input
              type="password"
              placeholder="postgresql://user:password@endpoint..."
              value={dbUrl}
              onChange={(e) => setDbUrl(e.target.value)}
              className="w-full px-4 py-3 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white font-sans text-sm outline-none focus:border-blue-500 transition-colors"
            />
            {status && <p className="mt-2.5 text-sm text-emerald-600 dark:text-emerald-400">{status}</p>}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end flex-shrink-0">
          <button
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            onClick={saveSettings}
            disabled={!dbUrl && !status}
          >
            <Save size={16} /> Save Configurations
          </button>
        </div>

      </div>
    </div>
  );
}
