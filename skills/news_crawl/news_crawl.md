# Skill: Add News/Event Data to Sheaf Database

## Objective
Teach the agent how to add news articles and events into the Sheaf Prisma database while **avoiding duplicates**. News is modeled as Events (edges connecting two or more entities). Individual articles are sources/references attached to those events.

## Architecture
- **Entity** = A company, agency, or person (node in the graph).
- **Event** = A news cluster connecting two or more entities (edge in the graph). Has a title, date, and description.
- **Article** = A specific news article URL. Multiple articles from different sources can reference the same event.

**Key principle:** Edges in the graph represent **Events**, NOT individual articles. If three articles cover the same story (e.g., "Google partners with Anthropic on AI safety"), they should all link to ONE event, not create three separate edges.

## Tools (colocated with this skill)

- `skills/news_crawl/update_news.ts` — TypeScript CLI for adding news events (deduplication-aware)
- `skills/news_crawl/cleanup_duplicates.ts` — utility to purge duplicate entity nodes by slug
- `skills/news_crawl/pipeline.py` — LLM-driven impact assessment pipeline (consumes `config/prompts.yaml`)
- `skills/news_crawl/requirements.txt` — Python deps for `pipeline.py`

## CRITICAL: Deduplication Protocol

### Step 1 — Check if the article URL already exists
```bash
npx tsx skills/news_crawl/update_news.ts list-events
```
Search the output for the URL you intend to add. If found, **STOP — do not insert**.

### Step 2 — Check if a similar event already exists between these entities
Look for events with overlapping keywords between the same entity pair. If found, do NOT create a new event — add the article as an additional source to the existing event. The script handles this automatically via keyword probe.

### Step 3 — Insert
```bash
# Add a news event between two entities (dedup-aware)
npx tsx skills/news_crawl/update_news.ts add-news "<Entity1>" "<Entity2>" "<EventTitle>" "<ArticleURL>" "<YYYY-MM-DD>" "[Optional Description]"
```

**Examples:**
```bash
# First article about a partnership
npx tsx skills/news_crawl/update_news.ts add-news "Google" "Anthropic" "AI Safety Research Partnership" "https://reuters.com/article/123" "2026-04-05" "Google and Anthropic announce joint research on AI alignment."

# Second article about the SAME event from a different source — will auto-attach to existing event
npx tsx skills/news_crawl/update_news.ts add-news "Google" "Anthropic" "AI Safety Partnership Announcement" "https://techcrunch.com/article/456" "2026-04-05" "Coverage of the Google-Anthropic alignment deal."
```

If the script reports `Matched existing event "..."`, it means the article was attached as a reference to the existing event. This is correct behavior — it prevents graph hairballs.

### Step 4 — Verify
```bash
npx tsx skills/news_crawl/update_news.ts list-events
npx tsx skills/news_crawl/update_news.ts list-entities
```

### Maintenance — Purge duplicate entities

If manual edits created entity duplicates that share the same name but different IDs, run:

```bash
npx tsx skills/news_crawl/cleanup_duplicates.ts
```

The script folds `EventEntity` rows onto the master record before deleting the duplicates.

## Rules
- Entities are upserted by slug (lowercase hyphenated). No duplicates.
- An Event should represent a **single real-world occurrence**, not a single article.
- If you find 5 articles about the same story, create 1 event with 5 articles attached.
- Always verify after insertion.
- Impact scores (5d/5w/5m/5y) default to 1 on creation. They will be re-evaluated by the LLM pipeline.
- Date format must be parseable by JavaScript `new Date()`.
