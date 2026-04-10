import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
Usage:
  npx tsx scripts/update_jobs.ts add-job <agencyName> <jobTitle> <url> <publishedAt> [description]
  npx tsx scripts/update_jobs.ts list-jobs
    `);
    process.exit(0);
  }

  if (command === 'add-job') {
    const [_, agencyName, jobTitle, url, publishedAt, description] = args;
    if (!agencyName || !jobTitle || !url || !publishedAt) {
      console.error("Error: Missing required arguments. Expected: agencyName, jobTitle, url, publishedAt");
      process.exit(1);
    }

    // Upsert Agency (Entity)
    const agency = await prisma.entity.upsert({
      where: { id: agencyName.replace(/\s+/g, '-').toLowerCase() },
      update: {},
      create: {
        id: agencyName.replace(/\s+/g, '-').toLowerCase(),
        name: agencyName,
        type: 'agency',
        description: 'Recruiting Agency',
      }
    });

    // Create Event (Job Posting)
    const event = await prisma.event.create({
      data: {
        title: jobTitle,
        date: new Date(publishedAt),
        description: description || '',
        entities: {
          create: {
            entityId: agency.id,
            impactScore5d: 1, // default positive momentum for new job
            impactScore5w: 2,
          }
        },
        articles: {
          create: {
            url: url,
            title: jobTitle,
            provider: agency.name,
            publishedAt: new Date(publishedAt),
          }
        }
      }
    });

    console.log(`Successfully added job posting: ${event.title} connected to ${agency.name}`);
  } else if (command === 'list-jobs') {
    const jobs = await prisma.event.findMany({
      include: {
        entities: { include: { entity: true } },
        articles: true
      }
    });
    console.log(JSON.stringify(jobs, null, 2));
  } else {
    console.error(`Unknown command: ${command}`);
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
