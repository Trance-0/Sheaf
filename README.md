# Sheaf

Sheaf is a **local-first investment and career intelligence graph** for a single user. It renders entities (companies, agencies, people) as nodes and clusters multi-article developments into event edges so the graph stays legible instead of devolving into a news hairball.

## What changed in 0.1.13

The app no longer depends on a backend settings write to populate `DATABASE_URL` on the server.

Instead, Sheaf now uses a **user-supplied local settings JSON file** as the source of truth for:

- theme
- node sizing
- edge sizing
- database URL
- jobs preferences
- research/watchlist preferences

The database URL is stored locally in the browser and sent with each API request, so deployment no longer needs a separate Vercel env-var-based settings step just to make the app usable.

## Settings JSON schema

```json
{
  "version": "0.1.13",
  "theme": "dark",
  "nodeSizeFactor": "market_cap",
  "edgeSizeFactor": "event_count",
  "databaseUrl": "postgres://<user>:<password>@<neon-region>.aws.neon.tech/neondb?sslmode=require",
  "jobsConfig": {
    "enabled": true,
    "userResumeURL": "https://resume.<domain-name>.com",
    "userJobKeywords": [],
    "userLevelOfExpertise": "intern"
  },
  "researchConfig": {
    "primaryEntityOfInterest": [
      "anthropic",
      "x",
      "microsoft",
      "google",
      "aws",
      "crowdstrike",
      "nvidia",
      "openai",
      "jpmorgan",
      "apple",
      "amazon",
      "linux foundation",
      "intel",
      "meta",
      "palantir",
      "salesforce",
      "uber",
      "amd",
      "ibm",
      "figma",
      "adobe",
      "slack",
      "tiktok",
      "TSMC",
      "bytedance"
    ],
    "newsSource": [],
    "newsRefreshPeriod": "0 * * * *"
  }
}
```

## Development process

Read `AGENTS.md` before making changes. In particular:

- keep the UI local-first and single-user
- maintain the docs when you land a change
- bump the patch version in `VERSION` on each completed update
- record completed work under `docs/versions/`

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000`.
4. Open **Settings** in the app and either:
   - paste your Postgres URL directly, then save locally, or
   - import a settings JSON file matching the schema above.

## Architecture notes

- **Frontend shell:** Next.js App Router
- **Graph rendering:** Sigma.js + Graphology + ForceAtlas2
- **Data store:** Postgres via Prisma
- **Config source of truth:** local JSON settings persisted in the browser
- **Backend behavior:** API routes build Prisma clients from the user-supplied database URL per request instead of relying on a deployment-time env var write flow

## Security / trust model

This is intentionally a **single-user local-first tool**, not a multi-tenant SaaS product.

That means the browser-held database URL is treated as user-controlled input and forwarded to the app's own backend routes. This is acceptable for the intended deployment model, but it is a deliberate tradeoff and should not be copied blindly into a public multi-user product.
