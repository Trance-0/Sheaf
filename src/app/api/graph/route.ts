import type { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { createPrismaFromRequest } from "@/lib/server/prismaFromRequest";

interface GraphNode {
  id: string;
  label: string;
  homepage: string | null;
  jobPortal: string | null;
  score: number;
  eventCount: number;
  marketCapUsd: number | null;
  employeeCount: number | null;
  freeCashFlow: number | null;
}

interface GraphEdgeEvent {
  id: string;
  title: string;
  date: Date;
  description: string | null;
  articleCount: number;
}

export async function GET(req: Request) {
  let prisma: PrismaClient | undefined;
  try {
    prisma = createPrismaFromRequest(req);
    const { searchParams } = new URL(req.url);
    const kind = (searchParams.get("kind") ?? "all") as "all" | "news" | "job";

    // Date range: explicit start/end (ISO YYYY-MM-DD) replaces the 0.1.11
    // `days=<N>` cutoff. If neither is provided we default to the last
    // 1 year ending today, which matches the `defaultDateRange()` on the
    // frontend.
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");

    const end = endParam ? new Date(endParam) : new Date();
    const start = startParam
      ? new Date(startParam)
      : (() => {
          const d = new Date(end);
          d.setFullYear(d.getFullYear() - 1);
          return d;
        })();

    // Guard against invalid dates. Prisma will happily accept an Invalid
    // Date and return nothing — easier to surface a 400 here.
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json(
        { error: "Invalid start/end date. Expected ISO YYYY-MM-DD." },
        { status: 400 },
      );
    }

    const events = await prisma.event.findMany({
      where: {
        date: { gte: start, lte: end },
        ...(kind !== "all" ? { category: kind } : {}),
      },
      include: {
        entities: { include: { entity: true } },
        articles: true,
      },
    });

    const nodesMap = new Map<string, GraphNode>();
    const edgeBuckets = new Map<string, { source: string; target: string; events: GraphEdgeEvent[]; totalWeight: number; impact: string }>();

    for (const event of events) {
      const ees = event.entities;

      for (const ee of ees) {
        const id = ee.entity.id.toLowerCase();
        if (!nodesMap.has(id)) {
          nodesMap.set(id, {
            id,
            label: ee.entity.name,
            homepage: ee.entity.homepage,
            jobPortal: ee.entity.jobPortal,
            score: ee.impactScore5w ?? 0,
            eventCount: 1,
            marketCapUsd: ee.entity.marketCapUsd ?? null,
            employeeCount: ee.entity.employeeCount ?? null,
            freeCashFlow: ee.entity.freeCashFlow ?? null,
          });
        } else {
          const existing = nodesMap.get(id)!;
          existing.eventCount += 1;
          existing.score += ee.impactScore5w ?? 0;
        }
      }

      for (let i = 0; i < ees.length; i++) {
        for (let j = i + 1; j < ees.length; j++) {
          const a = ees[i].entity.id.toLowerCase();
          const b = ees[j].entity.id.toLowerCase();
          const [source, target] = [a, b].sort();
          const key = `${source}||${target}`;

          const weight = Math.abs(ees[i].impactScore5w ?? 1) + Math.abs(ees[j].impactScore5w ?? 1);
          const impact = (ees[i].impactScore5w ?? 0) + (ees[j].impactScore5w ?? 0) > 0
            ? "positive"
            : (ees[i].impactScore5w ?? 0) + (ees[j].impactScore5w ?? 0) < 0
              ? "negative"
              : "neutral";

          if (!edgeBuckets.has(key)) {
            edgeBuckets.set(key, { source, target, events: [], totalWeight: 0, impact });
          }

          const bucket = edgeBuckets.get(key)!;
          bucket.totalWeight += weight;
          bucket.events.push({
            id: event.id,
            title: event.title,
            date: event.date,
            description: event.description,
            articleCount: event.articles.length,
          });
        }
      }
    }

    const edges = Array.from(edgeBuckets.values()).map((bucket) => ({
      id: `${bucket.source}||${bucket.target}`,
      source: bucket.source,
      target: bucket.target,
      weight: bucket.totalWeight,
      impact: bucket.impact,
      eventCount: bucket.events.length,
      events: bucket.events,
    }));

    return NextResponse.json({
      nodes: Array.from(nodesMap.values()),
      edges,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load graph" },
      { status: 400 },
    );
  } finally {
    await prisma?.$disconnect();
  }
}
