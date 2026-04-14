"use client";

import { createSql, withDriftDispatch } from "@/lib/client/neon";

/**
 * v0.1.21 — client-side replacement for the old `GET /api/graph` route.
 *
 * The server used Prisma with nested `include` to fetch events with
 * entities and articles, then aggregated into nodes + edges in JS.
 * Here we do the same aggregation on the client, after a single
 * flat SQL query that joins event → event_entity → entity and counts
 * articles per event. Keeping the aggregation in JS preserves the
 * exact shape the consumers expect.
 */

export interface GraphNode {
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

export interface GraphEdgeEvent {
  id: string;
  title: string;
  date: string;
  description: string | null;
  articleCount: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  impact: "positive" | "negative" | "neutral";
  eventCount: number;
  events: GraphEdgeEvent[];
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface FetchGraphArgs {
  databaseUrl: string;
  start: Date;
  end: Date;
  kind: "all" | "news" | "job";
}

interface FlatRow {
  event_id: string;
  event_title: string;
  event_date: string | Date;
  event_description: string | null;
  event_article_count: number | string;
  entity_id: string;
  entity_name: string;
  entity_homepage: string | null;
  entity_job_portal: string | null;
  entity_market_cap_usd: number | null;
  entity_employee_count: number | null;
  entity_free_cash_flow: number | null;
  impact_score_5w: number | null;
}

export async function fetchGraph({
  databaseUrl,
  start,
  end,
  kind,
}: FetchGraphArgs): Promise<GraphPayload> {
  return withDriftDispatch(async () => {
    const sql = createSql(databaseUrl);
    const params: unknown[] = [start.toISOString(), end.toISOString()];
    let categoryClause = "";
    if (kind !== "all") {
      params.push(kind);
      categoryClause = `AND e."category" = $${params.length}`;
    }

    const text = `
      SELECT
        e."id"                       AS event_id,
        e."title"                    AS event_title,
        e."date"                     AS event_date,
        e."description"              AS event_description,
        (SELECT COUNT(*)::int FROM "Article" a WHERE a."eventId" = e."id") AS event_article_count,
        ent."id"                     AS entity_id,
        ent."name"                   AS entity_name,
        ent."homepage"               AS entity_homepage,
        ent."jobPortal"              AS entity_job_portal,
        ent."marketCapUsd"           AS entity_market_cap_usd,
        ent."employeeCount"          AS entity_employee_count,
        ent."freeCashFlow"           AS entity_free_cash_flow,
        ee."impactScore5w"           AS impact_score_5w
      FROM "Event" e
      JOIN "EventEntity" ee ON ee."eventId" = e."id"
      JOIN "Entity" ent ON ent."id" = ee."entityId"
      WHERE e."date" >= $1 AND e."date" <= $2
      ${categoryClause}
      ORDER BY e."date" DESC, e."id";
    `;

    const result = await sql.query(text, params);
    const rows = result.rows as FlatRow[];

    const nodesMap = new Map<string, GraphNode>();
    const edgeBuckets = new Map<
      string,
      {
        source: string;
        target: string;
        events: Map<string, GraphEdgeEvent>;
        totalWeight: number;
        impactSum: number;
      }
    >();
    const eventEntities = new Map<
      string,
      {
        event: { id: string; title: string; date: string; description: string | null; articleCount: number };
        entities: { id: string; score: number }[];
      }
    >();

    for (const row of rows) {
      const entityId = row.entity_id.toLowerCase();
      const score = row.impact_score_5w ?? 0;

      if (!nodesMap.has(entityId)) {
        nodesMap.set(entityId, {
          id: entityId,
          label: row.entity_name,
          homepage: row.entity_homepage,
          jobPortal: row.entity_job_portal,
          score,
          eventCount: 1,
          marketCapUsd: row.entity_market_cap_usd,
          employeeCount: row.entity_employee_count,
          freeCashFlow: row.entity_free_cash_flow,
        });
      } else {
        const n = nodesMap.get(entityId)!;
        n.eventCount += 1;
        n.score += score;
      }

      if (!eventEntities.has(row.event_id)) {
        eventEntities.set(row.event_id, {
          event: {
            id: row.event_id,
            title: row.event_title,
            date: new Date(row.event_date).toISOString(),
            description: row.event_description,
            articleCount: Number(row.event_article_count ?? 0),
          },
          entities: [],
        });
      }
      eventEntities.get(row.event_id)!.entities.push({ id: entityId, score });
    }

    for (const { event, entities } of eventEntities.values()) {
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const [source, target] = [entities[i].id, entities[j].id].sort();
          const key = `${source}||${target}`;
          const weight =
            Math.abs(entities[i].score || 1) + Math.abs(entities[j].score || 1);
          const scoreSum = entities[i].score + entities[j].score;

          if (!edgeBuckets.has(key)) {
            edgeBuckets.set(key, {
              source,
              target,
              events: new Map(),
              totalWeight: 0,
              impactSum: 0,
            });
          }
          const bucket = edgeBuckets.get(key)!;
          bucket.totalWeight += weight;
          bucket.impactSum += scoreSum;
          bucket.events.set(event.id, event);
        }
      }
    }

    const edges: GraphEdge[] = Array.from(edgeBuckets.values()).map(
      (bucket) => ({
        id: `${bucket.source}||${bucket.target}`,
        source: bucket.source,
        target: bucket.target,
        weight: bucket.totalWeight,
        impact:
          bucket.impactSum > 0
            ? "positive"
            : bucket.impactSum < 0
              ? "negative"
              : "neutral",
        eventCount: bucket.events.size,
        events: Array.from(bucket.events.values()),
      }),
    );

    // Drop single-vertex components. A node appears orphaned when every
    // event it participates in (within the active date + kind filter)
    // has only one entity — a job posting with one agency, or a news
    // event that somehow ended up tagged to a single entity. Those
    // contribute nothing to the relationship graph, so we prune them
    // rather than render dangling dots with no edges.
    const connectedIds = new Set<string>();
    for (const edge of edges) {
      connectedIds.add(edge.source);
      connectedIds.add(edge.target);
    }
    const nodes = Array.from(nodesMap.values()).filter((n) =>
      connectedIds.has(n.id),
    );

    return { nodes, edges };
  });
}
