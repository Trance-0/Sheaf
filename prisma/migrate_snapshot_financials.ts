/**
 * One-shot migration for 0.1.13: extend EntitySnapshot with explicit
 * financial columns + provenance fields, and add a unique constraint on
 * (entityId, date) so monthly backfill can upsert idempotently.
 *
 * New columns:
 *   - marketCapUsd   Float
 *   - employeeCount  Int
 *   - freeCashFlow   Float
 *   - sourceName     Text
 *   - sourceUrl      Text
 *
 * New index:
 *   - EntitySnapshot_entityId_date_key (UNIQUE on entityId, date)
 *
 * Uses $executeRawUnsafe + IF NOT EXISTS so it's safe to re-run and
 * independent of whatever prisma client is currently generated on disk.
 * The legacy 0.1.x columns (netWorth, growth, statusText) are left alone
 * — new code reads the explicit columns; old rows stay queryable.
 *
 * Run with:  npx tsx prisma/migrate_snapshot_financials.ts
 *
 * 0.1.18: exported `runSnapshotFinancialsMigration(prisma)` so
 * `migrate_auto.ts` can compose it with other migrations under a shared
 * Prisma client + shared confirmation prompt.
 */
import { PrismaClient } from '@prisma/client';

async function addColumn(prisma: PrismaClient, name: string, type: string) {
  const sql = `ALTER TABLE "EntitySnapshot" ADD COLUMN IF NOT EXISTS "${name}" ${type};`;
  await prisma.$executeRawUnsafe(sql);
  console.log(`  + column ${name} ${type}`);
}

export async function runSnapshotFinancialsMigration(prisma: PrismaClient): Promise<void> {
  console.log('EntitySnapshot financial columns:');
  await addColumn(prisma, 'marketCapUsd', 'DOUBLE PRECISION');
  await addColumn(prisma, 'employeeCount', 'INTEGER');
  await addColumn(prisma, 'freeCashFlow', 'DOUBLE PRECISION');
  await addColumn(prisma, 'sourceName', 'TEXT');
  await addColumn(prisma, 'sourceUrl', 'TEXT');

  console.log('\nUnique constraint (entityId, date):');
  // CREATE UNIQUE INDEX IF NOT EXISTS is safer than ALTER TABLE ADD
  // CONSTRAINT because it's idempotent and doesn't blow up on re-run.
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "EntitySnapshot_entityId_date_key"
    ON "EntitySnapshot" ("entityId", "date");
  `);
  console.log('  + unique index EntitySnapshot_entityId_date_key');

  // Summary of row count so the operator can sanity-check.
  const rows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::bigint AS count FROM "EntitySnapshot";
  `) as { count: bigint }[];
  console.log(`\nEntitySnapshot currently holds ${rows[0].count} rows.`);
}

// Standalone CLI entrypoint. Only runs when invoked directly via
// `tsx prisma/migrate_snapshot_financials.ts`, not when imported by
// migrate_auto.ts.
const invokedDirectly = process.argv[1] && /migrate_snapshot_financials\.ts$/.test(process.argv[1]);
if (invokedDirectly) {
  const prisma = new PrismaClient();
  runSnapshotFinancialsMigration(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
