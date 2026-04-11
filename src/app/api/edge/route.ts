import type { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { createPrismaFromRequest } from "@/lib/server/prismaFromRequest";

export async function GET(req: Request) {
  let prisma: PrismaClient | undefined;
  try {
    prisma = createPrismaFromRequest(req);
    const { searchParams } = new URL(req.url);
    const source = searchParams.get("source")?.toLowerCase();
    const target = searchParams.get("target")?.toLowerCase();

    if (!source || !target) {
      return NextResponse.json({ error: "source and target query params required" }, { status: 400 });
    }

    const events = await prisma.event.findMany({
      where: {
        AND: [
          { entities: { some: { entityId: source } } },
          { entities: { some: { entityId: target } } },
        ],
      },
      include: {
        articles: { orderBy: { publishedAt: "desc" } },
        entities: { include: { entity: true } },
      },
      orderBy: { date: "desc" },
    });

    type EdgeEvent = (typeof events)[number];
    type EdgeEntity = EdgeEvent["entities"][number];
    type EdgeArticle = EdgeEvent["articles"][number];

    const result = events.map((event: EdgeEvent) => ({
      id: event.id,
      title: event.title,
      date: event.date,
      description: event.description,
      impactScores: event.entities.map((ee: EdgeEntity) => ({
        entity: ee.entity.name,
        s5d: ee.impactScore5d,
        s5w: ee.impactScore5w,
        s5m: ee.impactScore5m,
        s5y: ee.impactScore5y,
      })),
      articles: event.articles.map((article: EdgeArticle) => ({
        id: article.id,
        title: article.title,
        url: article.url,
        provider: article.provider,
        publishedAt: article.publishedAt,
      })),
    }));

    return NextResponse.json({ source, target, events: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load edge details" },
      { status: 400 },
    );
  } finally {
    await prisma?.$disconnect();
  }
}
