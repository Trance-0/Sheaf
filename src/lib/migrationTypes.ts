/**
 * v0.1.20 — shared TypeScript interfaces describing the structured
 * report that POST /api/migrate returns.
 *
 * This file intentionally has NO runtime imports so both the server
 * migration runner (`src/lib/server/migrations.ts`, which imports
 * PrismaClient and the prisma migration scripts) and the client-side
 * migration page (`src/components/BackendUpgradePrompt.tsx`, which
 * runs in the browser) can share the same shapes without dragging any
 * node-only code into the client bundle.
 */

export interface MigrationStepMeta {
  id: string;
  description: string;
}

export interface MigrationStepResult extends MigrationStepMeta {
  status: "success" | "failed";
  logs: string[];
  error?: string;
  durationMs: number;
}

export interface MigrationReport {
  startedAt: string;
  durationMs: number;
  ranCount: number;
  totalCount: number;
  status: "success" | "failed";
  steps: MigrationStepResult[];
}
