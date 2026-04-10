import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// GET /api/edge?source=X&target=Y — returns events and their articles for a pair of entities
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source")?.toLowerCase();
  const target = searchParams.get("target")?.toLowerCase();

  if (!source || !target) {
    return NextResponse.json({ error: "source and target query params required" }, { status: 400 });
  }

  // Find all events that have BOTH entities linked
  const events = await prisma.event.findMany({
    where: {
      AND: [
        { entities: { some: { entityId: source } } },
        { entities: { some: { entityId: target } } },
      ],
    },
    include: {
      articles: { orderBy: { publishedAt: 'desc' } },
      entities: { include: { entity: true } },
    },
    orderBy: { date: 'desc' },
  });

  const result = events.map(event => ({
    id: event.id,
    title: event.title,
    date: event.date,
    description: event.description,
    impactScores: event.entities.map(ee => ({
      entity: ee.entity.name,
      s5d: ee.impactScore5d,
      s5w: ee.impactScore5w,
      s5m: ee.impactScore5m,
      s5y: ee.impactScore5y,
    })),
    articles: event.articles.map(a => ({
      id: a.id,
      title: a.title,
      url: a.url,
      provider: a.provider,
      publishedAt: a.publishedAt,
    })),
  }));

  return NextResponse.json({ source, target, events: result });
}
