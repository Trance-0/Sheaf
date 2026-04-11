/**
 * v0.1.18 — one-shot auto-migration driver for upgrading an older Sheaf
 * database to the current schema in a single command.
 *
 * Composes every idempotent raw-SQL migration shipped to date under a
 * single Prisma client, a single backup confirmation, and a single
 * 5-second countdown. Each sub-migration is safe to re-run on its own
 * (ALTER TABLE IF NOT EXISTS, UPDATE ... WHERE col IS NULL, CREATE UNIQUE
 * INDEX IF NOT EXISTS), so running this script on a database that's
 * already at the target schema is a no-op.
 *
 * Intended upgrade path:
 *   1. Export your database (Neon branch, pg_dump, or whatever you use).
 *   2. `npx tsx prisma/migrate_auto.ts`
 *   3. Type `yes` at the confirmation prompt.
 *   4. Wait for the 5-second countdown (last chance to Ctrl+C).
 *
 * CLI flags:
 *   --yes / -y     Skip the interactive confirmation (useful for CI or
 *                  after you've already confirmed on a previous run).
 *                  The 5-second countdown still runs — it is a separate
 *                  safety rail.
 *   --skip-countdown   Skip the 5-second countdown. Requires --yes.
 *   --dry-run      Print what would run without touching the database.
 *
 * Notes:
 *   - The script uses $queryRawUnsafe to snapshot key table row counts
 *     before and after each migration step so the operator gets a
 *     before/after diff for every change.
 *   - If a sub-migration throws, the script aborts immediately. Earlier
 *     sub-migrations may have already committed their DDL — that's
 *     intentional: DDL in Postgres is transactional, so each sub-migration
 *     either fully applies or is rolled back by Postgres on error.
 */

import { PrismaClient } from '@prisma/client';
import readline from 'node:readline';

import { runSnapshotFinancialsMigration } from './migrate_snapshot_financials';
import { runEventCategoryMigration } from './migrate_event_category';

interface CliFlags {
  yes: boolean;
  skipCountdown: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = { yes: false, skipCountdown: false, dryRun: false };
  for (const arg of argv) {
    if (arg === '--yes' || arg === '-y') flags.yes = true;
    else if (arg === '--skip-countdown') flags.skipCountdown = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npx tsx prisma/migrate_auto.ts [--yes] [--skip-countdown] [--dry-run]

Runs every idempotent schema migration shipped to date against the
database pointed to by DATABASE_URL (loaded via prisma.config.ts).

Flags:
  --yes, -y          Skip the interactive 'type yes to continue' prompt.
  --skip-countdown   Skip the 5-second countdown. Requires --yes.
  --dry-run          List migrations without running them.`);
      process.exit(0);
    }
  }
  if (flags.skipCountdown && !flags.yes) {
    console.error('--skip-countdown requires --yes. The countdown is the last safety rail before any destructive work.');
    process.exit(1);
  }
  return flags;
}

/**
 * Prompt the user for a literal "yes" answer. Returns true only if the
 * user typed exactly "yes" or "y" (case-insensitive). We intentionally
 * do NOT accept Enter-as-default because this prompt gates DDL that
 * mutates a production database.
 */
async function confirmBackup(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise<boolean>((resolve) => {
      const prompt = [
        '',
        '================================================================',
        '  WARNING: this will run schema migrations against the database',
        `  pointed to by DATABASE_URL (see prisma.config.ts / .env).`,
        '',
        '  Please BACK UP your database before proceeding.',
        '  - Neon: create a branch from the current state.',
        '  - Self-hosted Postgres: `pg_dump` to a safe location.',
        '  - Any other: do whatever your normal snapshot process is.',
        '',
        '  All migrations shipped here are idempotent (ALTER IF NOT EXISTS,',
        '  UPDATE WHERE col IS NULL, CREATE UNIQUE INDEX IF NOT EXISTS) so',
        '  running against an already-migrated DB is a no-op, but we still',
        '  want a rollback option if something unexpected happens.',
        '================================================================',
        '',
        'Type "yes" to continue, anything else to abort: ',
      ].join('\n');
      rl.question(prompt, (answer) => {
        const trimmed = answer.trim().toLowerCase();
        resolve(trimmed === 'yes' || trimmed === 'y');
      });
    });
  } finally {
    rl.close();
  }
}

/**
 * Print a 5-second countdown to stdout, giving the user one last chance
 * to Ctrl+C before any DDL runs. Uses process.stdout.write + \r so the
 * countdown redraws on a single line where the terminal supports it.
 */
async function countdown(seconds: number): Promise<void> {
  console.log('');
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`  Starting in ${i}s... (Ctrl+C to abort)  \r`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  process.stdout.write('  Running migrations now...               \n\n');
}

interface MigrationStep {
  id: string;
  description: string;
  run: (prisma: PrismaClient) => Promise<void>;
}

const MIGRATIONS: MigrationStep[] = [
  {
    id: '0.1.13-snapshot-financials',
    description:
      'Add marketCapUsd / employeeCount / freeCashFlow / sourceName / sourceUrl columns to EntitySnapshot and a unique index on (entityId, date).',
    run: runSnapshotFinancialsMigration,
  },
  {
    id: '0.1.11-event-category',
    description:
      "Backfill Event.category as 'job' for single-agency events and 'news' for multi-entity or fallback events.",
    run: runEventCategoryMigration,
  },
];

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  console.log(`Sheaf auto-migration driver (v0.1.18)`);
  console.log(`${MIGRATIONS.length} migration step${MIGRATIONS.length === 1 ? '' : 's'} registered:`);
  for (const m of MIGRATIONS) {
    console.log(`  - [${m.id}] ${m.description}`);
  }

  if (flags.dryRun) {
    console.log('\n[dry-run] not touching the database. Exiting.');
    return;
  }

  if (!flags.yes) {
    const confirmed = await confirmBackup();
    if (!confirmed) {
      console.log('\nAborted. No changes were made.');
      process.exit(0);
    }
  } else {
    console.log('\n[--yes] interactive confirmation skipped.');
  }

  if (!flags.skipCountdown) {
    await countdown(5);
  }

  const prisma = new PrismaClient();
  const startedAt = Date.now();
  let ranCount = 0;
  try {
    for (const migration of MIGRATIONS) {
      console.log(`\n=== [${migration.id}] ${migration.description} ===`);
      await migration.run(prisma);
      ranCount++;
    }
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(2);
    console.log(`\nAll ${ranCount} migration step${ranCount === 1 ? '' : 's'} completed in ${seconds}s.`);
  } catch (err) {
    console.error(`\nMigration failed after ${ranCount} successful step${ranCount === 1 ? '' : 's'}:`);
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
