import type { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { createPrismaFromRequest } from "@/lib/server/prismaFromRequest";
import { backendUpgradeResponse } from "@/lib/server/backendErrors";
import { listMigrations, runAllMigrations } from "@/lib/server/migrations";

/**
 * v0.1.20 — frontend-triggered migration endpoint.
 *
 * Lets a hosted Sheaf deploy upgrade a user-provided database without
 * anyone cloning the repo or opening a terminal. The user supplies
 * their database URL via `x-sheaf-database-url` (same header the read
 * routes use), and POST /api/migrate runs every idempotent migration
 * step registered in `src/lib/server/migrations.ts` against that
 * database, returning a structured per-step report that the
 * BackendUpgradePrompt UI renders inline.
 *
 * Safety rails (match the CLI path where possible):
 *   1. Client must set `x-sheaf-database-url` — no default database.
 *   2. POST body must include `{ confirmed: true }`. The frontend sets
 *      this only after the user ticks the "I've backed up my database"
 *      checkbox, matching the CLI's "type yes" prompt.
 *   3. Migrations are idempotent by construction — re-running against
 *      an already-migrated database is a no-op, so a misclick won't
 *      corrupt state.
 *
 * GET is dry-run: it returns the registered migration list so the UI
 * can populate "this is what will run" before the user confirms. The
 * dry-run path does NOT touch the database and does NOT need the
 * `x-sheaf-database-url` header — it's pure metadata.
 *
 * Schema-drift errors from within a migration step are captured per
 * step in the report rather than turned into upgrade prompts — if the
 * user is already on the migration page, bouncing them back to it is
 * a loop. But if the Prisma client itself fails to initialize, that's
 * a server deploy issue (not a database issue) and we hand it back
 * through `backendUpgradeResponse` so the caller can surface the
 * prisma-client-stale guidance instead.
 */

export async function GET() {
  return NextResponse.json({
    migrations: listMigrations(),
    note: "Dry-run listing. POST with { confirmed: true } and the x-sheaf-database-url header to execute.",
  });
}

export async function POST(req: Request) {
  let prisma: PrismaClient | undefined;
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be JSON." },
        { status: 400 },
      );
    }

    const { confirmed } = (body ?? {}) as { confirmed?: unknown };
    if (confirmed !== true) {
      return NextResponse.json(
        {
          error:
            "Migration requires explicit confirmation. POST with { confirmed: true } after the user has acknowledged the backup warning.",
        },
        { status: 400 },
      );
    }

    // `createPrismaFromRequest` throws if the header is missing, which
    // we turn into a 400 — missing header is a client error, not an
    // upgrade-required condition.
    try {
      prisma = createPrismaFromRequest(req);
    } catch (err) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "Unable to construct Prisma client.",
        },
        { status: 400 },
      );
    }

    const report = await runAllMigrations(prisma);
    return NextResponse.json(report, {
      // Return 200 even when individual steps fail — the report body
      // tells the frontend exactly what happened per step, and we
      // don't want the top-level apiFetch layer to classify a
      // partially-failed migration as a generic 5xx and pop another
      // upgrade prompt on top of the migration page.
      status: 200,
    });
  } catch (error) {
    // Top-level catch is for errors outside the per-step loop:
    // failure to construct the Prisma client, JSON serialization
    // bugs, etc. A prisma-client-stale error here means the deploy
    // itself is broken (server can't load the generated client at
    // all), so we hand it to `backendUpgradeResponse` which produces
    // the dedicated "contact the maintainer" signal.
    const upgrade = backendUpgradeResponse(error);
    if (upgrade) return upgrade;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Migration failed before any step ran.",
      },
      { status: 500 },
    );
  } finally {
    await prisma?.$disconnect();
  }
}
