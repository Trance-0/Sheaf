"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Terminal, X } from "lucide-react";
import {
  BACKEND_UPGRADE_EVENT,
  type BackendUpgradeInfo,
} from "@/lib/apiFetch";

/**
 * v0.1.19 — global modal that surfaces "your backend is out of sync"
 * failures from any API call on the page.
 *
 * Listens for the custom event that `apiFetch` dispatches when a Next.js
 * API route returns a 503 with `code: "BACKEND_UPGRADE_REQUIRED"`. This
 * keeps the detection logic centralized (apiFetch) and the UX
 * centralized (this component), so every fetch call site gets the
 * same treatment without boilerplate.
 *
 * The modal is intentionally amber (warning, not error-red) because
 * the underlying database and user data are fine — the dev server just
 * needs a kick. "Reload" triggers a full window reload, which is what
 * the user will want after they've run `prisma generate` or the
 * auto-migration script in another terminal.
 *
 * State-wise this component manages itself: mounts globally in
 * `page.tsx`, has no props, and opens/closes via the window event. It
 * latches on the first upgrade event so repeated failing requests
 * don't bounce the modal — the user only needs to see the instructions
 * once.
 */
export default function BackendUpgradePrompt() {
  const [info, setInfo] = useState<BackendUpgradeInfo | null>(null);

  useEffect(() => {
    function handler(event: Event) {
      const detail = (event as CustomEvent<BackendUpgradeInfo>).detail;
      if (!detail) return;
      // Only latch on the first occurrence so a flurry of failing
      // requests doesn't rapidly re-open a freshly-dismissed prompt.
      setInfo((prev) => prev ?? detail);
    }
    window.addEventListener(BACKEND_UPGRADE_EVENT, handler);
    return () => window.removeEventListener(BACKEND_UPGRADE_EVENT, handler);
  }, []);

  if (!info) return null;

  const titleForReason =
    info.reason === "prisma-client-stale"
      ? "Prisma client out of sync"
      : info.reason === "schema-drift"
        ? "Database schema is behind"
        : "Backend upgrade required";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="glass-panel rounded-2xl max-w-lg w-full overflow-hidden border border-amber-500/30 shadow-2xl shadow-amber-500/10">
        <div className="flex items-start gap-3 px-6 py-4 bg-amber-500/10 border-b border-amber-500/20">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-300 flex-shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-amber-700 dark:text-amber-200 leading-tight">
              {titleForReason}
            </h2>
            <p className="text-xs text-amber-700/80 dark:text-amber-200/70 mt-0.5">
              Sheaf can&apos;t talk to the database until you upgrade the backend.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInfo(null)}
            className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-amber-600/70 dark:text-amber-300/70 hover:bg-amber-500/15 hover:text-amber-700 dark:hover:text-amber-200 transition-colors"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
            Run the following command in a terminal at your project root, then
            come back and press <strong>Reload</strong>.
          </p>

          <div className="rounded-lg bg-slate-900 text-slate-100 border border-slate-700/50 px-4 py-3 font-mono text-xs leading-relaxed flex items-start gap-2">
            <Terminal size={14} className="mt-0.5 text-emerald-400 flex-shrink-0" />
            <span className="break-all whitespace-pre-wrap">{info.hint}</span>
          </div>

          <details className="text-xs text-gray-500 dark:text-gray-400">
            <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none">
              Show raw error
            </summary>
            <pre className="mt-2 p-3 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[0.7rem] whitespace-pre-wrap break-all text-gray-600 dark:text-gray-300 max-h-40 overflow-auto">
              {info.error}
            </pre>
          </details>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2 bg-white/40 dark:bg-black/20">
          <button
            type="button"
            onClick={() => setInfo(null)}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-slate-200/60 dark:hover:bg-white/5 transition-colors"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm shadow-amber-500/30"
          >
            <RefreshCw size={14} /> Reload after fix
          </button>
        </div>
      </div>
    </div>
  );
}
