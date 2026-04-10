import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Usage:
  npx tsx skills/job_crawl/update_jobs.ts add-job <agencyName> <jobTitle> <url> <publishedAt> [description]
  npx tsx skills/job_crawl/update_jobs.ts list-events
  npx tsx skills/job_crawl/update_jobs.ts list-entities
    `);
    process.exit(0);
  }

  if (command === 'add-job') {
    const [_, agencyName, jobTitle, url, publishedAt, description] = args;
    if (!agencyName || !jobTitle || !url || !publishedAt) {
      console.error("Error: Missing required arguments. Expected: agencyName, jobTitle, url, publishedAt");
      process.exit(1);
    }

    const agencySlug = agencyName.replace(/\s+/g, '-').toLowerCase();

    // Step 1: Upsert Entity
    const agency = await prisma.entity.upsert({
      where: { id: agencySlug },
      update: {},
      create: {
        id: agencySlug,
        name: agencyName,
        type: 'agency',
        description: 'Recruiting Agency',
      },
    });

    // Step 2: Check for duplicate article URL
    const existingArticle = await prisma.article.findUnique({ where: { url } });
    if (existingArticle) {
      console.log(`Article with URL already exists (id: ${existingArticle.id}). Skipping duplicate.`);
      if (existingArticle.eventId) {
        console.log(`  Linked to event: ${existingArticle.eventId}`);
      }
      return;
    }

    // Step 3: Probe for existing similar event by keyword matching
    const keywords = jobTitle.split(/\s+/).filter(w => w.length > 3);
    let matchedEvent: { id: string; title: string } | null = null;

    if (keywords.length > 0) {
      const existing = await prisma.event.findMany({
        where: {
          entities: { some: { entityId: agencySlug } },
          OR: keywords.map(kw => ({ title: { contains: kw, mode: 'insensitive' as Prisma.QueryMode } })),
        },
        take: 1,
      });
      if (existing.length > 0) {
        matchedEvent = existing[0];
      }
    }

    if (matchedEvent) {
      // Step 4a: Existing event found — attach article as additional source
      await prisma.article.create({
        data: {
          url,
          title: jobTitle,
          provider: agency.name,
          publishedAt: new Date(publishedAt),
          eventId: matchedEvent.id,
        },
      });
      console.log(`Matched existing event "${matchedEvent.title}" (${matchedEvent.id}). Added article as reference.`);
    } else {
      // Step 4b: No match — create new event + article
      const event = await prisma.event.create({
        data: {
          title: jobTitle,
          date: new Date(publishedAt),
          description: description || '',
          entities: {
            create: {
              entityId: agency.id,
              impactScore5d: 1,
              impactScore5w: 2,
            },
          },
          articles: {
            create: {
              url,
              title: jobTitle,
              provider: agency.name,
              publishedAt: new Date(publishedAt),
            },
          },
        },
      });
      console.log(`Created new event: "${event.title}" connected to ${agency.name}`);
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
