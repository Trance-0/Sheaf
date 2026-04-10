/**
 * Bulk seed for Project Glasswing events.
 *
 * Reads `glasswing_seed.json` and inserts its entities + events using the same
 * deduplication semantics as `update_news.ts`:
 *   - Entity upsert by slug
 *   - Skip if article URL already exists
 *   - Attach article to an existing event when the pair shares a keyword-match
 *   - Otherwise create a new event with its first article
 *
 * Run with:  npx tsx skills/news_crawl/seed_glasswing.ts
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
  entities: SeedEntity[];
  events: SeedEvent[];
}

async function main() {
  const seedPath = path.join(__dirname, 'glasswing_seed.json');
  const raw = fs.readFileSync(seedPath, 'utf-8');
  const seed: SeedFile = JSON.parse(raw);

  console.log(`Loaded ${seed.entities.length} entities and ${seed.events.length} events from ${path.basename(seedPath)}`);

  // Upsert entities. `update` is NOT empty — we want the seed to correct
  // previously-misclassified types and fill in homepage/jobPortal.
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
      },
      update: {
        name: e.name,
        type: e.type,
        homepage: e.homepage,
        jobPortal: e.jobPortal,
      },
    });
    entityUpdates++;
  }
  console.log(`Upserted ${entityUpdates} entities`);

  let created = 0;
  let attached = 0;
  let skipped = 0;

  for (const ev of seed.events) {
    const slug1 = ev.entity1.toLowerCase().replace(/\s+/g, '-');
    const slug2 = ev.entity2.toLowerCase().replace(/\s+/g, '-');

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
      const created_event = await prisma.event.create({
        data: {
          title: ev.title,
          date: new Date(ev.publishedAt),
          description: ev.description,
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
      console.log(`[create] "${created_event.title}" (${slug1} <-> ${slug2})`);
    }
  }

  console.log('');
  console.log(`Summary: ${created} created, ${attached} attached, ${skipped} skipped (URL already present)`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
