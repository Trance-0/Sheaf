# TASKS

Pending version: 0.1

Here is a list of task we need to do now after testing, finishing and solve these bugs in order, and check the item from the list when you are done, ignore the checked items.

If certain functionality in frontend involves changes in backend, add the backend function in the corresponding module and test them before implementing them in frontend, provide options for hard to implement features.

For testing backend, check render-mcp, the api key and database credentials is in the local `sample.test.env`, or `sample.render.env` file.

Add items if

- You find additional features that I described to you but is not implemented to keep them on track and let me know you get to it.
- A big task that needs to be decomposed into smaller tasks, and test on each steps.

For the bug you fixed on this round, create a new `<Pending-version>.<inc-numeral>.md` in ./docs/versions, move your finished item (delete the completed item in this file) to this new file, follow the templated defined in previous files.

**Versioning rule:** On each update, increment the third digit in `./VERSION` (e.g. `0.1.8` -> `0.1.9`). The first two digits (`0.1`) are controlled by humans only — never change them. The `VERSION` file is read by `prepare_env.sh` to tag Docker images as `v<VERSION>.<BUILD_NUMBER>`.

Let me know any environment variables need to be updated. After all edits are done, check every test passed. COMMIT and I will push after check.

Always finish `> Urgent` tasks first if exists.

PAUSE WHEN CREDIT LIMIT RUNS OUT BEFORE CONTINUE THE NEXT TASK 

## Current Tasks

> Urgent

- [ ] Remove the backend data probing task defined in github action, instead, let user's agents to add the entries for them and we will deploy the front end only. Set up the project to be deployed on Vercel, with analytics and speed insights.
- [ ] Multi-file ingestion in the 'News' tab via embedded OpenClaw conversation protocol (deferred from v0.1.7). The filter-only News view has shipped; the upload/ingest side will be a client-side flow that hands files to an OpenClaw conversation that parses and inserts events using the same dedup protocol as `skills/news_crawl/update_news.ts`.
- [ ] Move the `kind` discriminator off of "event has ≥2 entities" (tech debt from 0.1.7) onto an explicit `Event.category` column via `prisma db push`. Migrate existing rows: single-agency events → `job`, multi-entity events → `news`.

