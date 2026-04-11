import { PrismaClient } from "@prisma/client";

const DB_HEADER = "x-sheaf-database-url";

function isAllowedDatabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "postgres:" || url.protocol === "postgresql:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function createPrismaFromRequest(req: Request): PrismaClient {
  const databaseUrl = req.headers.get(DB_HEADER)?.trim() ?? "";
  if (!databaseUrl) {
    throw new Error("Missing x-sheaf-database-url header. Import or save your local settings JSON first.");
  }
  if (!isAllowedDatabaseUrl(databaseUrl)) {
    throw new Error("Invalid database URL in x-sheaf-database-url header.");
  }
  return new PrismaClient({ datasourceUrl: databaseUrl });
}
