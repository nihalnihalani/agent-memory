import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Database from "better-sqlite3";
import {
  getActivityByAgent,
  getDistinctAgents,
  getMemoriesByType,
  getMemoryCountsByType,
  getMostAccessedMemories,
  getRecentActivity,
  getStats,
  getTagsForMemories,
  listMemories,
} from "../db/queries.js";

/**
 * Map raw clientInfo.name values to human-readable display names.
 * These values come from the MCP initialize handshake and are inconsistent
 * across clients (PascalCase, kebab-case, full words).
 */
function agentDisplayName(agentId: string): string {
  const map: Record<string, string> = {
    "claude-ai": "Claude (web)",
    "claude-code": "Claude Code",
    "claude-desktop": "Claude Desktop",
    "ChatGPT": "ChatGPT",
    "cursor-vscode": "Cursor",
    "Visual Studio Code": "VS Code",
    "Cline": "Cline",
    "Codex": "OpenAI Codex",
    "goose": "Goose",
    "gemini-cli-mcp-client": "Gemini CLI",
    "github-copilot-developer": "GitHub Copilot",
    "Roo-Code": "Roo Code",
    "Q-DEV-CLI": "Amazon Q",
    "unknown": "Unknown Agent",
  };
  return map[agentId] || agentId;
}

export function registerResources(server: McpServer, db: Database.Database): void {
  // memory://current-context
  // This is the "magic" resource -- auto-surfaced when any agent connects.
  // It gives the new agent instant awareness of the entire project state.
  server.registerResource(
    "current-context",
    "memory://current-context",
    {
      description:
        "Current working context: all decisions, preferences, recent tasks, code snippets, and agent activity. Read this first to understand the project state.",
      mimeType: "text/plain",
    },
    async () => {
      const decisions = getMemoriesByType(db, "decision");
      const preferences = getMemoriesByType(db, "preference");
      const { memories: tasks } = listMemories(db, { type: "task", limit: 5 });
      const { memories: snippets } = listMemories(db, { type: "snippet", limit: 3 });
      const mostAccessed = getMostAccessedMemories(db, 3);
      const activity = getRecentActivity(db, 5);
      const stats = getStats(db);
      const typeCounts = getMemoryCountsByType(db);
      const agents = getDistinctAgents(db);

      // Bulk fetch tags for all memories in one query
      const allMemories = [...decisions, ...preferences, ...tasks, ...snippets];
      const tagsMap = getTagsForMemories(db, allMemories.map((m) => m.id));

      const sections: string[] = [];

      sections.push("=== CURRENT PROJECT CONTEXT ===");
      sections.push(`${stats.totalMemories} memories stored by ${stats.uniqueAgents} agent(s) | ${stats.totalActions} total actions`);
      if (Object.keys(typeCounts).length > 0) {
        const breakdown = Object.entries(typeCounts)
          .map(([t, c]) => `${c} ${t}${c !== 1 ? "s" : ""}`)
          .join(", ");
        sections.push(`Breakdown: ${breakdown}`);
      }
      if (agents.length > 0) {
        sections.push(`Active agents: ${agents.map(agentDisplayName).join(", ")}`);
      }
      sections.push("");

      // Decisions are the most important context -- they tell the agent WHY things are the way they are
      if (decisions.length > 0) {
        sections.push("## Decisions");
        for (const d of decisions) {
          const tags = tagsMap.get(d.id) || [];
          const lines = [`- **${d.key}**: ${d.value}`];
          if (d.context) lines.push(`  Rationale: ${d.context}`);
          if (d.agent_id) lines.push(`  Decided by: ${agentDisplayName(d.agent_id)} (${d.updated_at})`);
          if (tags.length > 0) lines.push(`  Tags: ${tags.join(", ")}`);
          sections.push(lines.join("\n"));
        }
        sections.push("");
      }

      // Preferences are quick wins -- the agent can immediately adapt
      if (preferences.length > 0) {
        sections.push("## User Preferences");
        for (const p of preferences) {
          const tags = tagsMap.get(p.id) || [];
          const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
          sections.push(`- ${p.key}: ${p.value}${tagStr}`);
        }
        sections.push("");
      }

      // Tasks show what's currently in progress
      if (tasks.length > 0) {
        sections.push("## Recent Tasks");
        for (const t of tasks) {
          const tags = tagsMap.get(t.id) || [];
          const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
          const agentStr = t.agent_id ? ` (${agentDisplayName(t.agent_id)})` : "";
          sections.push(`- ${t.key}: ${t.value}${tagStr}${agentStr}`);
        }
        sections.push("");
      }

      // Snippets are reusable code/configs
      if (snippets.length > 0) {
        sections.push("## Code Snippets");
        for (const s of snippets) {
          sections.push(`- ${s.key}: ${s.value.length > 200 ? s.value.substring(0, 200) + "..." : s.value}`);
        }
        sections.push("");
      }

      // Most-accessed memories are the "hottest" context -- things agents keep asking about
      if (mostAccessed.length > 0) {
        sections.push("## Most Referenced");
        for (const m of mostAccessed) {
          sections.push(`- ${m.key} (${m.type}, accessed ${m.access_count}x): ${m.value.length > 100 ? m.value.substring(0, 100) + "..." : m.value}`);
        }
        sections.push("");
      }

      // Recent activity gives a sense of momentum and cross-agent awareness
      if (activity.length > 0) {
        sections.push("## Last Activity");
        for (const a of activity) {
          const agent = agentDisplayName(a.agent_id);
          sections.push(`- ${agent} ${a.action}${a.target_key ? ` "${a.target_key}"` : ""} (${a.created_at})`);
        }
        sections.push("");
      }

      // If everything is empty, provide a welcoming message
      if (stats.totalMemories === 0) {
        sections.length = 0;
        sections.push("=== CURRENT PROJECT CONTEXT ===");
        sections.push("");
        sections.push("No memories stored yet. Use the `remember` tool to start building project context.");
        sections.push("Examples:");
        sections.push('  remember({ key: "project-stack", value: "Next.js + PostgreSQL", type: "decision" })');
        sections.push('  remember({ key: "user-prefers-typescript", value: "Always use TypeScript", type: "preference" })');
      }

      return {
        contents: [
          {
            uri: "memory://current-context",
            mimeType: "text/plain",
            text: sections.join("\n"),
          },
        ],
      };
    }
  );

  // memory://agent-activity
  // Powers the "cross-agent awareness" demo moment.
  // When ChatGPT reads this, it can see exactly what Claude did, when, and why.
  server.registerResource(
    "agent-activity",
    "memory://agent-activity",
    {
      description:
        "Agent activity feed: which AI agents have been working, what they stored/searched/deleted, and when. Use this to understand cross-agent collaboration.",
      mimeType: "text/plain",
    },
    async () => {
      const activity = getRecentActivity(db, 50);
      const agents = getDistinctAgents(db);
      const stats = getStats(db);

      if (activity.length === 0) {
        return {
          contents: [
            {
              uri: "memory://agent-activity",
              mimeType: "text/plain",
              text: "No agent activity recorded yet. Activity is logged automatically when agents use remember, recall, forget, or list_memories tools.",
            },
          ],
        };
      }

      const lines: string[] = [];

      lines.push("=== AGENT ACTIVITY FEED ===");
      lines.push(`${stats.uniqueAgents} agent(s) | ${stats.totalActions} total actions`);
      lines.push("");

      // Per-agent summary -- the "who's been here" section
      if (agents.length > 0) {
        lines.push("## Agent Summary");
        for (const agentId of agents) {
          const agentActivity = getActivityByAgent(db, agentId, 1);
          const displayName = agentDisplayName(agentId);
          if (agentActivity.length > 0) {
            const last = agentActivity[0];
            lines.push(`- ${displayName} (${agentId}): last active ${last.created_at}, last action: ${last.action}${last.target_key ? ` "${last.target_key}"` : ""}`);
          } else {
            lines.push(`- ${displayName} (${agentId})`);
          }
        }
        lines.push("");
      }

      // Full chronological feed
      lines.push("## Recent Actions (newest first)");
      for (const a of activity) {
        const agent = agentDisplayName(a.agent_id);
        lines.push(`[${a.created_at}] ${agent} (${a.agent_id})`);
        lines.push(`  Action: ${a.action}${a.target_key ? ` -> "${a.target_key}"` : ""}`);
        if (a.detail) {
          lines.push(`  Detail: ${a.detail}`);
        }
        lines.push("");
      }

      return {
        contents: [
          {
            uri: "memory://agent-activity",
            mimeType: "text/plain",
            text: lines.join("\n"),
          },
        ],
      };
    }
  );
}
