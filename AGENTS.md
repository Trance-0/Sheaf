# AGENTS.md — Sheaf

This project inherits the canonical rules from
[github.com/Trance-0/AGENTS.md](https://github.com/Trance-0/AGENTS.md),
vendored as a submodule at [`.agents/`](.agents/). Read the canon first.

@.agents/AGENTS.md

Run `git submodule update --init --recursive` after cloning so the
`.agents/` directory is populated. If `.agents/AGENTS.md` is missing,
re-initialize the submodule before starting work.

---

## Sheaf-specific overrides

### Project in one paragraph

Single-user, local-first investment and career intelligence graph.
Next.js App Router shell rendered on Vercel; the browser talks to a
Neon Postgres directly via `@neondatabase/serverless` for every read,
write, migration, and backup (see [docs/versions/0.1.21.md](docs/versions/0.1.21.md)).
Graph rendered with `@react-sigma/core` + `graphology`. See
[docs/index.md](docs/index.md) for the full spec.

### Data boundary (hard rule)

- Do **not** add a `src/app/api/*` route that touches the database.
  Every DB access goes through `src/lib/client/`. The only surviving
  API route is `/api/settings` (410 Gone since 0.1.13).
- `DATABASE_URL` is stored in `localStorage` under `sheaf-settings-v2`.
  It is never sent through the Next.js server. Do not add code that
  relies on `process.env.DATABASE_URL` at request time.
- `@neondatabase/serverless` is the only Postgres driver allowed in
  the browser. Non-Neon Postgres users fall through to the CLI
  migration driver at [prisma/migrate_auto.ts](prisma/migrate_auto.ts).

### This is not the Next.js you know

Before writing Next-specific code (route handlers, `"use client"`,
metadata, caching, Turbopack specifics), read the relevant guide under
`node_modules/next/dist/docs/` and heed any deprecation notices. The
repo is on Next.js 16.2.3.

### UI principles

1. Glassmorphic, responsive Tailwind. Inter font. No rigid vanilla CSS.
2. Drill-downs live in `SidePanel`. The Sigma canvas stays uncluttered.
3. Fixed impact colors: `#10b981` positive, `#ef4444` negative,
   `#9ca3af` neutral.

### Versioning

- `VERSION` is the source of truth. Bump the **third digit only**
  (`0.1.22 → 0.1.23`). First two digits are human-owned.
- Every change that ships adds a new `docs/versions/<VERSION>.md`
  entry covering *why*, *what moved*, and *how it was verified*.

### Build / lint / type-check

```bash
npm run lint          # ESLint
npx tsc --noEmit      # TypeScript (clear .next/ first if stale)
npx next build        # Prod build. Route table should show only
                      # /api/settings as dynamic (everything else
                      # static, since the server no longer serves data).
```

### Repo map

- `src/app/` — Next.js App Router pages. Only `/api/settings` remains
  as an API route (410 Gone).
- `src/components/` — React UI. `GraphCanvas` owns the Sigma surface;
  `SidePanel` owns every node/edge detail view;
  `BackendUpgradePrompt` owns the migration + backup modal.
- `src/lib/client/` — every browser-side data module: `neon.ts`
  (driver + drift dispatch), `graphData.ts`, `nodeData.ts`,
  `edgeData.ts`, `migrations.ts`, `backup.ts`, `layout.ts`.
- `src/lib/useAppSettings.ts` — localStorage-backed settings store,
  including `databaseUrl`.
- `prisma/schema.prisma` + `prisma/migrate_*.ts` — schema + the CLI
  fallback migration driver.
- `docs/` — project spec ([index.md](docs/index.md)), task tracker
  ([TODO.md](docs/TODO.md)), round checklist
  ([LLM_CHECK.md](docs/LLM_CHECK.md)), per-release notes
  ([versions/](docs/versions/)).

### Testing UI changes

Type-checking and tests verify code correctness, not feature
correctness. For any UI change, run `npm run dev` and exercise the
golden path + edge cases in a browser. If you could not manually
verify, say so explicitly in the final message.

### Where the active work lives

- [docs/TODO.md](docs/TODO.md) — current task queue.
- [docs/index.md](docs/index.md) — full project spec.
- [docs/LLM_CHECK.md](docs/LLM_CHECK.md) — end-of-round checklist.
- [docs/versions/](docs/versions/) — per-release changelog.
