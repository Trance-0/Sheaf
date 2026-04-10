import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const daysParam = searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : 30;

  // Filter by date dynamically 
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const events = await prisma.event.findMany({
    where: {
       date: { gte: cutoffDate }
    },
    include: {
      entities: { include: { entity: true } }
    }
  });

  const nodesMap = new Map();
  const edges: any[] = [];

  events.forEach(event => {
    const eventEntities = event.entities;
    eventEntities.forEach(ee => {
      // Normalize casing using toLowerCase internally to fight duplicates visual output
      const cleanId = ee.entity.id.toLowerCase();
      if (!nodesMap.has(cleanId)) {
        nodesMap.set(cleanId, {
          id: cleanId,
          label: ee.entity.name,
          score: ee.impactScore5w || 1,
          size: 15 // base size
        });
      } else {
        nodesMap.get(cleanId).size += 5;
      }
    });

    if (event.title.includes("Glasswing") || event.title.includes("Glasswings")) {
       eventEntities.forEach(ee => {
          if (!ee.entity.name.toLowerCase().includes("anthropic")) {
             edges.push({
               id: event.id,
               source: "anthropic",
               target: ee.entity.id.toLowerCase(),
               impact: "positive"
             });
          }
       });
    }

    for (let i = 0; i < eventEntities.length; i++) {
       for (let j = i + 1; j < eventEntities.length; j++) {
          edges.push({
             id: event.id,
             source: eventEntities[i].entity.id.toLowerCase(),
             target: eventEntities[j].entity.id.toLowerCase(),
             impact: (eventEntities[i].impactScore5w ?? 0) > 0 ? "positive" : "neutral"
          });
       }
    }
  });

  return NextResponse.json({
    nodes: Array.from(nodesMap.values()),
    edges
  });
}
