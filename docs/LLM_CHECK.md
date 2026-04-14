# LLM_CHECK.md — Sheaf End-of-Round Checklist

Derived from the canonical template at
[../.agents/docs/LLM_CHECK.md](../.agents/docs/LLM_CHECK.md). Run this
list **before** declaring any modification round done. If a check
fails, fix the underlying issue; do not remove the check.

---

## 1. Common mistakes seen in prior rounds

### 1.1 Sheaf-specific footguns

1. **Re-introducing a server-side `/api/*` DB route.** Since 0.1.21 the
   browser owns every read, write, migration, and backup via
   `@neondatabase/serverless`. If you find yourself adding a Prisma
   call inside `src/app/api/`, stop — the data layer belongs under
   `src/lib/client/`.
2. **Forgetting that `@neondatabase/serverless` only talks to Neon.**
   Non-Neon Postgres users fall through to the CLI migration driver at
   `prisma/migrate_auto.ts`. Do not silently claim multi-vendor support
   in UI copy.
3. **Modifying generated Prisma client and expecting the deploy to
   notice.** The Prisma client is generated at build time; runtime
   queries use `datasourceUrl` per-request and never see env
   `DATABASE_URL`. Stale generated clients still throw
   `prisma-client-stale`; see [versions/0.1.21.md](versions/0.1.21.md)
   for why we stopped caring server-side.
4. **Replacing the radial seed with random positions.** The layout is
   deterministic by design (0.1.22). Re-random initial positions and
   reloads rotate the graph into a different shape each time; hubs land
   wherever. Keep `computeRadialSeed` in the flow.
5. **Rendering a node with degree 0.** `fetchGraph` prunes
   degree-0 nodes on purpose so filter windows never leave orphan dots.
   Do not undo that prune in the renderer.
6. **Committing the `.env` file.** `.env*` is gitignored; adding a real
   Neon connection string to commit history is a credential leak.

### 1.2 Shared footguns (from canonical §1)

See [../.agents/docs/LLM_CHECK.md §1](../.agents/docs/LLM_CHECK.md) for
the full list. The ones most likely to bite in this repo:

- Reporting a command as "passed" when it wasn't run in the current
  environment.
- Root-directory hygiene: only the files listed in canonical §1.6 may
  be at repo root. Everything else goes under `docs/`.
- `CLAUDE.md` must contain **only** `@AGENTS.md` — nothing else.
- If you rename a task file, every reference in docs, in-code
  comments, and CI scripts must move in the same commit.
- `.gitignore` must cover every toolchain actually in use
  (Node/Next.js here: `node_modules/`, `.next/`, `dist/`, `build/`,
  `coverage/`, plus the `.env*` pattern and `*.tsbuildinfo`).

---

## 2. Round-end checklist

### 2.1 Truthfulness

- [ ] Every command I reported as passing was actually executed in this
      environment.
- [ ] Commands I didn't run are called out with a reason.
- [ ] For any bug fix, I can name the root-cause file:line.

### 2.2 Docs and handoff

- [ ] Root `AGENTS.md` still starts with the canonical include
      (`@.agents/AGENTS.md`) and is a thin pointer, not a duplicate of
      the canon.
- [ ] `CLAUDE.md` is the single line `@AGENTS.md`.
- [ ] `CODEX.md` is a symlink or single-line include of `AGENTS.md`.
- [ ] `README.md` matches reality (what the project is, how to start).
- [ ] `docs/index.md` reflects any architectural change material enough
      that a new agent would need it next round.
- [ ] Any user-facing change is captured in a new
      `docs/versions/<VERSION>.md` entry, and `VERSION` was bumped by
      one patch digit (third digit only; first two are human-owned).
- [ ] If this round closed work items, they were moved out of
      `docs/TODO.md` into the new version doc. If it opened items, they
      were added to `docs/TODO.md`.
- [ ] No agent-authored file was dropped at repo root. Nothing except
      the files canonical §1.6 allows.

### 2.3 Code hygiene

- [ ] Searched for references to any feature I removed; no dangling
      imports, routes, or settings fields remain.
- [ ] Unused deps removed from `package.json` + lockfile.
- [ ] `.gitignore` hides only local junk; no tracked source is hidden.
- [ ] No `.env*` with real values is staged
      (`git diff --cached --name-only`).
- [ ] No staged file exceeds 300 MB (`git diff --cached --stat`).
- [ ] UI strings have no mojibake or placeholder artifacts.

### 2.4 Build / lint / type-check

Default bar for this repo:

- [ ] `npx tsc --noEmit` — clean. Clear `.next/` first if the cache is
      stale.
- [ ] `npm run lint` — clean.
- [ ] `npx next build` — passes and the route table shows only
      `/api/settings` as a dynamic route (everything else static, since
      the server no longer touches the DB).
- [ ] For UI changes, I ran `npm run dev` and exercised the affected
      path in a browser — or I explicitly said "I did not manually
      verify" in the final message.

### 2.5 Data boundary

- [ ] No new server-side Prisma read/write path. All DB access flows
      through `src/lib/client/`.
- [ ] `DATABASE_URL` stays out of commit history; the `.env` file is
      not staged.
- [ ] Migration SQL is idempotent (`IF NOT EXISTS`,
      `UPDATE ... WHERE col IS NULL`) so re-running is safe.

### 2.6 Multi-agent safety

- [ ] No unrelated user changes were reverted or force-pushed.
- [ ] Unrecognized files and in-progress branches left alone.

### 2.7 Handoff

- [ ] Commit message drafted (action-oriented, scoped).
- [ ] Committed locally. **Did not push** (owner pushes after review
      per canonical §6).

---

## 3. Current round log

Append only — one bullet per concrete change or decision.

- 2026-04-14: Vendored the canonical agent contract as a git submodule
  at `.agents/` (pointing at `github.com/Trance-0/AGENTS.md`), rewrote
  root `AGENTS.md` as an `@`-include of the canon plus Sheaf-specific
  overrides, renamed `docs/TASKS.md` → `docs/TODO.md` per canonical
  §2.5, created this checklist, added `CODEX.md` as a symlink/include
  of `AGENTS.md`.
- 2026-04-14: v0.1.22 deterministic graph layout shipped — radial seed
  by degree, LinLog ForceAtlas2, noverlap post-pass, degree-0 node
  pruning.
- 2026-04-13: v0.1.21 browser-only DB access — deleted every
  `src/app/api/*` DB route and `src/lib/server/`, moved reads / writes
  / migrations / backups into `src/lib/client/` via
  `@neondatabase/serverless`.
