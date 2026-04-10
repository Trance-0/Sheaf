"use client";

import { useState, useEffect } from "react";
import { X, Save, Moon, Sun } from "lucide-react";

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [dbUrl, setDbUrl] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (document.body.classList.contains("light-theme")) {
      setTheme("light");
    } else {
      setTheme("dark");
    }
  }, []);

  const toggleTheme = () => {
    if (theme === "dark") {
      document.body.classList.add("light-theme");
      setTheme("light");
    } else {
      document.body.classList.remove("light-theme");
      setTheme("dark");
    }
  };

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
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-md z-[100]">
      <div className="w-[480px] bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 shadow-xl rounded-xl flex flex-col overflow-hidden">
        
        <div className="px-6 py-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <h2 className="text-xl font-semibold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 bg-clip-text text-transparent">Settings</h2>
          <button className="p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-black/5 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {/* Theme Toggle Section */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-3">Appearance</h3>
            <div className="flex bg-black/5 dark:bg-black/20 rounded-lg p-1 gap-1">
              <button 
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm transition-all
                  ${theme === 'light' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                onClick={() => theme === 'dark' && toggleTheme()}
              >
                <Sun size={18} /> Light Mode
              </button>
              <button 
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm transition-all
                  ${theme === 'dark' ? 'bg-slate-800 text-white shadow-[0_2px_4px_rgba(0,0,0,0.1)]' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => theme === 'light' && toggleTheme()}
              >
                <Moon size={18} /> Dark Mode
              </button>
            </div>
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

        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end">
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
