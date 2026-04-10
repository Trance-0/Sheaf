import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const daysParam = searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : 30;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const events = await prisma.event.findMany({
    where: { date: { gte: cutoffDate } },
    include: {
      entities: { include: { entity: true } },
      articles: true,
    },
  });

  const nodesMap = new Map<string, any>();
  // Key: "source||target" (sorted), Value: { events[], totalWeight }
  const edgeBuckets = new Map<string, { source: string; target: string; events: any[]; totalWeight: number; impact: string }>();

  for (const event of events) {
    const ees = event.entities;

    // Build nodes from entities
    for (const ee of ees) {
      const id = ee.entity.id.toLowerCase();
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id,
          label: ee.entity.name,
          homepage: ee.entity.homepage,
          jobPortal: ee.entity.jobPortal,
          score: ee.impactScore5w ?? 0,
          size: 15,
        });
      } else {
        const existing = nodesMap.get(id)!;
        existing.size += 3;
        existing.score += (ee.impactScore5w ?? 0);
      }
    }

    // Build pairwise edges — each maps to this event
    for (let i = 0; i < ees.length; i++) {
      for (let j = i + 1; j < ees.length; j++) {
        const a = ees[i].entity.id.toLowerCase();
        const b = ees[j].entity.id.toLowerCase();
        const [source, target] = [a, b].sort();
        const key = `${source}||${target}`;

        const weight = Math.abs(ees[i].impactScore5w ?? 1) + Math.abs(ees[j].impactScore5w ?? 1);
        const impact = ((ees[i].impactScore5w ?? 0) + (ees[j].impactScore5w ?? 0)) > 0
          ? "positive"
          : ((ees[i].impactScore5w ?? 0) + (ees[j].impactScore5w ?? 0)) < 0
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

  // Build final edges array — one visual edge per entity-pair
  const edges = Array.from(edgeBuckets.values()).map(b => ({
    id: `${b.source}||${b.target}`,
    source: b.source,
    target: b.target,
    weight: b.totalWeight,
    impact: b.impact,
    eventCount: b.events.length,
    events: b.events,
  }));

  return NextResponse.json({
    nodes: Array.from(nodesMap.values()),
    edges,
  });
}
