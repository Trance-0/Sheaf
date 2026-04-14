"use client";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import {
  BACKEND_UPGRADE_EVENT,
  type BackendUpgradeInfo,
} from "@/lib/apiFetch";

/**
 * v0.1.21 — browser-side Neon connector.
 *
 * Every data-access module in the UI now talks to the user's Postgres
 * (Neon) directly via the Neon HTTP driver, so the Vercel-hosted Next.js
 * server never touches the database. This file is the single entrypoint:
 * it validates the connection string, hands back a typed `sql` function
 * with `fullResults: true` so callers get `rowCount` on DML, and mirrors
 * the server's drift-detection heuristics so `BackendUpgradePrompt` can
 * still fire when a column or table is missing.
 */

export type Sql = NeonQueryFunction<false, true>;

export function createSql(databaseUrl: string): Sql {
  if (!databaseUrl) {
    throw new Error("No database URL configured in Settings.");
  }
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error(
      "Database URL must start with postgres:// or postgresql://.",
    );
  }
  return neon(databaseUrl, { fullResults: true }) as Sql;
}

const DRIFT_PATTERNS: RegExp[] = [
  /does not exist in the current database/i,
  /column .* does not exist/i,
  /relation .* does not exist/i,
  /\bP2021\b/,
  /\bP2022\b/,
];

function isDriftError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return DRIFT_PATTERNS.some((re) => re.test(msg));
}

/**
 * Dispatch the same `BACKEND_UPGRADE_EVENT` the server-side pipeline
 * used to emit, so `BackendUpgradePrompt` can continue to own the
 * schema-drift UI from a single global listener.
 */
export function maybeDispatchDrift(err: unknown): void {
  if (typeof window === "undefined") return;
  if (!isDriftError(err)) return;
  const info: BackendUpgradeInfo = {
    reason: "schema-drift",
    hint: "Open the upgrade prompt and run the bundled migration against your database.",
    error: err instanceof Error ? err.message : String(err),
  };
  window.dispatchEvent(
    new CustomEvent<BackendUpgradeInfo>(BACKEND_UPGRADE_EVENT, {
      detail: info,
    }),
  );
}

/**
 * Wrap any async data-access call so a schema-drift error bubbles up to
 * the global modal without every caller having to remember to dispatch.
 * Rethrows so the caller still sees the original error for inline UI.
 */
export async function withDriftDispatch<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    maybeDispatchDrift(err);
    throw err;
  }
}

/**
 * Postgres returns `bigint` columns as JavaScript `BigInt`, which don't
 * serialize cleanly and don't arithmetic-mix with regular numbers. All
 * the counts we query are well under `Number.MAX_SAFE_INTEGER`, so we
 * coerce explicitly at the edge.
 */
export function bigintToNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}
