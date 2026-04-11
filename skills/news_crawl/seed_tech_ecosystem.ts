/**
 * Bulk seed for the AI / tech ecosystem (task 6).
 *
 * Reads `tech_ecosystem_seed.json` and inserts its entities + events using
 * the same deduplication semantics as `seed_glasswing.ts`:
 *   - Entity upsert by slug (also backfills financial fields from 0.1.11)
 *   - Skip if article URL already exists
 *   - Attach article to an existing event linking the same pair when the
 *     titles share a keyword
 *   - Otherwise create a new event with `category = 'news'`
 *
 * Unlike the Glasswing seed this file also populates the static financial
 * / size-factor columns (`stockTicker`, `marketCapUsd`, etc.) introduced in
 * 0.1.11, so the "Key Stats" block in the SidePanel shows something for
 * every new entity out of the box.
 *
 * Run with:  npx tsx skills/news_crawl/seed_tech_ecosystem.ts
 *
 * Safe to re-run; duplicate URLs and keyword-matched events are skipped.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface SeedEntity {
  id: string;
  name: string;
  type: string;
  homepage: string | null;
  jobPortal: string | null;
  stockTicker?: string | null;
  marketCapUsd?: number | null;
  employeeCount?: number | null;
  freeCashFlow?: number | null;
  foundedYear?: number | null;
}

interface SeedEvent {
  entity1: string;
  entity2: string;
  title: string;
  url: string;
  publishedAt: string;
  description: string;
}

interface SeedFile {
  _comment?: string;
  entities: SeedEntity[];
  events: SeedEvent[];
}

async function main() {
  const seedPath = path.join(__dirname, 'tech_ecosystem_seed.json');
  const raw = fs.readFileSync(seedPath, 'utf-8');
  const seed: SeedFile = JSON.parse(raw);

  console.log(`Loaded ${seed.entities.length} entities and ${seed.events.length} events from ${path.basename(seedPath)}`);

  // Upsert entities. `update` intentionally touches every field on this
  // seed — it's the canonical snapshot for these 22 entries. For entities
  // that *already* existed from Glasswing (anthropic, aws, etc.), we never
  // visit them in this loop because they're not in `seed.entities`, so
  // their financial fields stay put.
  let entityUpdates = 0;
  for (const e of seed.entities) {
    await prisma.entity.upsert({
      where: { id: e.id },
      create: {
        id: e.id,
        name: e.name,
        type: e.type,
        homepage: e.homepage,
        jobPortal: e.jobPortal,
        stockTicker: e.stockTicker ?? null,
        marketCapUsd: e.marketCapUsd ?? null,
        employeeCount: e.employeeCount ?? null,
        freeCashFlow: e.freeCashFlow ?? null,
        foundedYear: e.foundedYear ?? null,
      },
      update: {
        name: e.name,
        type: e.type,
        homepage: e.homepage,
        jobPortal: e.jobPortal,
        stockTicker: e.stockTicker ?? null,
        marketCapUsd: e.marketCapUsd ?? null,
        employeeCount: e.employeeCount ?? null,
        freeCashFlow: e.freeCashFlow ?? null,
        foundedYear: e.foundedYear ?? null,
      },
    });
    entityUpdates++;
  }
  console.log(`Upserted ${entityUpdates} entities`);

  let created = 0;
  let attached = 0;
  let skipped = 0;
  let missingEntity = 0;

  for (const ev of seed.events) {
    const slug1 = ev.entity1.toLowerCase().replace(/\s+/g, '-');
    const slug2 = ev.entity2.toLowerCase().replace(/\s+/g, '-');

    // Guard: if either entity isn't in the DB yet, skip with a warning so
    // the whole seed doesn't blow up on a typo.
    const [e1, e2] = await Promise.all([
      prisma.entity.findUnique({ where: { id: slug1 }, select: { id: true } }),
      prisma.entity.findUnique({ where: { id: slug2 }, select: { id: true } }),
    ]);
    if (!e1 || !e2) {
      console.log(`[skip] "${ev.title}" — missing entity ${!e1 ? slug1 : slug2}`);
      missingEntity++;
      continue;
    }

    // Skip if URL already ingested
    const existingArticle = await prisma.article.findUnique({ where: { url: ev.url } });
    if (existingArticle) {
      skipped++;
      continue;
    }

    // Look for an existing event linking these two entities with a keyword overlap
    const keywords = ev.title.split(/\s+/).filter(w => w.length > 3);
    let matchedEvent: { id: string; title: string } | null = null;

    if (keywords.length > 0) {
      const candidates = await prisma.event.findMany({
        where: {
          AND: [
            { entities: { some: { entityId: slug1 } } },
            { entities: { some: { entityId: slug2 } } },
          ],
          OR: keywords.map(kw => ({ title: { contains: kw, mode: 'insensitive' as Prisma.QueryMode } })),
        },
        take: 1,
      });
      if (candidates.length > 0) matchedEvent = candidates[0];
    }

    if (matchedEvent) {
      await prisma.article.create({
        data: {
          url: ev.url,
          title: ev.title,
          provider: ev.entity1,
          publishedAt: new Date(ev.publishedAt),
          eventId: matchedEvent.id,
        },
      });
      attached++;
      console.log(`[attach] "${ev.title}" -> existing event "${matchedEvent.title}"`);
    } else {
      const createdEvent = await prisma.event.create({
        data: {
          title: ev.title,
          date: new Date(ev.publishedAt),
          description: ev.description,
          category: 'news',
          entities: {
            createMany: {
              data: [
                { entityId: slug1, impactScore5d: 1, impactScore5w: 2 },
                { entityId: slug2, impactScore5d: 1, impactScore5w: 2 },
              ],
            },
          },
          articles: {
            create: {
              url: ev.url,
              title: ev.title,
              provider: ev.entity1,
              publishedAt: new Date(ev.publishedAt),
            },
          },
        },
      });
      created++;
      console.log(`[create] "${createdEvent.title}" (${slug1} <-> ${slug2})`);
    }
  }

  console.log('');
  console.log(`Summary: ${created} created, ${attached} attached, ${skipped} skipped (URL present), ${missingEntity} missing entity`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
