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
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addColumn(name: string, type: string) {
  const sql = `ALTER TABLE "EntitySnapshot" ADD COLUMN IF NOT EXISTS "${name}" ${type};`;
  await prisma.$executeRawUnsafe(sql);
  console.log(`  + column ${name} ${type}`);
}

async function main() {
  console.log('EntitySnapshot financial columns:');
  await addColumn('marketCapUsd', 'DOUBLE PRECISION');
  await addColumn('employeeCount', 'INTEGER');
  await addColumn('freeCashFlow', 'DOUBLE PRECISION');
  await addColumn('sourceName', 'TEXT');
  await addColumn('sourceUrl', 'TEXT');

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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
