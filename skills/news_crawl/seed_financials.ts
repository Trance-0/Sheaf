/**
 * Backfill the static financial / size-factor fields (`stockTicker`,
 * `marketCapUsd`, `employeeCount`, `freeCashFlow`, `foundedYear`) added to
 * the Entity model in 0.1.11.
 *
 * These values are deliberately static — pulling real-time data belongs in
 * the pipeline, not a frontend-focused seed. They let the SidePanel stats
 * block and the "Node Size Factor" setting render something meaningful on
 * the entities that already exist in the Glasswing seed.
 *
 * Run with:  npx tsx skills/news_crawl/seed_financials.ts
 *
 * Safe to re-run — only upserts on the known IDs; entities that don't
 * exist are left alone instead of being created.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Financials {
  id: string;
  stockTicker?: string | null;
  marketCapUsd?: number | null;
  employeeCount?: number | null;
  freeCashFlow?: number | null;
  foundedYear?: number | null;
}

// Values are rough snapshots as of early 2026; exact-precision isn't the
// point — this exists so the log-scaled node sizer has plausible inputs.
const FINANCIALS: Financials[] = [
  // Anthropic is private; market cap is the implied Series F valuation.
  { id: 'anthropic', stockTicker: null, marketCapUsd: 6.0e10, employeeCount: 1200, freeCashFlow: null, foundedYear: 2021 },
  { id: 'palantir', stockTicker: 'PLTR', marketCapUsd: 6.0e10, employeeCount: 3800, freeCashFlow: 1.1e9, foundedYear: 2003 },
  // AWS alone doesn't trade — use Amazon's parent numbers as the proxy.
  { id: 'aws', stockTicker: 'AMZN', marketCapUsd: 1.8e12, employeeCount: 120000, freeCashFlow: 3.2e10, foundedYear: 2006 },
  // Google entity in the Glasswing seed represents Alphabet / Google Cloud.
  { id: 'google', stockTicker: 'GOOGL', marketCapUsd: 2.1e12, employeeCount: 182000, freeCashFlow: 7.2e10, foundedYear: 1998 },
  { id: 'microsoft', stockTicker: 'MSFT', marketCapUsd: 3.0e12, employeeCount: 228000, freeCashFlow: 7.5e10, foundedYear: 1975 },
  { id: 'crowdstrike', stockTicker: 'CRWD', marketCapUsd: 9.0e10, employeeCount: 8500, freeCashFlow: 1.0e9, foundedYear: 2011 },
  { id: 'carahsoft', stockTicker: null, marketCapUsd: null, employeeCount: 2200, freeCashFlow: null, foundedYear: 2004 },
  { id: 'linux-foundation', stockTicker: null, marketCapUsd: null, employeeCount: 350, freeCashFlow: null, foundedYear: 2000 },
  { id: 'jpmorgan', stockTicker: 'JPM', marketCapUsd: 6.0e11, employeeCount: 309000, freeCashFlow: null, foundedYear: 1799 },
  // U.S. government: ticker/market cap don't apply. Employee count is the
  // rough civilian + uniformed headcount.
  { id: 'dod', stockTicker: null, marketCapUsd: null, employeeCount: 2900000, freeCashFlow: null, foundedYear: 1947 },
  { id: 'doe', stockTicker: null, marketCapUsd: null, employeeCount: 14000, freeCashFlow: null, foundedYear: 1977 },
  { id: 'nnsa', stockTicker: null, marketCapUsd: null, employeeCount: 2000, freeCashFlow: null, foundedYear: 2000 },
  { id: 'gsa', stockTicker: null, marketCapUsd: null, employeeCount: 12000, freeCashFlow: null, foundedYear: 1949 },
  { id: 'llnl', stockTicker: null, marketCapUsd: null, employeeCount: 8000, freeCashFlow: null, foundedYear: 1952 },
];

async function main() {
  let updated = 0;
  let missing = 0;

  for (const f of FINANCIALS) {
    const existing = await prisma.entity.findUnique({ where: { id: f.id }, select: { id: true } });
    if (!existing) {
      console.log(`[skip] ${f.id} not in database`);
      missing++;
      continue;
    }
    await prisma.entity.update({
      where: { id: f.id },
      data: {
        stockTicker: f.stockTicker ?? null,
        marketCapUsd: f.marketCapUsd ?? null,
        employeeCount: f.employeeCount ?? null,
        freeCashFlow: f.freeCashFlow ?? null,
        foundedYear: f.foundedYear ?? null,
      },
    });
    updated++;
    console.log(`[ok] ${f.id}`);
  }

  console.log('');
  console.log(`Summary: ${updated} updated, ${missing} not found`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
