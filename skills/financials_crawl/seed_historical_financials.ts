/**
 * Historical financial snapshot backfill (task 0.1.13).
 *
 * Populates EntitySnapshot with a monthly time-series of marketCapUsd
 * for every public company in the DB that has a stockTicker, plus the
 * hand-curated employee/FCF/private-valuation datapoints from
 * manual_snapshots.json. Each snapshot row carries an explicit
 * sourceName + sourceUrl so every value is auditable.
 *
 * ## Sources
 *
 * 1. **Yahoo Finance v8/chart endpoint** (public, no key)
 *    - interval=1mo, range=max — gives us every first-of-month close price
 *      from the company's IPO forward.
 *    - We multiply close × implied_shares where
 *      implied_shares = entity.marketCapUsd / current_close. This is a
 *      close-price-indexed market cap proxy: it matches today's market cap
 *      exactly and fades backward proportionally to the stock price. It is
 *      NOT an accurate historical market cap (shares outstanding actually
 *      changed over time) but is sufficient for relative sizing in the
 *      graph, and we document the approximation in sourceName.
 *
 * 2. **manual_snapshots.json** (hand-curated from SEC filings + press
 *    releases)
 *    - Annual employeeCount and freeCashFlow points pulled from 10-K
 *      filings for public companies where we need the real historical
 *      series.
 *    - Private company valuations (Anthropic, OpenAI, Figma, ByteDance)
 *      pulled from funding-round press coverage.
 *    - Every point has a sourceName + sourceUrl; auditable.
 *
 * ## Idempotency
 *
 * The EntitySnapshot schema has a unique index on (entityId, date) so
 * this script uses `prisma.entitySnapshot.upsert()`. Safe to re-run: it
 * updates values in place without duplicating rows.
 *
 * Run with:  npx tsx skills/financials_crawl/seed_historical_financials.ts
 * Flags:
 *   --skip-yahoo  — skip the Yahoo Finance fetch, apply manual only
 *   --skip-manual — skip manual_snapshots.json, Yahoo only
 *   --limit=<n>   — only fetch the first N public entities (debugging)
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Raw-SQL upsert for EntitySnapshot.
 *
 * The generated Prisma client on disk is frozen to the old EntitySnapshot
 * shape (no marketCapUsd column, no (entityId,date) composite unique).
 * Re-running `prisma generate` is blocked on Windows when the dev server
 * holds the query engine DLL, so instead we go through raw SQL for all
 * writes. The underlying columns + unique index are already in place
 * thanks to migrate_snapshot_financials.ts.
 */
async function upsertSnapshot(row: {
  entityId: string;
  date: Date;
  marketCapUsd?: number | null;
  employeeCount?: number | null;
  freeCashFlow?: number | null;
  sourceName: string;
  sourceUrl: string;
}) {
  // We intentionally use COALESCE on UPDATE so that a Yahoo-only row
  // followed by a manual row with employeeCount doesn't clobber the
  // Yahoo market cap, and vice versa.
  const id = randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "EntitySnapshot"
      ("id", "entityId", "date", "marketCapUsd", "employeeCount", "freeCashFlow", "sourceName", "sourceUrl")
    VALUES
      (${id}, ${row.entityId}, ${row.date}, ${row.marketCapUsd ?? null}, ${row.employeeCount ?? null}, ${row.freeCashFlow ?? null}, ${row.sourceName}, ${row.sourceUrl})
    ON CONFLICT ("entityId", "date") DO UPDATE SET
      "marketCapUsd" = COALESCE(EXCLUDED."marketCapUsd", "EntitySnapshot"."marketCapUsd"),
      "employeeCount" = COALESCE(EXCLUDED."employeeCount", "EntitySnapshot"."employeeCount"),
      "freeCashFlow" = COALESCE(EXCLUDED."freeCashFlow", "EntitySnapshot"."freeCashFlow"),
      "sourceName" = EXCLUDED."sourceName",
      "sourceUrl" = EXCLUDED."sourceUrl";
  `;
}

// Satisfy ts-unused-import for Prisma — we reference the type in raw SQL
// via tagged templates but not through the namespace directly.
void Prisma;

interface YahooChartResult {
  chart: {
    result: Array<{
      meta: {
        symbol: string;
        regularMarketPrice: number;
        firstTradeDate: number;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          close: (number | null)[];
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

interface ManualSnapshot {
  entityId: string;
  date: string;
  marketCapUsd?: number;
  employeeCount?: number;
  freeCashFlow?: number;
  sourceName: string;
  sourceUrl: string;
}

interface ManualSnapshotFile {
  _comment?: string;
  snapshots: ManualSnapshot[];
}

/** Rounds a date down to the first day of its month, UTC. */
function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

async function fetchYahooMonthly(ticker: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1mo&range=max`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 sheaf-financials-crawl' } });
  if (!res.ok) throw new Error(`Yahoo ${ticker}: HTTP ${res.status}`);
  const data = (await res.json()) as YahooChartResult;
  if (data.chart.error) throw new Error(`Yahoo ${ticker}: ${data.chart.error.description}`);
  if (!data.chart.result || data.chart.result.length === 0) throw new Error(`Yahoo ${ticker}: empty result`);

  const result = data.chart.result[0];
  const closes = result.indicators.quote[0]?.close ?? [];
  const timestamps = result.timestamp ?? [];

  const points: { date: Date; close: number }[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    points.push({
      date: firstOfMonth(new Date(timestamps[i] * 1000)),
      close,
    });
  }
  return {
    points,
    currentPrice: result.meta.regularMarketPrice,
    sourceUrl: url,
  };
}

async function yahooPass(limit?: number) {
  const entities = await prisma.entity.findMany({
    where: { stockTicker: { not: null } },
    select: { id: true, name: true, stockTicker: true, marketCapUsd: true },
    orderBy: { id: 'asc' },
  });

  // Dedup by ticker — e.g. aws + amazon both map to AMZN, google + alphabet to GOOGL.
  // We still write snapshots for each entity, but fetch once per ticker.
  const targets = limit ? entities.slice(0, limit) : entities;
  const fetched = new Map<string, Awaited<ReturnType<typeof fetchYahooMonthly>>>();

  let totalSnapshots = 0;
  let failures = 0;

  for (const entity of targets) {
    const ticker = entity.stockTicker!;
    if (!entity.marketCapUsd || entity.marketCapUsd <= 0) {
      console.log(`[skip] ${entity.id}: no current marketCapUsd — can't derive shares outstanding`);
      continue;
    }

    let data = fetched.get(ticker);
    if (!data) {
      try {
        console.log(`[fetch] ${entity.id} (${ticker})...`);
        data = await fetchYahooMonthly(ticker);
        fetched.set(ticker, data);
        // Be polite — Yahoo is public but unlisted.
        await new Promise((r) => setTimeout(r, 250));
      } catch (error) {
        console.log(`[fail] ${entity.id} (${ticker}): ${(error as Error).message}`);
        failures++;
        continue;
      }
    }

    // Derive "shares outstanding" from current values. The ratio gives us
    // a stock-price-indexed proxy that matches today's market cap exactly.
    const impliedShares = entity.marketCapUsd / data.currentPrice;
    const sourceName = `Yahoo Finance (close price × implied shares ${impliedShares.toExponential(2)})`;

    let perEntity = 0;
    for (const point of data.points) {
      const marketCap = Math.round(point.close * impliedShares);
      await upsertSnapshot({
        entityId: entity.id,
        date: point.date,
        marketCapUsd: marketCap,
        sourceName,
        sourceUrl: data.sourceUrl,
      });
      perEntity++;
    }
    totalSnapshots += perEntity;
    console.log(`  ${entity.id}: ${perEntity} monthly points`);
  }

  console.log(`\nYahoo pass summary: ${totalSnapshots} snapshots across ${fetched.size} distinct tickers, ${failures} failures`);
}

async function manualPass() {
  const filePath = path.join(__dirname, 'manual_snapshots.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const file = JSON.parse(raw) as ManualSnapshotFile;
  console.log(`\nmanual_snapshots.json: ${file.snapshots.length} curated rows`);

  let upserted = 0;
  let missingEntity = 0;
  for (const snap of file.snapshots) {
    const entity = await prisma.entity.findUnique({ where: { id: snap.entityId }, select: { id: true } });
    if (!entity) {
      console.log(`[skip] missing entity: ${snap.entityId}`);
      missingEntity++;
      continue;
    }
    const date = firstOfMonth(new Date(snap.date));
    await upsertSnapshot({
      entityId: snap.entityId,
      date,
      marketCapUsd: snap.marketCapUsd ?? null,
      employeeCount: snap.employeeCount ?? null,
      freeCashFlow: snap.freeCashFlow ?? null,
      sourceName: snap.sourceName,
      sourceUrl: snap.sourceUrl,
    });
    upserted++;
  }
  console.log(`Manual pass summary: ${upserted} upserted, ${missingEntity} skipped for missing entity`);
}

async function main() {
  const args = process.argv.slice(2);
  const skipYahoo = args.includes('--skip-yahoo');
  const skipManual = args.includes('--skip-manual');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  if (!skipYahoo) await yahooPass(limit);
  if (!skipManual) await manualPass();

  const totals = (await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT("marketCapUsd")::bigint AS with_market_cap,
      COUNT("employeeCount")::bigint AS with_employees,
      COUNT("freeCashFlow")::bigint AS with_fcf
    FROM "EntitySnapshot";
  `)) as { total: bigint; with_market_cap: bigint; with_employees: bigint; with_fcf: bigint }[];

  console.log('\nFinal EntitySnapshot totals:');
  for (const row of totals) {
    console.log(`  rows: ${row.total}`);
    console.log(`  with marketCapUsd: ${row.with_market_cap}`);
    console.log(`  with employeeCount: ${row.with_employees}`);
    console.log(`  with freeCashFlow: ${row.with_fcf}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
