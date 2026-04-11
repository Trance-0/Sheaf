/**
 * v0.1.17 — intern / new-grad job seed.
 *
 * Reads the active settings file (sheaf-settings-*.json) to find the
 * user's skillsKeywords list, cross-references each program in
 * `intern_entry_seed.json` against those keywords, and for each program
 * whose `relevantSkills` intersects the active skillsKeywords AND whose
 * target entity has a `jobPortal` set in the database, creates a
 * category='job' Event + Article on that entity.
 *
 * Idempotent: uses `Article.url` uniqueness to skip duplicates, and
 * probes for an existing event with the same title on the same entity
 * before inserting a new one.
 *
 * CLI:
 *   npx tsx skills/job_crawl/seed_intern_entry_jobs.ts [--dry-run] [--settings=<path>]
 *
 *   --dry-run         Load + filter without touching the DB. Prints the
 *                     programs that would be seeded and why.
 *   --settings=<path> Override the settings file path. Default: first
 *                     sheaf-settings-*.json found in the project root.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';

interface Program {
  entityId: string;
  title: string;
  url: string;
  postedAt: string;
  level: 'intern' | 'new-grad';
  description: string;
  relevantSkills: string[];
}

interface SeedFile {
  _comment?: string;
  programs: Program[];
}

interface JobsConfig {
  skillsKeywords?: unknown;
}

interface SettingsFile {
  jobsConfig?: JobsConfig;
}

/**
 * Same character-wise trailing-comma stripper as in
 * src/lib/useAppSettings.ts. Duplicated here rather than imported so
 * this CLI script is free of frontend dependencies (next/react imports
 * would break `tsx` invocation).
 */
function stripTrailingCommas(json: string): string {
  let result = '';
  let inString = false;
  let escape = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escape) {
      result += ch;
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        result += ch;
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j]!)) j++;
      if (json[j] === '}' || json[j] === ']') continue;
    }
    result += ch;
  }
  return result;
}

function findActiveSettingsFile(override?: string): string {
  if (override) {
    if (!fs.existsSync(override)) {
      throw new Error(`--settings path does not exist: ${override}`);
    }
    return override;
  }
  // Look in the repo root (cwd) for sheaf-settings-*.json. If multiple
  // exist, pick the lexicographically greatest — filenames are dated, so
  // the newest date wins.
  const files = fs
    .readdirSync(process.cwd())
    .filter((f) => /^sheaf-settings-.*\.json$/.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(
      'No sheaf-settings-*.json file found in the project root. Pass --settings=<path> to point at one explicitly.',
    );
  }
  return path.join(process.cwd(), files[files.length - 1]!);
}

function loadSettings(filePath: string): string[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(stripTrailingCommas(raw)) as SettingsFile;
  const skills = parsed.jobsConfig?.skillsKeywords;
  if (!Array.isArray(skills)) {
    throw new Error(
      `Settings file ${filePath} has no jobsConfig.skillsKeywords array.`,
    );
  }
  return skills.filter((s): s is string => typeof s === 'string' && s.length > 0);
}

function loadSeed(): SeedFile {
  const seedPath = path.join(__dirname, 'intern_entry_seed.json');
  const raw = fs.readFileSync(seedPath, 'utf8');
  return JSON.parse(stripTrailingCommas(raw)) as SeedFile;
}

/**
 * A program is kept if at least one of its `relevantSkills` matches
 * any of the user's `skillsKeywords`. Match is case-insensitive and
 * exact on the normalized string (a trimmed + lowercased compare).
 * We don't use substring matching: "Java" would otherwise match
 * "JavaScript", which is semantically wrong for skill filtering.
 */
function skillsIntersect(programSkills: string[], userSkills: string[]): string[] {
  const userSet = new Set(userSkills.map((s) => s.trim().toLowerCase()));
  return programSkills.filter((ps) => userSet.has(ps.trim().toLowerCase()));
}

interface CliFlags {
  dryRun: boolean;
  settingsPath?: string;
}

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = { dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--settings=')) flags.settingsPath = arg.slice('--settings='.length);
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npx tsx skills/job_crawl/seed_intern_entry_jobs.ts [--dry-run] [--settings=<path>]`);
      process.exit(0);
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  const settingsPath = findActiveSettingsFile(flags.settingsPath);
  console.log(`[settings] ${settingsPath}`);
  const userSkills = loadSettings(settingsPath);
  console.log(`[settings] ${userSkills.length} skillsKeywords loaded`);

  const seed = loadSeed();
  console.log(`[seed] ${seed.programs.length} programs loaded`);

  // Pre-filter by skills match. This step is DB-free so --dry-run can
  // short-circuit here.
  const filtered = seed.programs
    .map((p) => ({ program: p, matched: skillsIntersect(p.relevantSkills, userSkills) }))
    .filter((x) => x.matched.length > 0);

  console.log(`[filter] ${filtered.length} / ${seed.programs.length} programs match skillsKeywords`);

  if (flags.dryRun) {
    console.log('\n[dry-run] programs that would be seeded:');
    for (const { program, matched } of filtered) {
      console.log(
        `  ${program.entityId.padEnd(12)} | ${program.level.padEnd(9)} | ${program.title}`,
      );
      console.log(`    matched: ${matched.join(', ')}`);
      console.log(`    url: ${program.url}`);
    }
    console.log('\n[dry-run] not touching the database. Done.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    let created = 0;
    let attached = 0;
    let skipped = 0;
    let noEntity = 0;
    let noPortal = 0;

    for (const { program, matched } of filtered) {
      // Confirm the entity exists AND has a jobPortal. The task scopes
      // this seed to "entities with a jobPortal" explicitly, so we skip
      // anything missing either.
      const entity = await prisma.entity.findUnique({ where: { id: program.entityId } });
      if (!entity) {
        console.log(`  [skip:no-entity] ${program.entityId} — entity not in DB`);
        noEntity++;
        continue;
      }
      if (!entity.jobPortal) {
        console.log(`  [skip:no-portal] ${program.entityId} — no jobPortal set`);
        noPortal++;
        continue;
      }

      // Check for a duplicate article URL — the cheapest dedup.
      const existingArticle = await prisma.article.findUnique({ where: { url: program.url } });
      if (existingArticle) {
        console.log(`  [skip:dup-url]  ${program.entityId} — article already exists (${program.url})`);
        skipped++;
        continue;
      }

      // Probe for an existing event with the same title attached to
      // this entity. If found, attach our article rather than creating
      // a second event. Title match is exact because the seed is
      // hand-curated and our titles are stable.
      const existingEvent = await prisma.event.findFirst({
        where: {
          title: program.title,
          entities: { some: { entityId: entity.id } },
        },
      });

      if (existingEvent) {
        await prisma.article.create({
          data: {
            url: program.url,
            title: program.title,
            provider: entity.name,
            publishedAt: new Date(program.postedAt),
            eventId: existingEvent.id,
          },
        });
        console.log(`  [attach]        ${program.entityId} — "${program.title}"`);
        attached++;
        continue;
      }

      // Fresh event. Impact scores are low on purpose: intern postings
      // are informational context, not market-moving news. We keep them
      // non-zero so the edge color/alpha path still treats them as
      // "present" rather than falling back to the neutral palette.
      await prisma.event.create({
        data: {
          title: program.title,
          date: new Date(program.postedAt),
          description: program.description,
          category: 'job',
          entities: {
            create: {
              entityId: entity.id,
              impactScore5d: 0.5,
              impactScore5w: 1,
            },
          },
          articles: {
            create: {
              url: program.url,
              title: program.title,
              provider: entity.name,
              publishedAt: new Date(program.postedAt),
            },
          },
        },
      });
      console.log(`  [create]        ${program.entityId} — "${program.title}" (matched: ${matched.join(', ')})`);
      created++;
    }

    console.log(
      `\nSummary: ${created} created, ${attached} attached, ${skipped} skipped (dup url), ${noPortal} skipped (no portal), ${noEntity} skipped (no entity).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
