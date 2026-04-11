<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Sheaf: AI Intelligent News Graph

### Overview

Sheaf is an investment and career intelligence interactive graph visualizer. It renders entities (companies, government agencies, people) as nodes, sizing them by their impact. The edges represent news/event clusters over the past 3 years. The project filters, ranks, and summarizes massive news inputs to give a focused timeline on 5-day, 5-week, 5-month, and 5-year outlook horizons.

### Target Audience

Single-user, local-first intelligence board. It is NOT built for public SaaS consumption. Emphasize lightweight maintenance and high personal leverage.

### Tech Stack & Architecture

- **Frontend App Shell**: Next.js (App Router). Extensively use TailwindCSS to implement modern, beautiful, dynamic web design. Maintain glassmorphic UI dynamics and responsive grid handling dynamically adapting without relying on rigid Vanilla CSS.
- **Graph Visualization**: `@react-sigma/core` with `graphology` and `graphology-layout-forceatlas2`.
- **Database Layer**: Neon Postgres managed via **Prisma ORM**.
- **Backend APIs**: Handled via Next.js server routes.
- **Data Pipeline Context** (Running separately, feeding DB):
  - Sources: GDELT (event data) + OpenBB (financials).
  - LLM: Local Ollama process evaluating impact scores on 5d, 5w, 5m, 5y scales and summarizing textual artifacts (node/edge cards).

### Data Model Foundations (Prisma)

- **Node**: Abstract entity (company, agency, person, sector).
- **Edge**: Event cluster (NOT individual raw articles; articles map to events to prevent hairball graphs).
- **Card**: Cached AI output describing the exact impact rationale.

### UI Principles

1. UI MUST be "beautiful, dynamic web design" featuring glassmorphism, responsive grid handling, proper padding, and custom web fonts (Inter).
2. Avoid over-cluttering the main Sigma Canvas. Keep detail drill-downs in a robust `SidePanel` that slides contextually into view when hovering/clicking on Nodes or Edges.
3. Incorporate color-coded impact weighting (`#10b981` positive, `#ef4444` negative, `#9ca3af` neutral) at both graph layout and detail levels.

### Documentation Maintenance

**CRITICAL RULE FOR ALL AGENTS WORKING ON THIS PROJECT:**
You MUST actively maintain and update the project documentation upon completing any update.

- If you fix a bug or complete a feature, ensure everything is correctly reflected in the docs.
- Move completed items from `docs/TASK.md` to a new `<Pending-version>.<inc-numeral>.md` in `docs/versions`.
- Increment the third digit of the `VERSION` file appropriately upon finalizing each pull-request/update context.
