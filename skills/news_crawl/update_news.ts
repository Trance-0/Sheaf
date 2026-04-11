import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Usage:
  npx tsx skills/news_crawl/update_news.ts add-news <entityName1> <entityName2> <eventTitle> <url> <publishedAt> [description]
  npx tsx skills/news_crawl/update_news.ts list-events
  npx tsx skills/news_crawl/update_news.ts list-entities
    `);
    process.exit(0);
  }

  if (command === 'add-news') {
    const [_, entity1Name, entity2Name, eventTitle, url, publishedAt, description] = args;
    if (!entity1Name || !entity2Name || !eventTitle || !url || !publishedAt) {
      console.error("Error: Missing required arguments. Expected: entity1, entity2, eventTitle, url, publishedAt");
      process.exit(1);
    }

    const slug1 = entity1Name.replace(/\s+/g, '-').toLowerCase();
    const slug2 = entity2Name.replace(/\s+/g, '-').toLowerCase();

    // Upsert both entities
    const e1 = await prisma.entity.upsert({
      where: { id: slug1 },
      update: {},
      create: { id: slug1, name: entity1Name, type: 'company' },
    });
    const e2 = await prisma.entity.upsert({
      where: { id: slug2 },
      update: {},
      create: { id: slug2, name: entity2Name, type: 'company' },
    });

    // Check for duplicate article URL
    const existingArticle = await prisma.article.findUnique({ where: { url } });
    if (existingArticle) {
      console.log(`Article with URL already exists (id: ${existingArticle.id}). Skipping duplicate.`);
      return;
    }

    // Probe for existing event linking these two entities with similar title
    const keywords = eventTitle.split(/\s+/).filter(w => w.length > 3);
    let matchedEvent: { id: string; title: string } | null = null;

    if (keywords.length > 0) {
      const existing = await prisma.event.findMany({
        where: {
          AND: [
            { entities: { some: { entityId: slug1 } } },
            { entities: { some: { entityId: slug2 } } },
          ],
          OR: keywords.map(kw => ({ title: { contains: kw, mode: 'insensitive' as Prisma.QueryMode } })),
        },
        take: 1,
      });
      if (existing.length > 0) matchedEvent = existing[0];
    }

    if (matchedEvent) {
      await prisma.article.create({
        data: {
          url,
          title: eventTitle,
          provider: entity1Name,
          publishedAt: new Date(publishedAt),
          eventId: matchedEvent.id,
        },
      });
      console.log(`Matched existing event "${matchedEvent.title}". Added article as reference.`);
    } else {
      const event = await prisma.event.create({
        data: {
          title: eventTitle,
          date: new Date(publishedAt),
          description: description || '',
          category: 'news',
          entities: {
            createMany: {
              data: [
                { entityId: e1.id, impactScore5d: 1, impactScore5w: 1 },
                { entityId: e2.id, impactScore5d: 1, impactScore5w: 1 },
              ],
            },
          },
          articles: {
            create: {
              url,
              title: eventTitle,
              provider: entity1Name,
              publishedAt: new Date(publishedAt),
            },
          },
        },
      });
      console.log(`Created new event: "${event.title}" linking ${e1.name} ↔ ${e2.name}`);
    }

  } else if (command === 'list-events') {
    const events = await prisma.event.findMany({
      include: {
        entities: { include: { entity: true } },
        articles: true,
      },
      orderBy: { date: 'desc' },
    });
    for (const ev of events) {
      const entities = ev.entities.map(ee => ee.entity.name).join(', ');
      console.log(`[${ev.date.toISOString().split('T')[0]}] ${ev.title} (${entities}) — ${ev.articles.length} article(s)`);
    }

  } else if (command === 'list-entities') {
    const entities = await prisma.entity.findMany({
      include: { _count: { select: { events: true } } },
    });
    for (const e of entities) {
      console.log(`${e.id} | ${e.name} (${e.type}) — ${e._count.events} event link(s) | homepage: ${e.homepage || 'n/a'} | jobs: ${e.jobPortal || 'n/a'}`);
    }

  } else {
    console.error(`Unknown command: ${command}. Run with --help for usage.`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
