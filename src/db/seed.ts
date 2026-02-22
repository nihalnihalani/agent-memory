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
    // claude-code starts a session, stores key architectural decisions
    {
      agent_id: "claude-code",
      action: "remember",
      target_key: "db-choice-sqlite",
      detail: "Stored database decision: SQLite with FTS5 chosen for zero-config embedded use",
      minutes_ago: 185,
    },
    {
      agent_id: "claude-code",
      action: "remember",
      target_key: "api-style-mcp",
      detail: "Stored API architecture decision: MCP protocol with mcp-use SDK for agent interop",
      minutes_ago: 180,
    },
    {
      agent_id: "claude-code",
      action: "remember",
      target_key: "user-prefers-typescript-strict",
      detail: "Stored user preference: always use TypeScript with strict mode, no any types",
      minutes_ago: 175,
    },
    {
      agent_id: "claude-code",
      action: "remember",
      target_key: "snippet-mcp-tool-pattern",
      detail: "Stored code snippet: mcp-use tool registration with widget() response pattern",
      minutes_ago: 170,
    },
    {
      agent_id: "claude-code",
      action: "remember",
      target_key: "task-implement-recall",
      detail: "Stored task: implement recall tool with composite BM25 + recency scoring",
      minutes_ago: 160,
    },
    // cursor-vscode joins and stores its own findings
    {
      agent_id: "cursor-vscode",
      action: "recall",
      target_key: null,
      detail: "Searched for 'database' -- found SQLite decision stored by claude-code",
      minutes_ago: 145,
    },
    {
      agent_id: "cursor-vscode",
      action: "remember",
      target_key: "frontend-framework-react",
      detail: "Stored frontend decision: React 19 + Tailwind CSS v4 for widget UI",
      minutes_ago: 140,
    },
    {
      agent_id: "cursor-vscode",
      action: "remember",
      target_key: "user-prefers-dark-mode",
      detail: "Stored UI preference: dark mode with oklch color space for contrast",
      minutes_ago: 135,
    },
    {
      agent_id: "cursor-vscode",
      action: "remember",
      target_key: "task-build-dashboard-widget",
      detail: "Stored task: build memory dashboard widget with activity feed and search",
      minutes_ago: 130,
    },
    // ChatGPT joins and recalls cross-agent context
    {
      agent_id: "ChatGPT",
      action: "recall",
      target_key: null,
      detail: "Searched for 'architecture decisions' -- found 3 decisions from claude-code and cursor-vscode",
      minutes_ago: 110,
    },
    {
      agent_id: "ChatGPT",
      action: "recall",
      target_key: null,
      detail: "Searched for 'user preferences' -- found TypeScript strict and dark mode preferences",
      minutes_ago: 108,
    },
    {
      agent_id: "ChatGPT",
      action: "remember",
      target_key: "deploy-target-cloudflare",
      detail: "Stored deployment decision: Cloudflare Workers for edge deployment with D1 migration path",
      minutes_ago: 100,
    },
    {
      agent_id: "ChatGPT",
      action: "remember",
      target_key: "auth-method-mcp-oauth",
      detail: "Stored auth decision: MCP OAuth 2.1 with mcp-use built-in provider support",
      minutes_ago: 95,
    },
    {
      agent_id: "ChatGPT",
      action: "remember",
      target_key: "snippet-composite-scoring",
      detail: "Stored code snippet: composite relevance scoring (BM25 60% + recency 20% + access 10% + type 10%)",
      minutes_ago: 90,
    },
    {
      agent_id: "ChatGPT",
      action: "remember",
      target_key: "task-seed-demo-data",
      detail: "Stored task: create compelling seed data showing multi-agent collaboration",
      minutes_ago: 85,
    },
    // gemini-cli joins and interacts
    {
      agent_id: "gemini-cli-mcp-client",
      action: "recall",
      target_key: null,
      detail: "Searched for 'deployment hosting' -- found Cloudflare decision stored by ChatGPT",
      minutes_ago: 60,
    },
    {
      agent_id: "gemini-cli-mcp-client",
      action: "remember",
      target_key: "note-testing-approach",
      detail: "Stored testing preference: Vitest with in-memory SQLite for fast unit tests",
      minutes_ago: 55,
    },
    {
      agent_id: "gemini-cli-mcp-client",
      action: "list_memories",
      target_key: null,
      detail: "Listed all memories filtered by type=task -- found 3 active tasks",
      minutes_ago: 50,
    },
    // claude-code comes back and recalls what others stored
    {
      agent_id: "claude-code",
      action: "recall",
      target_key: null,
      detail: "Searched for 'auth' -- found MCP OAuth decision stored by ChatGPT",
      minutes_ago: 35,
    },
    {
      agent_id: "claude-code",
      action: "remember",
      target_key: "note-fts5-bug-fix",
      detail: "Stored bug fix note: FTS5 query sanitization needed -- special chars crash MATCH operator",
      minutes_ago: 30,
    },
    // cursor-vscode adds widget progress
    {
      agent_id: "cursor-vscode",
      action: "remember",
      target_key: "note-widget-progress",
      detail: "Stored progress note: dashboard widget 70% done, activity feed and search working",
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

  const seedPath = path.resolve(process.cwd(), "data", "seed.json");
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

    // Seed a demo handoff -- Claude Code got stuck on CSS, hands off to Cursor
    const insertHandoff = db.prepare(`
      INSERT INTO handoffs (from_agent, to_agent, status, summary, stuck_reason, next_steps, context_keys, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', ?))
    `);
    insertHandoff.run(
      "claude-code",
      "cursor-vscode",
      "pending",
      "Implemented the recall tool with composite BM25 scoring and the full backend API. Frontend dashboard needs responsive layout fixes and dark mode polish.",
      "CSS layout issues in the memory card grid -- cards overflow on narrow panels and the shimmer loading animation stutters. Frontend isn't my strength.",
      "1. Fix the memory card grid to be responsive (single column under 400px)\n2. Add hover micro-interactions to the type filter pills\n3. Test the dark mode colors in the actual mcp-use inspector panel\n4. Add a subtle entrance animation for new memories",
      JSON.stringify(["task-build-dashboard-widget", "user-prefers-dark-mode", "frontend-framework-react"]),
      "-25 minutes"
    );

    // Seed a completed handoff for demo storytelling
    insertHandoff.run(
      "ChatGPT",
      null,
      "completed",
      "Researched OAuth providers and wrote the auth decision document. Need someone to implement the actual OAuth flow.",
      null,
      "Implement MCP OAuth 2.1 using mcp-use built-in provider support. See the auth-method-mcp-oauth decision memory for details.",
      JSON.stringify(["auth-method-mcp-oauth", "deploy-target-cloudflare"]),
      "-90 minutes"
    );
    // Mark it as picked up and completed by gemini-cli
    db.prepare(`
      UPDATE handoffs SET picked_up_by = 'gemini-cli-mcp-client', picked_up_at = datetime('now', '-60 minutes'), completed_at = datetime('now', '-40 minutes')
      WHERE status = 'completed' AND from_agent = 'ChatGPT'
    `).run();
  });

  transaction();
  console.log(`Seeded ${seeds.length} memories and ${activities.length} activity log entries`);
}
