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
      events: {
        include: { event: { include: { _count: { select: { articles: true } } } } },
        orderBy: { event: { date: 'desc' } },
        take: 10,
      },
    },
  });

  if (!entity) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: entity.id,
    name: entity.name,
    type: entity.type,
    description: entity.description,
    homepage: entity.homepage,
    jobPortal: entity.jobPortal,
    aliases: entity.aliases.map(a => a.alias),
    latestSnapshot: entity.snapshots[0] ?? null,
    recentEvents: entity.events.map(ee => ({
      eventId: ee.event.id,
      title: ee.event.title,
      date: ee.event.date,
      articleCount: ee.event._count.articles,
      impact5d: ee.impactScore5d,
      impact5w: ee.impactScore5w,
    })),
  });
}
