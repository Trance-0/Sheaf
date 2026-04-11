import type { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { createPrismaFromRequest } from "@/lib/server/prismaFromRequest";
import { backendUpgradeResponse } from "@/lib/server/backendErrors";

export async function GET(req: Request) {
  let prisma: PrismaClient | undefined;
  try {
    prisma = createPrismaFromRequest(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id")?.toLowerCase();

    if (!id) {
      return NextResponse.json({ error: "id query param required" }, { status: 400 });
    }

    const entity = await prisma.entity.findUnique({
      where: { id },
      include: {
        aliases: true,
        snapshots: { orderBy: { date: "desc" }, take: 1 },
        events: {
          include: {
            event: {
              include: {
                _count: { select: { articles: true } },
                articles: {
                  orderBy: { publishedAt: "desc" },
                  take: 1,
                  select: { url: true, title: true, provider: true },
                },
              },
            },
          },
          orderBy: { event: { date: "desc" } },
          take: 30,
        },
      },
    });

    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    type EventEntityRow = typeof entity.events[number];
    type AliasRow = typeof entity.aliases[number];

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

    const recentEvents = entity.events
      .filter((ee: EventEntityRow) => ee.event.category !== "job")
      .slice(0, 10)
      .map(toSummary);
    const recentJobs = entity.events
      .filter((ee: EventEntityRow) => ee.event.category === "job")
      .slice(0, 10)
      .map(toSummary);

    return NextResponse.json({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      description: entity.description,
      homepage: entity.homepage,
      jobPortal: entity.jobPortal,
      stockTicker: entity.stockTicker,
      marketCapUsd: entity.marketCapUsd,
      employeeCount: entity.employeeCount,
      freeCashFlow: entity.freeCashFlow,
      foundedYear: entity.foundedYear,
      aliases: entity.aliases.map((alias: AliasRow) => alias.alias),
      latestSnapshot: entity.snapshots[0] ?? null,
      recentEvents,
      recentJobs,
    });
  } catch (error) {
    const upgrade = backendUpgradeResponse(error);
    if (upgrade) return upgrade;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load node" },
      { status: 400 },
    );
  } finally {
    await prisma?.$disconnect();
  }
}

export async function PATCH(req: Request) {
  let prisma: PrismaClient | undefined;
  try {
    prisma = createPrismaFromRequest(req);
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

    const data: Record<string, string | null> = {};
    if (homepage !== undefined) data.homepage = homepage?.trim() ? homepage.trim() : null;
    if (jobPortal !== undefined) data.jobPortal = jobPortal?.trim() ? jobPortal.trim() : null;
    if (description !== undefined) data.description = description?.trim() ? description.trim() : null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "no editable fields supplied" }, { status: 400 });
    }

    for (const key of ["homepage", "jobPortal"] as const) {
      const value = data[key];
      if (typeof value === "string") {
        try {
          const url = new URL(value);
          if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("bad protocol");
        } catch {
          return NextResponse.json({ error: `${key} must be a valid http(s) URL` }, { status: 400 });
        }
      }
    }

    const updated = await prisma.entity.update({
      where: { id },
      data,
      select: { id: true, name: true, homepage: true, jobPortal: true, description: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    const upgrade = backendUpgradeResponse(error);
    if (upgrade) return upgrade;
    const message = error instanceof Error ? error.message : "Entity not found";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  } finally {
    await prisma?.$disconnect();
  }
}
