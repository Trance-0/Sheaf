import type { PrismaClient } from "@prisma/client";

// Import directly from prisma/ — Next.js bundles both directories
// because `include` in tsconfig.json covers `**/*.ts`, and the CLI
// entrypoint blocks in those files are gated by a `process.argv[1]`
// check so importing them from the Next.js server does not fire the
// CLI path.
import { runSnapshotFinancialsMigration } from "../../../prisma/migrate_snapshot_financials";
import { runEventCategoryMigration } from "../../../prisma/migrate_event_category";
import type {
  MigrationReport,
  MigrationStepMeta,
  MigrationStepResult,
} from "@/lib/migrationTypes";

// Re-export for callers that want everything from this module. The
// canonical definitions live in `migrationTypes.ts` so the client-side
// BackendUpgradePrompt can import them without pulling Prisma into
// the browser bundle.
export type { MigrationReport, MigrationStepMeta, MigrationStepResult };

/**
 * v0.1.20 — shared migration runner used by both the CLI driver
 * (`prisma/migrate_auto.ts`) and the frontend-facing API route
 * (`src/app/api/migrate/route.ts`).
 *
 * The CLI path has existed since v0.1.18; v0.1.20 adds the API path so
 * a hosted Sheaf deploy can upgrade a user-provided database without
 * anyone having to clone the repo, install Node, or open a terminal.
 * The user supplies their database URL via the same
 * `x-sheaf-database-url` header the read routes already use, and the
 * API route runs the exact same idempotent migration steps the CLI
 * would run, logging each line to a structured report that the
 * BackendUpgradePrompt UI can display.
 *
 * Idempotency: every step uses `ADD COLUMN IF NOT EXISTS`,
 * `CREATE UNIQUE INDEX IF NOT EXISTS`, or `UPDATE ... WHERE col IS
 * NULL`. Running the same migration twice against an already-migrated
 * database is a no-op — you'll see "0 rows updated" summaries instead
 * of an error.
 */

export interface MigrationLogger {
  log: (message: string) => void;
}

interface MigrationStep extends MigrationStepMeta {
  // Logger is optional so the CLI driver can call `migration.run(prisma)`
  // and fall through to the underlying function's `console` default,
  // while the API route (`runAllMigrations`) always supplies its own
  // capturing logger.
  run: (prisma: PrismaClient, logger?: MigrationLogger) => Promise<void>;
}

/**
 * The canonical ordered list of migrations that bring an older Sheaf
 * database up to the current schema. Add new entries to the end of
 * this array — order matters for anything that depends on prior
 * structural changes.
 */
export const MIGRATIONS: MigrationStep[] = [
  {
    id: "0.1.13-snapshot-financials",
    description:
      "Add marketCapUsd / employeeCount / freeCashFlow / sourceName / sourceUrl columns to EntitySnapshot and a unique index on (entityId, date).",
    run: runSnapshotFinancialsMigration,
  },
  {
    id: "0.1.11-event-category",
    description:
      "Backfill Event.category as 'job' for single-agency events and 'news' for multi-entity or fallback events.",
    run: runEventCategoryMigration,
  },
];

export function listMigrations(): MigrationStepMeta[] {
  return MIGRATIONS.map(({ id, description }) => ({ id, description }));
}

/**
 * Run every registered migration in order against the provided Prisma
 * client. Each step's log output is captured into its own `logs`
 * array, and failures stop the driver immediately — consistent with
 * the CLI path, which also aborts on first failure so the operator can
 * inspect state before deciding whether to re-run.
 *
 * This function does NOT construct or disconnect the Prisma client —
 * the caller owns its lifecycle. The API route uses
 * `createPrismaFromRequest` + a try/finally `$disconnect`, and the
 * CLI driver passes in its own `new PrismaClient()`.
 */
export async function runAllMigrations(
  prisma: PrismaClient,
): Promise<MigrationReport> {
  const startedAt = Date.now();
  const steps: MigrationStepResult[] = [];

  for (const migration of MIGRATIONS) {
    const stepLogs: string[] = [];
    const stepLogger: MigrationLogger = {
      log: (message: string) => stepLogs.push(message),
    };
    const stepStart = Date.now();
    try {
      await migration.run(prisma, stepLogger);
      steps.push({
        id: migration.id,
        description: migration.description,
        status: "success",
        logs: stepLogs,
        durationMs: Date.now() - stepStart,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      steps.push({
        id: migration.id,
        description: migration.description,
        status: "failed",
        logs: stepLogs,
        error: message,
        durationMs: Date.now() - stepStart,
      });
      // Stop at the first failure. Subsequent migrations often depend
      // on earlier ones structurally, so running them after a failed
      // step would produce cascading errors that obscure the root
      // cause.
      break;
    }
  }

  const ranCount = steps.filter((s) => s.status === "success").length;
  const anyFailed = steps.some((s) => s.status === "failed");

  return {
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    ranCount,
    totalCount: MIGRATIONS.length,
    status: anyFailed ? "failed" : "success",
    steps,
  };
}
