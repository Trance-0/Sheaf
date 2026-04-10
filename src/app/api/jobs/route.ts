import { NextResponse } from 'next/server';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/jobs?agency=<slug>&yoeMin=0&yoeMax=20&q=<keyword>
// Returns job events (events with exactly one agency-typed entity). Each event
// maps 1:1 to a job posting for now; when an `Event.category` column lands we
// will switch to that explicit filter.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const agency = searchParams.get("agency")?.toLowerCase().trim() || null;
  const q = searchParams.get("q")?.trim() || null;
  const yoeMinRaw = searchParams.get("yoeMin");
  const yoeMaxRaw = searchParams.get("yoeMax");
  const yoeMin = yoeMinRaw !== null && yoeMinRaw !== "" ? parseInt(yoeMinRaw, 10) : null;
  const yoeMax = yoeMaxRaw !== null && yoeMaxRaw !== "" ? parseInt(yoeMaxRaw, 10) : null;

  // Base filter: events whose entities include an agency-typed entity.
  const where: Prisma.EventWhereInput = {
    entities: {
      some: {
        entity: {
          type: "agency",
          ...(agency ? { id: agency } : {}),
        },
      },
    },
  };

  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const events = await prisma.event.findMany({
    where,
    include: {
      entities: { include: { entity: true } },
      articles: true,
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  // Keep only events whose single-entity or primary entity is an agency (job postings).
  const jobEvents = events.filter(ev => ev.entities.some(ee => ee.entity.type === "agency"));

  // YOE is stored in free text (title/description). Parse with a small regex and filter.
  const yoeRegex = /(\d+)\+?\s*(?:-\s*(\d+)\s*)?(?:years?|yrs?|yoe)/i;
  const withYoe = jobEvents.map(ev => {
    const haystack = `${ev.title} ${ev.description ?? ""}`;
    const m = haystack.match(yoeRegex);
    const yoe = m ? parseInt(m[1], 10) : null;
    const yoeMaxParsed = m && m[2] ? parseInt(m[2], 10) : yoe;
    return { ev, yoe, yoeMaxParsed };
  });

  const filtered = withYoe.filter(({ yoe, yoeMaxParsed }) => {
    if (yoeMin === null && yoeMax === null) return true;
    if (yoe === null) return false; // no YOE found, drop when filter active
    if (yoeMin !== null && (yoeMaxParsed ?? yoe) < yoeMin) return false;
    if (yoeMax !== null && yoe > yoeMax) return false;
    return true;
  });

  return NextResponse.json({
    jobs: filtered.map(({ ev, yoe }) => ({
      id: ev.id,
      title: ev.title,
      date: ev.date,
      description: ev.description,
      yoe,
      agencies: ev.entities
        .filter(ee => ee.entity.type === "agency")
        .map(ee => ({ id: ee.entity.id, name: ee.entity.name, jobPortal: ee.entity.jobPortal })),
      articles: ev.articles.map(a => ({ id: a.id, url: a.url, title: a.title, provider: a.provider })),
    })),
    totalCount: filtered.length,
  });
}
