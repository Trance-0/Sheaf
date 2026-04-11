"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Database,
  Loader2,
  RefreshCw,
  Terminal,
  X,
  XCircle,
} from "lucide-react";
import {
  BACKEND_UPGRADE_EVENT,
  type BackendUpgradeInfo,
} from "@/lib/apiFetch";
import {
  buildDatabaseHeaders,
  hasDatabaseUrl,
  useAppSettings,
} from "@/lib/useAppSettings";
import type {
  MigrationReport,
  MigrationStepMeta,
  MigrationStepResult,
} from "@/lib/migrationTypes";

/**
 * v0.1.19 — introduced this modal as a global window-event listener
 * that surfaced the server's "backend is out of sync" hint as a code
 * block.
 *
 * v0.1.20 — upgraded into a full in-browser migration page. When the
 * server reports `reason: "schema-drift"`, the modal now fetches the
 * list of pending migration steps, presents them with an explicit
 * "I've backed up my database" acknowledgement (matching the CLI
 * driver's "type yes" prompt), runs the bundled migrations against
 * the user's database via POST /api/migrate, and renders a per-step
 * log + success/failure view inline. The user never has to clone the
 * repo or open a terminal.
 *
 * The `prisma-client-stale` reason still falls through to the
 * informational hint path — that class of error means the deployed
 * server's own generated client is broken, which no amount of
 * frontend button-clicking can repair. In a correctly-deployed
 * hosted Sheaf instance this reason should never fire; it's
 * effectively a dev-environment fallback.
 */
export default function BackendUpgradePrompt() {
  const { settings } = useAppSettings();
  const [info, setInfo] = useState<BackendUpgradeInfo | null>(null);

  // Migration state, only meaningful when `info.reason === "schema-drift"`.
  const [plan, setPlan] = useState<MigrationStepMeta[] | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [backupAcknowledged, setBackupAcknowledged] = useState(false);
  const [runState, setRunState] = useState<"idle" | "running" | "done">("idle");
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Listen for upgrade events. Latch on the first one so repeated
  // failing requests don't bounce a freshly-dismissed modal, and
  // don't reset an in-flight migration run with newer info.
  useEffect(() => {
    function handler(event: Event) {
      const detail = (event as CustomEvent<BackendUpgradeInfo>).detail;
      if (!detail) return;
      setInfo((prev) => prev ?? detail);
    }
    window.addEventListener(BACKEND_UPGRADE_EVENT, handler);
    return () => window.removeEventListener(BACKEND_UPGRADE_EVENT, handler);
  }, []);

  // When we enter schema-drift mode, fetch the migration plan (dry
  // run) so we can display "here's what will run" before the user
  // commits. This is a GET, no side effects, no header needed.
  useEffect(() => {
    if (info?.reason !== "schema-drift") return;
    if (plan !== null || planError !== null) return;
    let cancelled = false;
    fetch("/api/migrate")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `GET /api/migrate failed (${r.status})`);
        return data as { migrations: MigrationStepMeta[] };
      })
      .then((data) => {
        if (cancelled) return;
        setPlan(data.migrations);
      })
      .catch((err) => {
        if (cancelled) return;
        setPlanError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [info?.reason, plan, planError]);

  const dismiss = useCallback(() => {
    setInfo(null);
    setPlan(null);
    setPlanError(null);
    setBackupAcknowledged(false);
    setRunState("idle");
    setReport(null);
    setRunError(null);
  }, []);

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
      // Intentionally using raw fetch, not apiFetch: the /api/migrate
      // endpoint returns 200 even on per-step failures (the report
      // body conveys status), but any 5xx from the top-level catch
      // would otherwise re-dispatch the upgrade event and bounce us
      // into a nested prompt. This component owns error display for
      // migration runs, so the apiFetch detour is unwanted here.
      const res = await fetch("/api/migrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildDatabaseHeaders(settings),
        },
        body: JSON.stringify({ confirmed: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error ||
            `Migration failed with HTTP ${res.status}`,
        );
      }
      setReport(data as MigrationReport);
      setRunState("done");
    } catch (err) {
      setRunError(err instanceof Error ? err.message : String(err));
      setRunState("done");
    }
  }, [settings]);

  if (!info) return null;

  const isSchemaDrift = info.reason === "schema-drift";

  const titleForReason = isSchemaDrift
    ? "Database schema is behind"
    : info.reason === "prisma-client-stale"
      ? "Prisma client out of sync"
      : "Backend upgrade required";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
      <div className="glass-panel rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden border border-amber-500/30 shadow-2xl shadow-amber-500/10 flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-4 bg-amber-500/10 border-b border-amber-500/20 flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-300 flex-shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-amber-700 dark:text-amber-200 leading-tight">
              {titleForReason}
            </h2>
            <p className="text-xs text-amber-700/80 dark:text-amber-200/70 mt-0.5">
              {isSchemaDrift
                ? "Your database is missing columns or tables that the current Sheaf build expects. Run the bundled upgrade below to bring it up to date."
                : "Sheaf can't talk to the database until the deployed backend is repaired."}
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

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {isSchemaDrift ? (
            <SchemaDriftBody
              info={info}
              plan={plan}
              planError={planError}
              backupAcknowledged={backupAcknowledged}
              setBackupAcknowledged={setBackupAcknowledged}
              runState={runState}
              report={report}
              runError={runError}
              hasDbUrl={hasDatabaseUrl(settings)}
            />
          ) : (
            <PrismaClientStaleBody info={info} />
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2 bg-white/40 dark:bg-black/20 flex-shrink-0">
          {isSchemaDrift ? (
            runState === "done" && report?.status === "success" ? (
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
                    runState === "running" ||
                    plan === null
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
            )
          ) : (
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
                onClick={() => {
                  if (typeof window !== "undefined") window.location.reload();
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm shadow-amber-500/30"
              >
                <RefreshCw size={14} /> Reload after fix
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Schema-drift body: three phases stacked vertically, each rendered
 * conditionally based on `runState` and the migration `report`.
 *
 *   1. Plan preview (always) — shows the list of steps that will run.
 *   2. Backup acknowledgement (only before `runState === "done"`).
 *   3. Report (only when `runState === "done"`, showing per-step
 *      logs + success/failure badges + any top-level error).
 */
function SchemaDriftBody({
  info,
  plan,
  planError,
  backupAcknowledged,
  setBackupAcknowledged,
  runState,
  report,
  runError,
  hasDbUrl,
}: {
  info: BackendUpgradeInfo;
  plan: MigrationStepMeta[] | null;
  planError: string | null;
  backupAcknowledged: boolean;
  setBackupAcknowledged: (value: boolean) => void;
  runState: "idle" | "running" | "done";
  report: MigrationReport | null;
  runError: string | null;
  hasDbUrl: boolean;
}) {
  return (
    <>
      {/* Plan preview */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
          Steps that will run
        </h3>
        {planError ? (
          <p className="text-xs text-red-500 dark:text-red-400">
            Failed to load migration list: {planError}
          </p>
        ) : plan === null ? (
          <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" /> Loading migration list...
          </p>
        ) : plan.length === 0 ? (
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

      {/* Report (only after the migration has finished). */}
      {runState === "done" && (report || runError) && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
            Migration report
          </h3>
          {report ? (
            <MigrationReportView report={report} />
          ) : null}
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

      {/* Backup acknowledgement — hidden once the migration is done. */}
      {runState !== "done" && (
        <section className="space-y-3">
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
            <div className="font-semibold mb-1">Before you continue</div>
            <p>
              Please back up your database first. Every step below is
              idempotent (safe to re-run), but a snapshot gives you a
              rollback point if something unexpected happens.
            </p>
            <ul className="mt-1.5 ml-4 list-disc space-y-0.5">
              <li><strong>Neon:</strong> create a branch from the current state.</li>
              <li><strong>Self-hosted Postgres:</strong> <code>pg_dump</code> to a safe location.</li>
              <li><strong>Other:</strong> whatever your normal snapshot process is.</li>
            </ul>
          </div>
          <label className="flex items-start gap-2.5 text-xs text-gray-700 dark:text-gray-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={backupAcknowledged}
              onChange={(e) => setBackupAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer"
            />
            <span className="leading-snug">
              I have backed up my database and understand that this
              migration runs against the URL currently configured in
              Settings.
            </span>
          </label>
          {!hasDbUrl && (
            <p className="text-xs text-red-500 dark:text-red-400">
              No database URL is configured. Open Settings and add one
              before running the migration.
            </p>
          )}
        </section>
      )}

      {/* Original server-side hint, collapsed into a details block so
          the raw error is still available without cluttering the main
          flow. */}
      <details className="text-xs text-gray-500 dark:text-gray-400">
        <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none">
          Show raw error from server
        </summary>
        <pre className="mt-2 p-3 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[0.7rem] whitespace-pre-wrap break-all text-gray-600 dark:text-gray-300 max-h-32 overflow-auto">
          {info.error}
        </pre>
      </details>
    </>
  );
}

/**
 * Rendered when the migration has finished. Shows the overall
 * summary + per-step badge + collapsible log output for each step.
 */
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

/**
 * Fallback for the prisma-client-stale case. This class of failure
 * means the deployed server's generated Prisma client on disk is
 * broken, not that the database is behind — so there's nothing the
 * browser can do to fix it. We show the command for the local-dev
 * case and tell hosted users to contact the maintainer.
 */
function PrismaClientStaleBody({ info }: { info: BackendUpgradeInfo }) {
  return (
    <>
      <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
        The deployed Sheaf server&apos;s generated Prisma client is out
        of sync with its own schema. This is a <strong>server-side
        deploy issue</strong>, not a database issue — running
        migrations from this page won&apos;t help, because the server
        can&apos;t issue database queries at all right now.
      </p>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
          If this is a local dev environment
        </div>
        <div className="rounded-lg bg-slate-900 text-slate-100 border border-slate-700/50 px-4 py-3 font-mono text-xs leading-relaxed flex items-start gap-2">
          <Terminal size={14} className="mt-0.5 text-emerald-400 flex-shrink-0" />
          <span className="break-all whitespace-pre-wrap">{info.hint}</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
        If this is a hosted instance, the build step should run
        <code className="mx-1 px-1 py-0.5 rounded bg-slate-200/60 dark:bg-white/10">prisma generate</code>
        automatically. Seeing this error on a deploy means the build
        didn&apos;t produce a fresh client — contact the maintainer.
      </p>
      <details className="text-xs text-gray-500 dark:text-gray-400">
        <summary className="cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none">
          Show raw error
        </summary>
        <pre className="mt-2 p-3 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[0.7rem] whitespace-pre-wrap break-all text-gray-600 dark:text-gray-300 max-h-40 overflow-auto">
          {info.error}
        </pre>
      </details>
    </>
  );
}
