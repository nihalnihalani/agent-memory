import type { MCPServer } from "mcp-use/server";
import { text } from "mcp-use/server";
import { z } from "zod";
import type Database from "better-sqlite3";
import {
  listMemories,
  getTagsForMemories,
  getRecentActivity,
  getMemoriesByType,
  getStats,
  getPendingHandoffs,
} from "../db/queries.js";
import { agentDisplayName } from "../tools/helpers.js";

export function registerPrompts(server: MCPServer, db: Database.Database): void {
  server.prompt(
    {
      name: "session-briefing",
      description:
        "Get a full context briefing when starting a new session. Includes all decisions, preferences, pending handoffs, and recent activity — everything you need to hit the ground running.",
      schema: z.object({
        focus: z
          .string()
          .optional()
          .describe("Optional: specific topic to focus on (e.g., 'frontend', 'auth', 'deployment')"),
      }),
    },
    async ({ focus }) => {
      const decisions = getMemoriesByType(db, "decision");
      const preferences = getMemoriesByType(db, "preference");
      const { memories: tasks } = listMemories(db, { type: "task", limit: 10 });
      const pendingHandoffs = getPendingHandoffs(db);
      const activity = getRecentActivity(db, 10);
      const stats = getStats(db);

      const allMems = [...decisions, ...preferences, ...tasks];
      const tagsMap = getTagsForMemories(db, allMems.map((m) => m.id));

      const sections: string[] = [];

      sections.push("# Session Briefing");
      sections.push(
        `You have access to ${stats.totalMemories} memories from ${stats.uniqueAgents} agent(s). ${stats.totalActions} total actions recorded.`
      );
      sections.push("");

      if (pendingHandoffs.length > 0) {
        sections.push("## PENDING HANDOFFS (Action Required!)");
        sections.push("Another agent left work for you. Use the `pickup` tool to accept a handoff.");
        sections.push("");
        for (const h of pendingHandoffs) {
          sections.push(`### Handoff #${h.id} from ${agentDisplayName(h.from_agent)}`);
          sections.push(`Summary: ${h.summary}`);
          if (h.stuck_reason) sections.push(`Stuck: ${h.stuck_reason}`);
          sections.push(`Next steps: ${h.next_steps}`);
          sections.push("");
        }
      }

      if (decisions.length > 0) {
        sections.push("## Key Decisions");
        for (const d of decisions) {
          const dTags = tagsMap.get(d.id) || [];
          if (focus && !d.key.includes(focus) && !d.value.toLowerCase().includes(focus.toLowerCase()) && !dTags.some((t) => t.includes(focus))) {
            continue;
          }
          sections.push(`- **${d.key}**: ${d.value}`);
          if (d.context) sections.push(`  Rationale: ${d.context}`);
        }
        sections.push("");
      }

      if (preferences.length > 0) {
        sections.push("## User Preferences");
        for (const p of preferences) {
          sections.push(`- **${p.key}**: ${p.value}`);
        }
        sections.push("");
      }

      if (tasks.length > 0) {
        sections.push("## Active Tasks");
        for (const t of tasks) {
          sections.push(`- **${t.key}**: ${t.value}`);
        }
        sections.push("");
      }

      if (activity.length > 0) {
        sections.push("## Recent Activity");
        for (const a of activity) {
          sections.push(
            `- ${agentDisplayName(a.agent_id)} ${a.action}${a.target_key ? ` "${a.target_key}"` : ""} (${a.created_at})`
          );
        }
        sections.push("");
      }

      sections.push("## Available Tools");
      sections.push("- `remember` — store a memory (decision, preference, task, snippet, note)");
      sections.push("- `recall` — search memories by natural language");
      sections.push("- `forget` — delete a memory");
      sections.push("- `list-memories` — browse all memories with filtering");
      sections.push("- `handoff` — hand off your work to the next agent");
      sections.push("- `pickup` — pick up a pending handoff");
      sections.push("- `complete-handoff` — mark a handoff as done");
      sections.push("- `export-memories` — export memories as JSON with optional filters");
      sections.push("- `import-memories` — import memories from JSON backup");
      sections.push("- `memory-stats` — view comprehensive memory database statistics");

      return text(sections.join("\n"));
    }
  );
}
