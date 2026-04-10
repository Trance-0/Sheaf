# Skill: Update Job Entries via CLI

## Objective
Teach the agent how to manually update the tracking database with newly acquired recruiting/hiring information, mapping the agency and the job posting as nodes and edges in the Prisma postgres schema.

## Tool Context
You have access to a local TypeScript script: `scripts/update_jobs.ts`. This interacts directly with the Prisma Client.

## Execution Steps

1. Always run this script using `tsx` (TypeScript Execute). Ensure dependencies are installed by running `npm i tsx -D` if needed.
2. To add a job explicitly when you find new recruiting information:
   ```bash
   npx tsx scripts/update_jobs.ts add-job "<Agency Name>" "<Job Title>" "<Posting URL>" "<YYYY-MM-DD>" "[Optional Description]"
   ```
   **Example:**
   ```bash
   npx tsx scripts/update_jobs.ts add-job "OpenAI Careers" "AI Researcher" "https://openai.com/jobs" "2024-03-01" "Research on RLHF."
   ```
3. To verify that it successfully propagated to Postgres:
   ```bash
   npx tsx scripts/update_jobs.ts list-jobs
   ```

## Rules
- When you add a job, the script acts as a proxy event cluster. The Agency is mapped as an `Entity` node (if it is not already in the DB). The Job acts as an `Event` edge with assumed positive momentum horizons (5d/5w), and the specific URL is cached as an `Article` tied to the event. 
- Always ensure date formatting (`YYYY-MM-DDT00:00:00Z` or standard formats acceptable by JS Date) before submitting.
- Avoid passing quotes inside the text strings directly, escape them if necessary on CMD or PowerShell.
