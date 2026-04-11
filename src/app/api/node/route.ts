import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/node?id=X — returns entity details (homepage, job portal, description)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.toLowerCase();

  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  const entity = await prisma.entity.findUnique({
    where: { id },
    include: {
      aliases: true,
      snapshots: { orderBy: { date: 'desc' }, take: 1 },
      // Pull everything once, sort client-side by date, split news vs job
      // by category. We cap to 30 total so a chatty agency doesn't flood
      // either tab — UI shows both in their own scrollable lists.
      events: {
        include: {
          event: {
            include: {
              _count: { select: { articles: true } },
              // Grab the newest article for the "click title to open source"
              // shortcut in the SidePanel — we only need its URL + title.
              articles: {
                orderBy: { publishedAt: 'desc' },
                take: 1,
                select: { url: true, title: true, provider: true },
              },
            },
          },
        },
        orderBy: { event: { date: 'desc' } },
        take: 30,
      },
    },
  });

  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  // Shape a single EventEntity row into the summarized payload the
  // SidePanel consumes. Shared between the news and job buckets.
  type EventEntityRow = typeof entity.events[number];
  const toSummary = (ee: EventEntityRow) => ({
    eventId: ee.event.id,
    title: ee.event.title,
    date: ee.event.date,
    description: ee.event.description,
    articleCount: ee.event._count.articles,
    primaryArticleUrl: ee.event.articles[0]?.url ?? null,
    primaryArticleTitle: ee.event.articles[0]?.title ?? null,
    primaryArticleProvider: ee.event.articles[0]?.provider ?? null,
    impact5d: ee.impactScore5d,
    impact5w: ee.impactScore5w,
  });

  // Anything not explicitly tagged 'job' falls into the news bucket — this
  // keeps legacy events (pre-0.1.11 category migration edge cases) visible.
  const recentEvents = entity.events
    .filter(ee => ee.event.category !== 'job')
    .slice(0, 10)
    .map(toSummary);
  const recentJobs = entity.events
    .filter(ee => ee.event.category === 'job')
    .slice(0, 10)
    .map(toSummary);

  return NextResponse.json({
    id: entity.id,
    name: entity.name,
    type: entity.type,
    description: entity.description,
    homepage: entity.homepage,
    jobPortal: entity.jobPortal,
    // Static financial / size-factor fields shown in the stats panel.
    stockTicker: entity.stockTicker,
    marketCapUsd: entity.marketCapUsd,
    employeeCount: entity.employeeCount,
    freeCashFlow: entity.freeCashFlow,
    foundedYear: entity.foundedYear,
    aliases: entity.aliases.map(a => a.alias),
    latestSnapshot: entity.snapshots[0] ?? null,
    recentEvents,
    recentJobs,
  });
}

// PATCH /api/node?id=X — update editable entity fields (homepage, jobPortal, description)
export async function PATCH(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.toLowerCase();

  if (!id) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { homepage, jobPortal, description } = (body ?? {}) as {
    homepage?: string | null;
    jobPortal?: string | null;
    description?: string | null;
  };

  // Normalize empty strings to null so clearing a field actually clears it.
  const data: Record<string, string | null> = {};
  if (homepage !== undefined) data.homepage = homepage?.trim() ? homepage.trim() : null;
  if (jobPortal !== undefined) data.jobPortal = jobPortal?.trim() ? jobPortal.trim() : null;
  if (description !== undefined) data.description = description?.trim() ? description.trim() : null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no editable fields supplied" }, { status: 400 });
  }

  // Validate URL fields — reject anything that isn't http(s).
  for (const key of ["homepage", "jobPortal"] as const) {
    const v = data[key];
    if (typeof v === "string") {
      try {
        const u = new URL(v);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
      } catch {
        return NextResponse.json({ error: `${key} must be a valid http(s) URL` }, { status: 400 });
      }
    }
  }

  try {
    const updated = await prisma.entity.update({
      where: { id },
      data,
      select: { id: true, name: true, homepage: true, jobPortal: true, description: true },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }
}
