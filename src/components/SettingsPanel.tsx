"use client";

import { useState, useEffect } from "react";
import { X, Save, Moon, Sun } from "lucide-react";

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [dbUrl, setDbUrl] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [status, setStatus] = useState("");

  useEffect(() => {
    // Check current theme
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
    <div className="settings-overlay">
      <div className="settings-modal">
        <div className="settings-header">
          <h2 className="panel-title">Settings</h2>
          <button className="btn-icon" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="settings-content">
          {/* Theme Toggle Section */}
          <div className="settings-block">
            <h3 className="section-title">Appearance</h3>
            <div className="theme-toggle-container">
              <button 
                className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
                onClick={() => theme === 'dark' && toggleTheme()}
              >
                <Sun size={18} /> Light Mode
              </button>
              <button 
                className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => theme === 'light' && toggleTheme()}
              >
                <Moon size={18} /> Dark Mode
              </button>
            </div>
          </div>

          <hr className="settings-divider" />

          {/* Database Setup Section */}
          <div className="settings-block">
            <h3 className="section-title">Database Integration</h3>
            <p className="expandable-text" style={{marginBottom: "12px"}}>
              Provide your Neon Postgres connection string. Warning: updating this will rewrite your local <code>.env</code> file.
            </p>
            <input 
              type="password"
              placeholder="postgresql://user:password@endpoint..."
              value={dbUrl}
              onChange={(e) => setDbUrl(e.target.value)}
              className="settings-input"
            />
            {status && <p className="settings-status">{status}</p>}
          </div>
        </div>

        <div className="settings-footer">
          <button className="settings-save-btn" onClick={saveSettings} disabled={!dbUrl && !status}>
            <Save size={16} /> Save Configurations
          </button>
        </div>
      </div>
    </div>
  );
}
