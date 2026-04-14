"use client";

import { createSql, bigintToNumber, type Sql } from "@/lib/client/neon";
import type {
  MigrationReport,
  MigrationStepMeta,
  MigrationStepResult,
} from "@/lib/migrationTypes";

/**
 * v0.1.21 — browser-side migration runner.
 *
 * Sheaf used to POST to `/api/migrate`, which built a Prisma client from
 * the user-supplied URL on the server and ran the idempotent migration
 * steps. That round-trip required the server's generated Prisma client
 * to initialize, so a stale deploy would refuse to run migrations at
 * all — the exact state users hit most.
 *
 * The browser now drives the same idempotent SQL directly against Neon
 * over HTTP, with no server involvement. The Vercel build can be
 * completely broken and migrations still work.
 *
 * Idempotency is preserved verbatim from `prisma/migrate_*.ts`:
 * `ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`, and
 * `UPDATE ... WHERE col IS NULL`. Re-running is a no-op.
 */

interface BrowserMigrationStep {
  id: string;
  description: string;
  run: (sql: Sql, log: (line: string) => void) => Promise<void>;
}

const BROWSER_MIGRATIONS: BrowserMigrationStep[] = [
  {
    id: "0.1.13-snapshot-financials",
    description:
      "Add marketCapUsd / employeeCount / freeCashFlow / sourceName / sourceUrl columns to EntitySnapshot and a unique index on (entityId, date).",
    run: async (sql, log) => {
      const addColumn = async (name: string, type: string) => {
        await sql.query(
          `ALTER TABLE "EntitySnapshot" ADD COLUMN IF NOT EXISTS "${name}" ${type};`,
        );
        log(`  + column ${name} ${type}`);
      };
      log("EntitySnapshot financial columns:");
      await addColumn("marketCapUsd", "DOUBLE PRECISION");
      await addColumn("employeeCount", "INTEGER");
      await addColumn("freeCashFlow", "DOUBLE PRECISION");
      await addColumn("sourceName", "TEXT");
      await addColumn("sourceUrl", "TEXT");

      log("");
      log("Unique constraint (entityId, date):");
      await sql.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "EntitySnapshot_entityId_date_key" ON "EntitySnapshot" ("entityId", "date");`,
      );
      log("  + unique index EntitySnapshot_entityId_date_key");

      const count = await sql.query(
        `SELECT COUNT(*)::bigint AS count FROM "EntitySnapshot";`,
      );
      const rows = count.rows as { count: bigint | number | string }[];
      log("");
      log(
        `EntitySnapshot currently holds ${bigintToNumber(rows[0]?.count ?? 0)} rows.`,
      );
    },
  },
  {
    id: "0.1.11-event-category",
    description:
      "Backfill Event.category as 'job' for single-agency events and 'news' for multi-entity or fallback events.",
    run: async (sql, log) => {
      const jobRes = await sql.query(`
        UPDATE "Event"
        SET "category" = 'job'
        WHERE "category" IS NULL
          AND "id" IN (
            SELECT ee."eventId"
            FROM "EventEntity" ee
            JOIN "Entity" e ON e."id" = ee."entityId"
            WHERE e."type" = 'agency'
            GROUP BY ee."eventId"
            HAVING COUNT(*) = 1
          );
      `);
      log(`[category=job] updated ${jobRes.rowCount} events`);

      const multiRes = await sql.query(`
        UPDATE "Event"
        SET "category" = 'news'
        WHERE "category" IS NULL
          AND "id" IN (
            SELECT "eventId" FROM "EventEntity" GROUP BY "eventId" HAVING COUNT(*) >= 2
          );
      `);
      log(`[category=news multi-entity] updated ${multiRes.rowCount} events`);

      const fallbackRes = await sql.query(`
        UPDATE "Event"
        SET "category" = 'news'
        WHERE "category" IS NULL;
      `);
      log(`[category=news fallback] updated ${fallbackRes.rowCount} events`);

      const summary = await sql.query(
        `SELECT "category", COUNT(*)::bigint AS count FROM "Event" GROUP BY "category" ORDER BY "category";`,
      );
      const rows = summary.rows as {
        category: string | null;
        count: bigint | number | string;
      }[];
      log("");
      log("Final distribution:");
      for (const r of rows) {
        log(`  ${r.category ?? "(null)"}: ${bigintToNumber(r.count)}`);
      }
    },
  },
];

export function listBrowserMigrations(): MigrationStepMeta[] {
  return BROWSER_MIGRATIONS.map(({ id, description }) => ({ id, description }));
}

export async function runBrowserMigrations(
  databaseUrl: string,
): Promise<MigrationReport> {
  const sql = createSql(databaseUrl);
  const startedAt = Date.now();
  const steps: MigrationStepResult[] = [];

  for (const migration of BROWSER_MIGRATIONS) {
    const logs: string[] = [];
    const stepStart = Date.now();
    try {
      await migration.run(sql, (line) => logs.push(line));
      steps.push({
        id: migration.id,
        description: migration.description,
        status: "success",
        logs,
        durationMs: Date.now() - stepStart,
      });
    } catch (err) {
      steps.push({
        id: migration.id,
        description: migration.description,
        status: "failed",
        logs,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - stepStart,
      });
      // Stop at first failure — later steps often depend on earlier
      // structural changes, so continuing would obscure the root cause.
      break;
    }
  }

  const anyFailed = steps.some((s) => s.status === "failed");
  const ranCount = steps.filter((s) => s.status === "success").length;

  return {
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    ranCount,
    totalCount: BROWSER_MIGRATIONS.length,
    status: anyFailed ? "failed" : "success",
    steps,
  };
}
