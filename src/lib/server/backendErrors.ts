import { NextResponse } from "next/server";

/**
 * v0.1.19 — shared detector for "backend is out of sync" errors.
 *
 * Catches two classes of failure and converts them into a structured
 * 503 response the frontend knows how to turn into the upgrade prompt:
 *
 *   1. Stale generated Prisma client. Happens when the schema changed
 *      on disk but `prisma generate` was never re-run (or the dev
 *      server is still holding the previous query-engine DLL in memory
 *      from before a regenerate). Prisma surfaces this as
 *      `@prisma/client did not initialize yet...`.
 *
 *   2. Schema drift between the generated client and the live
 *      database. Happens when Prisma was regenerated against a schema
 *      that has new columns / tables that haven't been applied to the
 *      database yet. Postgres surfaces this as `column "foo" does not
 *      exist` / `relation "Bar" does not exist`, which Prisma wraps as
 *      P2021 (table missing) or P2022 (column missing).
 *
 * We intentionally match on both raw Postgres messages AND Prisma error
 * codes because Prisma doesn't always wrap raw-SQL paths in the typed
 * error classes — `$executeRawUnsafe` paths pass through the underlying
 * pg error verbatim.
 */

const UPGRADE_SIGNALS: { pattern: RegExp; reason: BackendUpgradeReason }[] = [
  { pattern: /did not initialize yet/i, reason: "prisma-client-stale" },
  { pattern: /prisma.*generate/i, reason: "prisma-client-stale" },
  { pattern: /does not exist in the current database/i, reason: "schema-drift" },
  { pattern: /column .* does not exist/i, reason: "schema-drift" },
  { pattern: /relation .* does not exist/i, reason: "schema-drift" },
  { pattern: /\bP2021\b/, reason: "schema-drift" },
  { pattern: /\bP2022\b/, reason: "schema-drift" },
];

export type BackendUpgradeReason = "prisma-client-stale" | "schema-drift";

/**
 * Inspect an arbitrary error and, if it matches one of the known
 * upgrade-required patterns, return the reason tag. Otherwise null.
 * Exported so tests / other routes can use the same matcher without
 * going through NextResponse.
 */
export function isBackendUpgradeError(err: unknown): BackendUpgradeReason | null {
  const message = err instanceof Error ? err.message : String(err);
  for (const { pattern, reason } of UPGRADE_SIGNALS) {
    if (pattern.test(message)) return reason;
  }
  return null;
}

function hintFor(reason: BackendUpgradeReason): string {
  switch (reason) {
    case "prisma-client-stale":
      return "Stop the Next.js dev server, run `npx prisma generate`, then restart it.";
    case "schema-drift":
      return "Back up your database, run `npx tsx prisma/migrate_auto.ts` to bring it up to the current schema, then restart the dev server.";
  }
}

/**
 * Convert an error into a 503 NextResponse if it matches an upgrade
 * signal; otherwise return null so the caller can fall through to the
 * normal error-handling path.
 *
 * The response body shape is:
 *   { error, code: "BACKEND_UPGRADE_REQUIRED", reason, hint }
 * which the client-side `apiFetch` wrapper looks for to dispatch the
 * upgrade-prompt event.
 */
export function backendUpgradeResponse(err: unknown): NextResponse | null {
  const reason = isBackendUpgradeError(err);
  if (!reason) return null;
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json(
    {
      error: message,
      code: "BACKEND_UPGRADE_REQUIRED",
      reason,
      hint: hintFor(reason),
    },
    { status: 503 },
  );
}
