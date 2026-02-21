import type Database from "better-sqlite3";
import { upsertMemory } from "./queries.js";
import fs from "fs";
import path from "path";

interface SeedMemory {
  key: string;
  value: string;
  type: string;
  context: string;
  agent_id: string;
  tags: string[];
}

interface SeedActivity {
  agent_id: string;
  action: string;
  target_key: string | null;
  detail: string;
  minutes_ago: number;
}

function getSeedActivities(): SeedActivity[] {
  return [
    // claude-ai starts a session, stores key architectural decisions
    {
      agent_id: "claude-ai",
      action: "remember",
      target_key: "db-choice-postgresql",
      detail: "Stored database decision: PostgreSQL 16 chosen over MySQL for JSONB support",
      minutes_ago: 185,
    },
    {
      agent_id: "claude-ai",
      action: "remember",
      target_key: "api-style-rest",
      detail: "Stored API architecture decision: REST with OpenAPI 3.1 over GraphQL",
      minutes_ago: 180,
    },
    {
      agent_id: "claude-ai",
      action: "remember",
      target_key: "user-prefers-typescript",
      detail: "Stored user preference: always use TypeScript with strict mode, no any types",
      minutes_ago: 175,
    },
    {
      agent_id: "claude-ai",
      action: "remember",
      target_key: "snippet-db-connection",
      detail: "Stored code snippet: PostgreSQL connection pool pattern with pg driver",
      minutes_ago: 170,
    },
    {
      agent_id: "claude-ai",
      action: "remember",
      target_key: "task-implement-auth",
      detail: "Stored task: implement Clerk authentication with Google OAuth",
      minutes_ago: 160,
    },
    // cursor-vscode joins and stores its own findings
    {
      agent_id: "cursor-vscode",
      action: "recall",
      target_key: null,
      detail: "Searched for 'database' -- found PostgreSQL decision stored by claude-ai",
      minutes_ago: 145,
    },
    {
      agent_id: "cursor-vscode",
      action: "remember",
      target_key: "frontend-framework-react",
      detail: "Stored frontend decision: React 19 + Next.js 15 + Tailwind CSS v4",
      minutes_ago: 140,
    },
    {
      agent_id: "cursor-vscode",
      action: "remember",
      target_key: "user-prefers-tabs",
      detail: "Stored editor preference: tabs over spaces, width of 2",
      minutes_ago: 135,
    },
    {
      agent_id: "cursor-vscode",
      action: "remember",
      target_key: "task-write-tests",
      detail: "Stored task: write integration tests with Vitest, target 80% coverage",
      minutes_ago: 130,
    },
    // ChatGPT joins and recalls cross-agent context
    {
      agent_id: "ChatGPT",
      action: "recall",
      target_key: null,
      detail: "Searched for 'architecture decisions' -- found 3 decisions from claude-ai and cursor-vscode",
      minutes_ago: 110,
    },
    {
      agent_id: "ChatGPT",
      action: "recall",
      target_key: null,
      detail: "Searched for 'user preferences' -- found TypeScript and tabs preferences",
      minutes_ago: 108,
    },
    {
      agent_id: "ChatGPT",
      action: "remember",
      target_key: "hosting-decision-vercel-railway",
      detail: "Stored deployment decision: Vercel for frontend, Railway for backend and PostgreSQL",
      minutes_ago: 100,
    },
    {
      agent_id: "ChatGPT",
      action: "remember",
      target_key: "user-prefers-dark-mode",
      detail: "Stored UI preference: dark mode with oklch color space for contrast",
      minutes_ago: 95,
    },
    {
      agent_id: "ChatGPT",
      action: "remember",
      target_key: "snippet-api-error-handler",
      detail: "Stored code snippet: Express global error handler with AppError class",
      minutes_ago: 90,
    },
    {
      agent_id: "ChatGPT",
      action: "remember",
      target_key: "task-deploy-production",
      detail: "Stored task: deploy to Vercel + Railway with GitHub Actions CI/CD",
      minutes_ago: 85,
    },
    // claude-ai comes back and recalls what others stored
    {
      agent_id: "claude-ai",
      action: "recall",
      target_key: null,
      detail: "Searched for 'deployment hosting' -- found Railway decision stored by ChatGPT",
      minutes_ago: 60,
    },
    {
      agent_id: "claude-ai",
      action: "remember",
      target_key: "note-standup-feb20",
      detail: "Stored standup notes: auth integration 80% done, Clerk webhook issue with SVIX",
      minutes_ago: 55,
    },
    {
      agent_id: "claude-ai",
      action: "list_memories",
      target_key: null,
      detail: "Listed all memories filtered by type=task -- found 3 active tasks",
      minutes_ago: 50,
    },
    // ChatGPT finds a bug and logs it
    {
      agent_id: "ChatGPT",
      action: "remember",
      target_key: "note-login-bug",
      detail: "Stored bug report: login form double-submit on slow connections, needs isLoading state",
      minutes_ago: 35,
    },
    {
      agent_id: "ChatGPT",
      action: "recall",
      target_key: null,
      detail: "Searched for 'auth login' -- found auth task and login bug, cross-referencing",
      minutes_ago: 30,
    },
    // cursor-vscode adds performance metrics
    {
      agent_id: "cursor-vscode",
      action: "remember",
      target_key: "note-perf-metrics",
      detail: "Stored performance baseline: API p95=120ms, LCP=1.2s from Datadog and Lighthouse",
      minutes_ago: 15,
    },
    {
      agent_id: "cursor-vscode",
      action: "recall",
      target_key: null,
      detail: "Searched for 'current tasks' -- found 3 tasks across all agents",
      minutes_ago: 10,
    },
  ];
}

export function seedDatabase(db: Database.Database): void {
  const count = (db.prepare(`SELECT COUNT(*) as c FROM memories`).get() as { c: number }).c;
  if (count > 0) {
    return;
  }

  const seedPath = path.join(process.cwd(), "data", "seed.json");
  if (!fs.existsSync(seedPath)) {
    console.warn("No seed.json found at", seedPath);
    return;
  }

  const seeds: SeedMemory[] = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
  const activities = getSeedActivities();

  const insertActivity = db.prepare(
    `INSERT INTO activity_log (agent_id, action, target_key, detail, created_at)
     VALUES (?, ?, ?, ?, datetime('now', ?))`
  );

  const transaction = db.transaction(() => {
    for (const seed of seeds) {
      upsertMemory(db, {
        key: seed.key,
        value: seed.value,
        type: seed.type,
        context: seed.context,
        agent_id: seed.agent_id,
        tags: seed.tags,
      });
    }

    for (const activity of activities) {
      insertActivity.run(
        activity.agent_id,
        activity.action,
        activity.target_key,
        activity.detail,
        `-${activity.minutes_ago} minutes`
      );
    }
  });

  transaction();
  console.log(`Seeded ${seeds.length} memories and ${activities.length} activity log entries`);
}
