import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET() {
  const events = await prisma.event.findMany({
    include: {
      entities: { include: { entity: true } }
    }
  });

  const nodesMap = new Map();
  const edges: any[] = [];

  // Seed default items in case DB is fresh
  const defaultNodes = [
    { id: "Anthropic", label: "Anthropic", size: 25, score: 5 },
    { id: "OpenAI", label: "OpenAI", size: 20, score: -2 },
    { id: "Microsoft", label: "Microsoft", size: 30, score: 1 },
    { id: "Google", label: "Google", size: 22, score: 3 },
    { id: "SEC", label: "SEC", size: 15, score: -5 },
  ];
  defaultNodes.forEach(n => nodesMap.set(n.id, n));

  const defaultEdges = [
    { id: "e1", source: "Anthropic", target: "Google", impact: "positive" },
    { id: "e2", source: "Microsoft", target: "OpenAI", impact: "neutral" },
    { id: "e3", source: "OpenAI", target: "SEC", impact: "negative" }
  ];
  defaultEdges.forEach(e => edges.push(e));

  // Merge with real DB
  events.forEach(event => {
    const eventEntities = event.entities;
    eventEntities.forEach(ee => {
      if (!nodesMap.has(ee.entity.id)) {
        nodesMap.set(ee.entity.id, {
          id: ee.entity.id,
          label: ee.entity.name,
          score: ee.impactScore5w || 1,
          size: 15 // base size
        });
      } else {
        // increase size based on frequency
        nodesMap.get(ee.entity.id).size += 5;
      }
    });

    // Pairwise edges for entities in same event (or link to Anthropic if related to Glasswings)
    if (event.title.includes("Glasswing") || event.title.includes("Glasswings")) {
       const hasAnthropic = eventEntities.some(e => e.entity.name.includes("Anthropic"));
       eventEntities.forEach(ee => {
          if (!ee.entity.name.includes("Anthropic")) {
             edges.push({
               id: event.id + "-" + ee.entity.id,
               source: "Anthropic",
               target: ee.entity.id,
               impact: "positive"
             });
          }
       });
    }

    for (let i = 0; i < eventEntities.length; i++) {
       for (let j = i + 1; j < eventEntities.length; j++) {
          edges.push({
             id: event.id + "-" + i + "-" + j,
             source: eventEntities[i].entity.id,
             target: eventEntities[j].entity.id,
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
