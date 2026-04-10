# Sheaf Local Setup Guide

I've set up the foundational layer for **Sheaf** as you designed it: a Next.js (App Router) full-stack app, integrated with Prisma ORM for database migrations, and visually anchored by a dynamic, beautifully styled Sigma.js graph viewer.

## 1. Local Database & Migrations

Since scaling from SQLite to Postgres later often introduces friction, we started with **Postgres** and **Prisma ORM** directly. 

1. Create a free **Neon Postgres** database.
2. Update the `.env` file with your connection URL:
   ```env
   DATABASE_URL="postgres://<user>:<password>@<neon-region>.aws.neon.tech/neondb?sslmode=require"
   ```
3. Run the initial migration to safely push the schema and create tables:
   ```bash
   npx prisma migrate dev --name init
   ```
*This command tracks the structural changes in SQL files stored in your repository, so the database transitions through new feature deployments smoothly.*

## 2. Running the Full-Stack Web App

1. Install any remaining dependencies using `npm install`.
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:3000` in your browser.

## 3. What Was Built

* **Sleek UI Architecture**: A dark-mode, glassmorphic UI matching modern premium visuals (responsive tabs, smoothly animated glass panels). Built without Tailwind to maximize structural styling control as requested.
* **Sigma.js Integration**: The main `<GraphCanvas />` utilizes `@react-sigma/core` and `graphology` with a ForceAtlas2 layout for performant network visualization holding up to thousands of entity nodes and event edges.
* **Component Abstractions**:
  * `GraphCanvas.tsx`: Main map of events (edges) and entities (nodes) correctly formatted with size-weight impact scaling.
  * `SidePanel.tsx`: Dedicated AI-summary cards with 5d/5w/5m/5y score horizon layouts.
* **Prisma Schema**: Explicit `schema.prisma` definitions separating _Entities_, _Snapshots_, _Events_, and cached _AI Summaries_.

## 4. Next Development Steps
- **Data Hydration**: Create an `src/app/api/graph/route.ts` that `Prisma` fetches rather than the static mock generator in `GraphCanvas.tsx`.
- **Ollama Pipeline**: Configure a separate Python cron script that pulls new articles, clusters them, asks local `Ollama` for 5d/5w/5m/5y rubrics, and inserts these into Neon Postgres for the frontend to render.
