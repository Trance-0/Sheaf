import type { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { createPrismaFromRequest } from "@/lib/server/prismaFromRequest";
import { backendUpgradeResponse } from "@/lib/server/backendErrors";

export async function GET(req: Request) {
  let prisma: PrismaClient | undefined;
  try {
    prisma = createPrismaFromRequest(req);
    const { searchParams } = new URL(req.url);
    const agency = searchParams.get("agency")?.toLowerCase().trim() || null;
    const q = searchParams.get("q")?.trim() || null;
    const yoeMinRaw = searchParams.get("yoeMin");
    const yoeMaxRaw = searchParams.get("yoeMax");
    const yoeMin = yoeMinRaw !== null && yoeMinRaw !== "" ? parseInt(yoeMinRaw, 10) : null;
    const yoeMax = yoeMaxRaw !== null && yoeMaxRaw !== "" ? parseInt(yoeMaxRaw, 10) : null;

    const where = {
      entities: {
        some: {
          entity: {
            type: "agency",
            ...(agency ? { id: agency } : {}),
          },
        },
      },
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const events = await prisma.event.findMany({
      where,
      include: {
        entities: { include: { entity: true } },
        articles: true,
      },
      orderBy: { date: "desc" },
      take: 200,
    });

    type JobEvent = (typeof events)[number];
    type EventEntity = JobEvent["entities"][number];
    type EventArticle = JobEvent["articles"][number];

    const jobEvents = events.filter((event: JobEvent) => event.entities.some((ee: EventEntity) => ee.entity.type === "agency"));
    const yoeRegex = /(\d+)\+?\s*(?:-\s*(\d+)\s*)?(?:years?|yrs?|yoe)/i;
    const withYoe: { event: JobEvent; yoe: number | null; yoeMaxParsed: number | null }[] = jobEvents.map((event: JobEvent) => {
      const haystack = `${event.title} ${event.description ?? ""}`;
      const match = haystack.match(yoeRegex);
      const yoe = match ? parseInt(match[1], 10) : null;
      const yoeMaxParsed = match && match[2] ? parseInt(match[2], 10) : yoe;
      return { event, yoe, yoeMaxParsed };
    });

    const filtered = withYoe.filter(({ yoe, yoeMaxParsed }) => {
      if (yoeMin === null && yoeMax === null) return true;
      if (yoe === null) return false;
      if (yoeMin !== null && (yoeMaxParsed ?? yoe) < yoeMin) return false;
      if (yoeMax !== null && yoe > yoeMax) return false;
      return true;
    });

    return NextResponse.json({
      jobs: filtered.map(({ event, yoe }: { event: JobEvent; yoe: number | null }) => ({
        id: event.id,
        title: event.title,
        date: event.date,
        description: event.description,
        yoe,
        agencies: event.entities
          .filter((ee: EventEntity) => ee.entity.type === "agency")
          .map((ee: EventEntity) => ({ id: ee.entity.id, name: ee.entity.name, jobPortal: ee.entity.jobPortal })),
        articles: event.articles.map((article: EventArticle) => ({
          id: article.id,
          url: article.url,
          title: article.title,
          provider: article.provider,
        })),
      })),
      totalCount: filtered.length,
    });
  } catch (error) {
    const upgrade = backendUpgradeResponse(error);
    if (upgrade) return upgrade;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load jobs" },
      { status: 400 },
    );
  } finally {
    await prisma?.$disconnect();
  }
}
