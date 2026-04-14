"use client";

import { createSql } from "@/lib/client/neon";

/**
 * v0.1.21 — client-side data backup.
 *
 * This produces a JSON snapshot of every Sheaf table by running
 * `SELECT *` through the Neon HTTP driver. It is a **data-only**
 * snapshot: it preserves rows but not CREATE TABLE DDL, indexes, or
 * constraints. For a full structural backup, create a Neon branch
 * (Neon → Dashboard → Branches → Create branch from current state) —
 * that's the real rollback point. This JSON file is a supplemental
 * convenience so a migration run has *something* to diff against if
 * anything surprising happens.
 *
 * Every table in `schema.prisma` is included. Add entries here when the
 * schema grows; missing tables are skipped with a console warning so a
 * single lagging table doesn't abort the whole backup.
 */

const BACKUP_TABLES = [
  "Entity",
  "EntityAlias",
  "Event",
  "EventEntity",
  "Article",
  "EntitySnapshot",
  "CacheCard",
] as const;

export interface BackupSummary {
  version: string;
  takenAt: string;
  tables: Record<string, unknown[]>;
  rowCounts: Record<string, number>;
  warnings: string[];
}

/**
 * Fetch every known table and return an in-memory snapshot. Caller is
 * responsible for serializing it to a file — see `downloadBackup` below.
 */
export async function captureBackup(
  databaseUrl: string,
  version: string,
): Promise<BackupSummary> {
  const sql = createSql(databaseUrl);
  const tables: Record<string, unknown[]> = {};
  const rowCounts: Record<string, number> = {};
  const warnings: string[] = [];

  for (const table of BACKUP_TABLES) {
    try {
      const result = await sql.query(`SELECT * FROM "${table}";`);
      tables[table] = result.rows;
      rowCounts[table] = result.rowCount;
    } catch (err) {
      warnings.push(
        `Skipped "${table}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    version,
    takenAt: new Date().toISOString(),
    tables,
    rowCounts,
    warnings,
  };
}

/**
 * Serialize the backup to JSON and trigger a browser download. Uses
 * `BigInt`-safe serialization because Postgres `bigint` columns come
 * back as JavaScript `BigInt` instances that `JSON.stringify` refuses
 * to emit by default. Dates are stringified via their `toJSON()`.
 */
export function downloadBackup(backup: BackupSummary): void {
  const json = JSON.stringify(
    backup,
    (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = backup.takenAt.replace(/[:.]/g, "-");
  a.download = `sheaf-backup-${backup.version}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function totalRowCount(backup: BackupSummary): number {
  return Object.values(backup.rowCounts).reduce((a, b) => a + b, 0);
}
