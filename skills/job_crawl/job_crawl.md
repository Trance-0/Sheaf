# Skill: Add Job Entries to Sheaf Database

## Objective
Teach the agent how to add recruiting/hiring information into the Sheaf Prisma database while **avoiding duplicates**. Jobs are modeled as Events (edges) linked to an Agency Entity (node). Individual job postings are Articles (sources) attached to those events.

## Architecture
- **Entity** = The organization (node in the graph). Has `homepage` and `jobPortal` fields.
- **Event** = A specific job posting or hiring initiative (edge in the graph, linking entities).
- **Article** = The source URL for the job listing. Multiple articles can reference the same event.

## Tool
TypeScript CLI script (colocated with this skill): `skills/job_crawl/update_jobs.ts`

## CRITICAL: Deduplication Protocol
Before inserting ANY data, you MUST probe the database for existing matches:

### Step 1 — Check if the article URL already exists
```bash
npx tsx skills/job_crawl/update_jobs.ts list-events
```
Search the output for the URL you intend to add. If found, **STOP — do not insert**.

### Step 2 — Check if a similar event already exists for this entity
Search the event list for titles with overlapping keywords. If an event with a very similar title already exists under the same agency, **do NOT create a new event**. Instead, add your URL as an additional article/source to the existing event. The script handles this automatically — it probes by keyword before inserting.

### Step 3 — Insert
```bash
# Add a job (dedup-aware — will match existing events automatically)
npx tsx skills/job_crawl/update_jobs.ts add-job "<AgencyName>" "<JobTitle>" "<PostingURL>" "<YYYY-MM-DD>" "[Optional Description]"
```

**Example:**
```bash
npx tsx skills/job_crawl/update_jobs.ts add-job "Google" "Senior ML Engineer" "https://careers.google.com/jobs/123" "2026-04-01" "ML infrastructure role on Gemini team"
```

If the script reports `Matched existing event "..."`, it means the article was attached to an existing event rather than creating a new one. This is correct behavior.

### Step 4 — Verify
```bash
npx tsx skills/job_crawl/update_jobs.ts list-events
npx tsx skills/job_crawl/update_jobs.ts list-entities
```

## Rules
- An Entity is upserted by slug (`agency-name` → lowercase, hyphens). No duplicates are possible.
- Always check the output after insertion to confirm expected behavior.
- Date format must be parseable by JavaScript `new Date()` (e.g., `YYYY-MM-DD`).
- Escape special characters in PowerShell/CMD strings.
- The job portal URL for the agency should be stored on the Entity (`jobPortal` field), not on the Event. Set it via the Prisma DB directly or the entity settings UI.
