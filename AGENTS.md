# AGENTS.md

Guidance for AI coding agents working in this repository. Humans should
read [docs/index.md](docs/index.md) for the full project spec.

## Project in one paragraph

Sheaf is a single-user, local-first investment and career intelligence
graph. Next.js App Router + Tailwind for the shell; `@react-sigma/core`
with `graphology` for rendering; a Neon Postgres database the browser
now talks to directly via `@neondatabase/serverless` (the Next.js
server no longer touches the DB — see
[docs/versions/0.1.21.md](docs/versions/0.1.21.md)).

## This is not the Next.js you know

APIs, conventions, and file structure may differ from the training-data
Next.js. Before writing or refactoring Next-specific code, read the
relevant guide in `node_modules/next/dist/docs/` and heed any
deprecation notices. This applies to route handlers, `use client`
semantics, metadata, caching, and Turbopack specifics.

## UI principles

1. Glassmorphic, responsive Tailwind. No rigid vanilla CSS. Use the
   Inter font and the existing glass-panel utilities.
2. Keep detail drill-downs in the `SidePanel`. The Sigma canvas stays
   uncluttered.
3. Impact colour scheme is fixed: `#10b981` positive, `#ef4444`
   negative, `#9ca3af` neutral.

## Data boundaries

- The `DATABASE_URL` lives in the browser (localStorage, managed by
  [src/lib/useAppSettings.ts](src/lib/useAppSettings.ts)).
- Reads, writes, migrations, and backups are all driven by modules
  under [src/lib/client/](src/lib/client/). If you need new data
  access, add it there — do not reintroduce a `/api/*` DB route.
- Only `@neondatabase/serverless` is allowed to speak Postgres from the
  browser. Non-Neon Postgres users fall through to the CLI migration
  driver at [prisma/migrate_auto.ts](prisma/migrate_auto.ts).

## Versioning

- The `VERSION` file is the source of truth. Increment the **third
  digit only** (`0.1.22 -> 0.1.23`). The first two digits are
  human-controlled; never change them.
- Every change that ships must bump `VERSION` and add a new
  `docs/versions/<VERSION>.md` entry covering *why* the change was
  made, *what* moved, and *how* it was verified (lint / tsc / build /
  manual browser checks).

## Documentation maintenance

You MUST update the docs when landing any change:

1. If you fix a bug or land a feature, reflect it in
   [docs/index.md](docs/index.md) if the project overview shifted.
2. Move completed items out of [docs/TASKS.md](docs/TASKS.md) into the
   new `docs/versions/<VERSION>.md` entry.
3. Add discovered-but-deferred work back into
   [docs/TASKS.md](docs/TASKS.md) so it isn't lost.
4. Do **not** rewrite historical `docs/versions/*.md` files — they are
   the changelog.

## Where the active work lives

- [docs/TASKS.md](docs/TASKS.md) — current task queue and the rules
  around triaging it (urgent-first, decompose big tasks, etc.).
- [docs/index.md](docs/index.md) — full project spec and architecture.
- [docs/versions/](docs/versions/) — per-release changelog.

## Build / lint / type-check

```bash
npm run lint        # ESLint
npx tsc --noEmit    # TypeScript (clear .next/ first if stale)
npx next build      # Production build; should show only /api/settings
                    # as a dynamic route
```

## Commit workflow

- **Commit on your own** once lint / tsc / build pass and the docs are
  updated — do not ask for permission first. **Never push.** The user
  pushes after their own review.
- Prefix with `feat(<version>):` / `fix(<version>):` / `data(<version>):`
  matching recent history.
- First line under 72 chars; body explains *why*, not *what*.
- Never commit `.env`, credentials, or `sheaf-settings-*.json`.

## Testing UI changes

Type-checking and tests verify code correctness, not feature
correctness. For any UI change, run `npm run dev`, exercise the golden
path and the edge cases in a browser, and explicitly say "I did not
manually test this" if you couldn't.
