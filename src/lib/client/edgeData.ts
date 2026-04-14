"use client";

import { createSql, withDriftDispatch } from "@/lib/client/neon";

/**
 * v0.1.21 — client-side replacement for `GET /api/edge`.
 *
 * Returns every event where both the source and target entities
 * participate, plus all of that event's articles and every entity's
 * impact-score row. Matches the server response shape one-for-one so
 * SidePanel's existing rendering code keeps working.
 */

export interface EdgeEventImpact {
  entity: string;
  s5d: number | null;
  s5w: number | null;
  s5m: number | null;
  s5y: number | null;
}

export interface EdgeEventArticle {
  id: string;
  title: string;
  url: string;
  provider: string | null;
  publishedAt: string;
}

export interface EdgeEventDetail {
  id: string;
  title: string;
  date: string;
  description: string | null;
  impactScores: EdgeEventImpact[];
  articles: EdgeEventArticle[];
}

export interface EdgePayload {
  source: string;
  target: string;
  events: EdgeEventDetail[];
}

export async function fetchEdge(
  databaseUrl: string,
  source: string,
  target: string,
): Promise<EdgePayload> {
  return withDriftDispatch(async () => {
    const sql = createSql(databaseUrl);
    const src = source.toLowerCase();
    const tgt = target.toLowerCase();

    const eventsRes = await sql.query(
      `SELECT DISTINCT ev."id", ev."title", ev."date", ev."description"
       FROM "Event" ev
       JOIN "EventEntity" a ON a."eventId" = ev."id"
       JOIN "EventEntity" b ON b."eventId" = ev."id"
       WHERE LOWER(a."entityId") = $1 AND LOWER(b."entityId") = $2
       ORDER BY ev."date" DESC;`,
      [src, tgt],
    );
    type EventRow = { id: string; title: string; date: string | Date; description: string | null };
    const eventRows = eventsRes.rows as EventRow[];
    if (eventRows.length === 0) {
      return { source: src, target: tgt, events: [] };
    }

    const eventIds = eventRows.map((e) => e.id);
    const idPlaceholders = eventIds.map((_, i) => `$${i + 1}`).join(", ");

    const articlesRes = await sql.query(
      `SELECT "id", "eventId", "title", "url", "provider", "publishedAt"
       FROM "Article"
       WHERE "eventId" IN (${idPlaceholders})
       ORDER BY "publishedAt" DESC;`,
      eventIds,
    );
    type ArticleRow = {
      id: string;
      eventId: string;
      title: string;
      url: string;
      provider: string | null;
      publishedAt: string | Date;
    };
    const articles = articlesRes.rows as ArticleRow[];

    const impactRes = await sql.query(
      `SELECT ee."eventId", ee."impactScore5d", ee."impactScore5w",
              ee."impactScore5m", ee."impactScore5y", ent."name" AS entity_name
       FROM "EventEntity" ee
       JOIN "Entity" ent ON ent."id" = ee."entityId"
       WHERE ee."eventId" IN (${idPlaceholders});`,
      eventIds,
    );
    type ImpactRow = {
      eventId: string;
      impactScore5d: number | null;
      impactScore5w: number | null;
      impactScore5m: number | null;
      impactScore5y: number | null;
      entity_name: string;
    };
    const impacts = impactRes.rows as ImpactRow[];

    const articlesByEvent = new Map<string, EdgeEventArticle[]>();
    for (const a of articles) {
      const list = articlesByEvent.get(a.eventId) ?? [];
      list.push({
        id: a.id,
        title: a.title,
        url: a.url,
        provider: a.provider,
        publishedAt: new Date(a.publishedAt).toISOString(),
      });
      articlesByEvent.set(a.eventId, list);
    }

    const impactsByEvent = new Map<string, EdgeEventImpact[]>();
    for (const i of impacts) {
      const list = impactsByEvent.get(i.eventId) ?? [];
      list.push({
        entity: i.entity_name,
        s5d: i.impactScore5d,
        s5w: i.impactScore5w,
        s5m: i.impactScore5m,
        s5y: i.impactScore5y,
      });
      impactsByEvent.set(i.eventId, list);
    }

    const events: EdgeEventDetail[] = eventRows.map((e) => ({
      id: e.id,
      title: e.title,
      date: new Date(e.date).toISOString(),
      description: e.description,
      impactScores: impactsByEvent.get(e.id) ?? [],
      articles: articlesByEvent.get(e.id) ?? [],
    }));

    return { source: src, target: tgt, events };
  });
}
