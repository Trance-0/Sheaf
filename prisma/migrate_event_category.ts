/**
 * One-shot backfill for `Event.category`, added in 0.1.11.
 *
 * Migration rules (matching the 0.1.7 heuristic that /api/graph used to run
 * in memory):
 *   - events linked to a single entity whose type is 'agency'  => 'job'
 *   - events linked to two or more entities                    => 'news'
 *   - everything else                                          => 'news' (safe default)
 *
 * Uses $executeRawUnsafe so it's independent of whatever Prisma client
 * version happens to be on disk. Safe to re-run — it only sets category
 * for rows where it is currently NULL.
 *
 * Run with:  npx tsx prisma/migrate_event_category.ts
 *
 * 0.1.18: exported `runEventCategoryMigration(prisma)` so
 * `migrate_auto.ts` can compose it with other migrations under a shared
 * Prisma client + shared confirmation prompt.
 *
 * 0.1.20: added an optional `logger` parameter (defaults to `console`)
 * so the frontend-facing `/api/migrate` route can capture output
 * line-by-line and return it to the BackendUpgradePrompt UI.
 */
import { PrismaClient } from '@prisma/client';

type MigrationLogger = { log: (message: string) => void };

export async function runEventCategoryMigration(
  prisma: PrismaClient,
  logger: MigrationLogger = console,
): Promise<void> {
  // 1) Jobs: events with exactly one EventEntity row whose entity is an agency.
  const jobCount = await prisma.$executeRawUnsafe(`
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
  logger.log(`[category=job] updated ${jobCount} events`);

  // 2) News: events with >= 2 linked entities (and still NULL after pass 1).
  const newsMulti = await prisma.$executeRawUnsafe(`
    UPDATE "Event"
    SET "category" = 'news'
    WHERE "category" IS NULL
      AND "id" IN (
        SELECT "eventId" FROM "EventEntity" GROUP BY "eventId" HAVING COUNT(*) >= 2
      );
  `);
  logger.log(`[category=news multi-entity] updated ${newsMulti} events`);

  // 3) Fallback: anything still NULL (single-entity, non-agency) -> 'news'.
  const newsFallback = await prisma.$executeRawUnsafe(`
    UPDATE "Event"
    SET "category" = 'news'
    WHERE "category" IS NULL;
  `);
  logger.log(`[category=news fallback] updated ${newsFallback} events`);

  // Summary
  const rows = await prisma.$queryRawUnsafe(`
    SELECT "category", COUNT(*)::bigint AS count FROM "Event" GROUP BY "category" ORDER BY "category";
  `) as { category: string | null; count: bigint }[];
  logger.log('');
  logger.log('Final distribution:');
  for (const r of rows) {
    logger.log(`  ${r.category ?? '(null)'}: ${r.count}`);
  }
}

// Standalone CLI entrypoint. Only runs when the file is invoked directly
// via `tsx prisma/migrate_event_category.ts`, not when imported by
// migrate_auto.ts. We key off process.argv[1] resolving to this file's
// path, which `tsx` passes through as an absolute OS path.
const invokedDirectly = process.argv[1] && /migrate_event_category\.ts$/.test(process.argv[1]);
if (invokedDirectly) {
  const prisma = new PrismaClient();
  runEventCategoryMigration(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
