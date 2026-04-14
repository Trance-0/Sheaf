"use client";

import { createSql, withDriftDispatch } from "@/lib/client/neon";

/**
 * v0.1.21 — client-side replacements for `/api/node` GET + PATCH.
 *
 * The original route ran a single Prisma `findUnique` with nested
 * `include` for aliases, the latest snapshot, and the 30 most recent
 * events (each with article count + primary article). Here that same
 * data shape is built from three parallel SQL queries, which is
 * slightly more roundtrips but keeps each query simple and easy to
 * reason about against a broken cache.
 */

export interface NodeRecentEvent {
  eventId: string;
  title: string;
  date: string;
  description: string | null;
  articleCount: number;
  primaryArticleUrl: string | null;
  primaryArticleTitle: string | null;
  primaryArticleProvider: string | null;
  impact5d: number | null;
  impact5w: number | null;
}

export interface NodeLatestSnapshot {
  id: string;
  entityId: string;
  date: string;
  marketCapUsd: number | null;
  employeeCount: number | null;
  freeCashFlow: number | null;
  sourceName: string | null;
  sourceUrl: string | null;
  netWorth: number | null;
  growth: number | null;
  statusText: string | null;
}

export interface NodeDetail {
  id: string;
  name: string;
  type: string;
  description: string | null;
  homepage: string | null;
  jobPortal: string | null;
  stockTicker: string | null;
  marketCapUsd: number | null;
  employeeCount: number | null;
  freeCashFlow: number | null;
  foundedYear: number | null;
  aliases: string[];
  latestSnapshot: NodeLatestSnapshot | null;
  recentEvents: NodeRecentEvent[];
  recentJobs: NodeRecentEvent[];
}

interface EntityRow {
  id: string;
  name: string;
  type: string;
  description: string | null;
  homepage: string | null;
  jobPortal: string | null;
  stockTicker: string | null;
  marketCapUsd: number | null;
  employeeCount: number | null;
  freeCashFlow: number | null;
  foundedYear: number | null;
}

interface EventRow {
  event_id: string;
  title: string;
  date: string | Date;
  description: string | null;
  category: string | null;
  article_count: number | string;
  primary_article_url: string | null;
  primary_article_title: string | null;
  primary_article_provider: string | null;
  impact_score_5d: number | null;
  impact_score_5w: number | null;
}

export async function fetchNodeDetail(
  databaseUrl: string,
  id: string,
): Promise<NodeDetail | null> {
  return withDriftDispatch(async () => {
    const sql = createSql(databaseUrl);
    const entityRes = await sql.query(
      `SELECT "id", "name", "type", "description", "homepage", "jobPortal",
              "stockTicker", "marketCapUsd", "employeeCount", "freeCashFlow", "foundedYear"
       FROM "Entity"
       WHERE LOWER("id") = $1
       LIMIT 1;`,
      [id.toLowerCase()],
    );
    if (entityRes.rowCount === 0) return null;
    const entity = entityRes.rows[0] as EntityRow;

    const aliasRes = await sql.query(
      `SELECT "alias" FROM "EntityAlias" WHERE "entityId" = $1;`,
      [entity.id],
    );
    const aliases = (aliasRes.rows as { alias: string }[]).map((r) => r.alias);

    const snapshotRes = await sql.query(
      `SELECT "id", "entityId", "date", "marketCapUsd", "employeeCount",
              "freeCashFlow", "sourceName", "sourceUrl", "netWorth", "growth", "statusText"
       FROM "EntitySnapshot"
       WHERE "entityId" = $1
       ORDER BY "date" DESC
       LIMIT 1;`,
      [entity.id],
    );
    const rawSnapshot = snapshotRes.rows[0] as
      | (Omit<NodeLatestSnapshot, "date"> & { date: string | Date })
      | undefined;
    const latestSnapshot: NodeLatestSnapshot | null = rawSnapshot
      ? { ...rawSnapshot, date: new Date(rawSnapshot.date).toISOString() }
      : null;

    const eventsRes = await sql.query(
      `SELECT
         ev."id"            AS event_id,
         ev."title"         AS title,
         ev."date"          AS date,
         ev."description"   AS description,
         ev."category"      AS category,
         (SELECT COUNT(*)::int FROM "Article" a WHERE a."eventId" = ev."id") AS article_count,
         (SELECT a."url"      FROM "Article" a WHERE a."eventId" = ev."id" ORDER BY a."publishedAt" DESC LIMIT 1) AS primary_article_url,
         (SELECT a."title"    FROM "Article" a WHERE a."eventId" = ev."id" ORDER BY a."publishedAt" DESC LIMIT 1) AS primary_article_title,
         (SELECT a."provider" FROM "Article" a WHERE a."eventId" = ev."id" ORDER BY a."publishedAt" DESC LIMIT 1) AS primary_article_provider,
         ee."impactScore5d" AS impact_score_5d,
         ee."impactScore5w" AS impact_score_5w
       FROM "EventEntity" ee
       JOIN "Event" ev ON ev."id" = ee."eventId"
       WHERE ee."entityId" = $1
       ORDER BY ev."date" DESC
       LIMIT 30;`,
      [entity.id],
    );
    const events = eventsRes.rows as (EventRow & { category: string | null })[];

    const toSummary = (e: EventRow): NodeRecentEvent => ({
      eventId: e.event_id,
      title: e.title,
      date: new Date(e.date).toISOString(),
      description: e.description,
      articleCount: Number(e.article_count ?? 0),
      primaryArticleUrl: e.primary_article_url,
      primaryArticleTitle: e.primary_article_title,
      primaryArticleProvider: e.primary_article_provider,
      impact5d: e.impact_score_5d,
      impact5w: e.impact_score_5w,
    });

    const recentEvents = events
      .filter((e) => e.category !== "job")
      .slice(0, 10)
      .map(toSummary);
    const recentJobs = events
      .filter((e) => e.category === "job")
      .slice(0, 10)
      .map(toSummary);

    return {
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
      aliases,
      latestSnapshot,
      recentEvents,
      recentJobs,
    };
  });
}

export interface NodePatchInput {
  homepage?: string | null;
  jobPortal?: string | null;
  description?: string | null;
}

export interface NodePatchResult {
  id: string;
  name: string;
  homepage: string | null;
  jobPortal: string | null;
  description: string | null;
}

/**
 * PATCH equivalent: trim input, validate URLs, and emit a single UPDATE
 * that touches only the provided fields. Matches the old server
 * behaviour — pass `null`/empty to clear, omit to leave unchanged.
 */
export async function updateNode(
  databaseUrl: string,
  id: string,
  patch: NodePatchInput,
): Promise<NodePatchResult> {
  return withDriftDispatch(async () => {
    const sql = createSql(databaseUrl);

    const normalized: NodePatchInput = {};
    if (patch.homepage !== undefined) {
      normalized.homepage = patch.homepage?.trim() ? patch.homepage.trim() : null;
    }
    if (patch.jobPortal !== undefined) {
      normalized.jobPortal = patch.jobPortal?.trim() ? patch.jobPortal.trim() : null;
    }
    if (patch.description !== undefined) {
      normalized.description = patch.description?.trim()
        ? patch.description.trim()
        : null;
    }

    const keys = Object.keys(normalized) as (keyof NodePatchInput)[];
    if (keys.length === 0) {
      throw new Error("No editable fields supplied.");
    }

    for (const key of ["homepage", "jobPortal"] as const) {
      const value = normalized[key];
      if (typeof value === "string") {
        try {
          const u = new URL(value);
          if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
        } catch {
          throw new Error(`${key} must be a valid http(s) URL.`);
        }
      }
    }

    const setFragments: string[] = [];
    const params: unknown[] = [];
    for (const key of keys) {
      params.push(normalized[key]);
      setFragments.push(`"${key}" = $${params.length}`);
    }
    params.push(id.toLowerCase());

    const result = await sql.query(
      `UPDATE "Entity"
       SET ${setFragments.join(", ")}, "updatedAt" = NOW()
       WHERE LOWER("id") = $${params.length}
       RETURNING "id", "name", "homepage", "jobPortal", "description";`,
      params,
    );
    if (result.rowCount === 0) {
      throw new Error("Entity not found.");
    }
    return result.rows[0] as NodePatchResult;
  });
}
