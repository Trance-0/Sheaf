"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Database,
  Download,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import {
  BACKEND_UPGRADE_EVENT,
  type BackendUpgradeInfo,
} from "@/lib/apiFetch";
import { hasDatabaseUrl, useAppSettings } from "@/lib/useAppSettings";
import type {
  MigrationReport,
  MigrationStepMeta,
  MigrationStepResult,
} from "@/lib/migrationTypes";
import {
  listBrowserMigrations,
  runBrowserMigrations,
} from "@/lib/client/migrations";
import {
  captureBackup,
  downloadBackup,
  totalRowCount,
} from "@/lib/client/backup";

/**
 * v0.1.21 — migrations + backup now run entirely in the browser via the
 * Neon HTTP driver. The server is never involved, so a broken Vercel
 * deploy (stale Prisma client) no longer blocks schema recovery. The
 * previous `schema-drift` / `prisma-client-stale` branches have been
 * collapsed into a single `drift` flow: either way the user can take
 * the same two actions against their own database — download a
 * data-only JSON snapshot, then run the idempotent migration.
 */
export default function BackendUpgradePrompt() {
  const { settings } = useAppSettings();
  const [info, setInfo] = useState<BackendUpgradeInfo | null>(null);
  const [plan] = useState<MigrationStepMeta[]>(() => listBrowserMigrations());
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [runState, setRunState] = useState<"idle" | "running" | "done">("idle");
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [backupState, setBackupState] = useState<"idle" | "running" | "done">(
    "idle",
  );
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupRowCount, setBackupRowCount] = useState<number | null>(null);

  // Latch on the first upgrade event so repeated failing requests don't
  // bounce a freshly-dismissed modal, and don't reset in-flight runs.
  useEffect(() => {
    function handler(event: Event) {
      const detail = (event as CustomEvent<BackendUpgradeInfo>).detail;
      if (!detail) return;
      setInfo((prev) => prev ?? detail);
    }
    window.addEventListener(BACKEND_UPGRADE_EVENT, handler);
    return () => window.removeEventListener(BACKEND_UPGRADE_EVENT, handler);
  }, []);

  const dismiss = useCallback(() => {
    setInfo(null);
    setBackupAcknowledged(false);
    setRunState("idle");
    setReport(null);
    setRunError(null);
    setBackupState("idle");
    setBackupError(null);
    setBackupRowCount(null);
  }, []);

  const downloadSnapshot = useCallback(async () => {
    if (!hasDatabaseUrl(settings)) {
      setBackupError(
        "No database URL configured. Add one in Settings before downloading a backup.",
      );
      return;
    }
    setBackupState("running");
    setBackupError(null);
    try {
      const backup = await captureBackup(settings.databaseUrl, settings.version);
      setBackupRowCount(totalRowCount(backup));
      downloadBackup(backup);
      setBackupState("done");
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : String(err));
      setBackupState("idle");
    }
  }, [settings]);

  const runMigration = useCallback(async () => {
    if (!hasDatabaseUrl(settings)) {
      setRunError(
        "No database URL configured. Add one in Settings before running the migration.",
      );
      return;
    }
    setRunState("running");
    setRunError(null);
    setReport(null);
    try {
      const result = await runBrowserMigrations(settings.databaseUrl);
      setReport(result);
      setRunState("done");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      setRunState("done");
    }
  }, [settings]);

  if (!info) return null;

  const title =
    info.reason === "prisma-client-stale"
      ? "Backend build out of sync"
      : "Database schema needs upgrade";
  const subtitle =
    info.reason === "prisma-client-stale"
      ? "The deployed server couldn't load its database client. You can still upgrade your database schema directly from here — the migration runs in this browser."
      : "Your database is missing columns or tables that the current Sheaf build expects. Run the bundled upgrade below to bring it up to date.";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
      <div className="glass-panel rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-amber-500/30 shadow-2xl shadow-amber-500/10 flex flex-col">
        <div className="flex items-start gap-3 px-6 py-4 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-300 flex-shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-amber-700 dark:text-amber-200 leading-tight">
              {title}
            </h2>
            <p className="text-xs text-amber-700/80 dark:text-amber-200/70 mt-0.5">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-amber-600/70 dark:text-amber-300/70 hover:bg-amber-500/15 hover:text-amber-700 dark:hover:text-amber-200 transition-colors"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <PlanPreview plan={plan} />

          <BackupSection
            state={backupState}
            error={backupError}
            rowCount={backupRowCount}
            onDownload={downloadSnapshot}
            disabled={!hasDatabaseUrl(settings) || runState === "running"}
          />

          {runState === "done" && (report || runError) && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Migration report
              </h3>
              {report ? <MigrationReportView report={report} /> : null}
              {runError && (
                <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-700 dark:text-red-300">
                  <div className="font-semibold mb-1 flex items-center gap-1.5">
                    <XCircle size={12} /> Request failed
                  </div>
                  <pre className="whitespace-pre-wrap break-all font-mono text-[0.7rem]">
                    {runError}
                  </pre>
                </div>
              )}
            </section>
          )}

          {runState !== "done" && (
            <section className="space-y-3">
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                <div className="font-semibold mb-1">Before you continue</div>
                <p>
                  A data snapshot above is convenient, but only a Neon branch
                  preserves schema, indexes, and constraints. For important
                  data, create a branch in the Neon dashboard first.
                </p>
              </div>
              <label className="flex items-start gap-2.5 text-xs text-gray-700 dark:text-gray-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={backupAcknowledged}
                  onChange={(e) => setBackupAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer"
                />
                <span className="leading-snug">
                  I have backed up my database and understand this migration
                  runs against the URL currently configured in Settings.
                </span>
              </label>
              {!hasDatabaseUrl(settings) && (
                <p className="text-xs text-red-500 dark:text-red-400">
                  No database URL is configured. Open Settings and add one
                  before running the migration.
                </p>
              )}
            </section>
          )}

          <details className="text-xs text-gray-500 dark:text-gray-400">
            <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none">
              Show raw error
            </summary>
            <pre className="mt-2 p-3 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[0.7rem] whitespace-pre-wrap break-all text-gray-600 dark:text-gray-300 max-h-32 overflow-auto">
              {info.error}
            </pre>
          </details>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2 bg-white/40 dark:bg-black/20 flex-shrink-0">
          {runState === "done" && report?.status === "success" ? (
            <>
              <button
                type="button"
                onClick={dismiss}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-slate-200/60 dark:hover:bg-white/5 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") window.location.reload();
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors shadow-sm shadow-emerald-500/30"
              >
                <RefreshCw size={14} /> Reload Sheaf
              </button>
            </>
          ) : runState === "done" && report?.status === "failed" ? (
            <>
              <button
                type="button"
                onClick={dismiss}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-slate-200/60 dark:hover:bg-white/5 transition-colors"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={runMigration}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm shadow-amber-500/30"
              >
                <RefreshCw size={14} /> Retry
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={dismiss}
                disabled={runState === "running"}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-slate-200/60 dark:hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={runMigration}
                disabled={
                  !backupAcknowledged ||
                  !hasDatabaseUrl(settings) ||
                  runState === "running"
                }
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm shadow-amber-500/30 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {runState === "running" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Running migration...
                  </>
                ) : (
                  <>
                    <Database size={14} /> Run Migration
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanPreview({ plan }: { plan: MigrationStepMeta[] }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        Steps that will run
      </h3>
      {plan.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No migrations registered. This should not happen — contact the maintainer.
        </p>
      ) : (
        <ol className="space-y-2">
          {plan.map((step, idx) => (
            <li
              key={step.id}
              className="flex gap-3 p-3 rounded-lg bg-white/60 dark:bg-white/5 border border-slate-200 dark:border-white/10"
            >
              <div className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-300 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-blue-600 dark:text-blue-300">
                  {step.id}
                </div>
                <div className="text-xs text-gray-700 dark:text-gray-200 mt-0.5 leading-snug">
                  {step.description}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function BackupSection({
  state,
  error,
  rowCount,
  onDownload,
  disabled,
}: {
  state: "idle" | "running" | "done";
  error: string | null;
  rowCount: number | null;
  onDownload: () => void;
  disabled: boolean;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        Download data backup
      </h3>
      <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3 space-y-2">
        <p className="text-xs text-gray-700 dark:text-gray-200 leading-relaxed">
          Pulls every row from every table via Neon HTTP and saves a JSON
          file. Schema, indexes, and constraints are <strong>not</strong>{" "}
          included — create a Neon branch for a full structural backup.
        </p>
        <button
          type="button"
          onClick={onDownload}
          disabled={disabled || state === "running"}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-500/15 border border-blue-500/40 text-blue-700 dark:text-blue-200 hover:bg-blue-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state === "running" ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Dumping tables...
            </>
          ) : (
            <>
              <Download size={12} /> Download JSON snapshot
            </>
          )}
        </button>
        {state === "done" && rowCount !== null && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 size={12} /> Saved {rowCount.toLocaleString()} rows to your Downloads folder.
          </p>
        )}
        {error && (
          <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
        )}
      </div>
    </section>
  );
}

function MigrationReportView({ report }: { report: MigrationReport }) {
  const totalSeconds = (report.durationMs / 1000).toFixed(2);
  return (
    <div className="space-y-2">
      <div
        className={`p-3 rounded-lg border flex items-center gap-2 text-sm ${
          report.status === "success"
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
            : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
        }`}
      >
        {report.status === "success" ? (
          <CheckCircle2 size={16} />
        ) : (
          <XCircle size={16} />
        )}
        <span className="font-semibold">
          {report.status === "success"
            ? `All ${report.ranCount} of ${report.totalCount} steps completed in ${totalSeconds}s.`
            : `Migration aborted after ${report.ranCount} of ${report.totalCount} steps (${totalSeconds}s).`}
        </span>
      </div>
      <div className="space-y-2">
        {report.steps.map((step) => (
          <MigrationStepReport key={step.id} step={step} />
        ))}
      </div>
    </div>
  );
}

function MigrationStepReport({ step }: { step: MigrationStepResult }) {
  const [expanded, setExpanded] = useState(step.status === "failed");
  const stepSeconds = (step.durationMs / 1000).toFixed(2);
  return (
    <div
      className={`rounded-lg border overflow-hidden ${
        step.status === "success"
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-red-500/30 bg-red-500/5"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/30 dark:hover:bg-white/5 transition-colors"
      >
        <ChevronRight
          size={12}
          className={`text-gray-500 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        {step.status === "success" ? (
          <CheckCircle2 size={12} className="text-emerald-500" />
        ) : (
          <XCircle size={12} className="text-red-500" />
        )}
        <span className="font-mono font-semibold text-blue-600 dark:text-blue-300 flex-1">
          {step.id}
        </span>
        <span className="text-[0.65rem] text-gray-500 dark:text-gray-400">
          {stepSeconds}s
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[0.7rem] text-gray-600 dark:text-gray-300 leading-snug">
            {step.description}
          </p>
          {step.logs.length > 0 && (
            <pre className="p-2 rounded bg-slate-900 text-slate-100 border border-slate-700/50 text-[0.7rem] font-mono leading-relaxed whitespace-pre-wrap break-all max-h-48 overflow-auto">
              {step.logs.join("\n")}
            </pre>
          )}
          {step.error && (
            <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-[0.7rem] text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap break-all">
              {step.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
