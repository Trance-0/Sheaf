"use client";

/**
 * v0.1.21 — the browser now talks to Postgres directly, so there's no
 * more 5xx channel carrying `BACKEND_UPGRADE_REQUIRED` from the server.
 * Drift detection is dispatched from `src/lib/client/neon.ts` whenever
 * a Postgres query throws a known missing-column / missing-table error.
 * This file is intentionally tiny now: just the window event
 * name/shape so `BackendUpgradePrompt` can listen in one place and all
 * client modules can dispatch into the same channel.
 */

export const BACKEND_UPGRADE_EVENT = "sheaf:backend-upgrade-required";

export interface BackendUpgradeInfo {
  reason: "prisma-client-stale" | "schema-drift" | string;
  hint: string;
  error: string;
}
