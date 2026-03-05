import type { MCPServer } from "mcp-use/server";
import { text, markdown } from "mcp-use/server";
import type Database from "better-sqlite3";
import {
  listMemories,
  getMemoryByKey,
  getTagsForMemory,
  getTagsForMemories,
  getRecentActivity,
  getMemoriesByType,
  getMemoryCountsByType,
  getMostAccessedMemories,
  getStats,
  getDistinctAgents,
  getActivityByAgent,
  getPendingHandoffs,
  getAllHandoffs,
  getRecentChanges,
} from "../db/queries.js";
import { agentDisplayName, truncate } from "../tools/helpers.js";

export function registerResources(server: MCPServer, db: Database.Database): void {
  // --- memory://current-context ---
  server.resource(
    {
      name: "current-context",
      uri: "memory://current-context",
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
      const pendingHandoffs = getPendingHandoffs(db);

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

      if (decisions.length > 0) {
        sections.push("## Decisions");
        for (const d of decisions) {
          const dTags = tagsMap.get(d.id) || [];
          const dLines = [`- **${d.key}**: ${d.value}`];
          if (d.context) dLines.push(`  Rationale: ${d.context}`);
          if (d.agent_id) dLines.push(`  Decided by: ${agentDisplayName(d.agent_id)} (${d.updated_at})`);
          if (dTags.length > 0) dLines.push(`  Tags: ${dTags.join(", ")}`);
          sections.push(dLines.join("\n"));
        }
        sections.push("");
      }

      if (preferences.length > 0) {
        sections.push("## User Preferences");
        for (const p of preferences) {
          const pTags = tagsMap.get(p.id) || [];
          const tagStr = pTags.length > 0 ? ` [${pTags.join(", ")}]` : "";
          sections.push(`- ${p.key}: ${p.value}${tagStr}`);
        }
        sections.push("");
      }

      if (tasks.length > 0) {
        sections.push("## Recent Tasks");
        for (const t of tasks) {
          const tTags = tagsMap.get(t.id) || [];
          const tagStr = tTags.length > 0 ? ` [${tTags.join(", ")}]` : "";
          const agentStr = t.agent_id ? ` (${agentDisplayName(t.agent_id)})` : "";
          sections.push(`- ${t.key}: ${t.value}${tagStr}${agentStr}`);
        }
        sections.push("");
      }

      if (snippets.length > 0) {
        sections.push("## Code Snippets");
        for (const s of snippets) {
          sections.push(`- ${s.key}: ${s.value.length > 200 ? s.value.substring(0, 200) + "..." : s.value}`);
        }
        sections.push("");
      }

      if (mostAccessed.length > 0) {
        sections.push("## Most Referenced");
        for (const m of mostAccessed) {
          sections.push(`- ${m.key} (${m.type}, accessed ${m.access_count}x): ${m.value.length > 100 ? m.value.substring(0, 100) + "..." : m.value}`);
        }
        sections.push("");
      }

      if (pendingHandoffs.length > 0) {
        sections.push("## PENDING HANDOFFS (Action Required!)");
        sections.push("Another agent left work for you. Use `pickup` tool to accept.");
        for (const h of pendingHandoffs) {
          sections.push(`- Handoff #${h.id} from ${agentDisplayName(h.from_agent)}: ${h.summary}`);
          if (h.stuck_reason) sections.push(`  Stuck: ${h.stuck_reason}`);
          sections.push(`  Next steps: ${h.next_steps}`);
        }
        sections.push("");
      }

      if (activity.length > 0) {
        sections.push("## Last Activity");
        for (const a of activity) {
          const agent = agentDisplayName(a.agent_id);
          sections.push(`- ${agent} ${a.action}${a.target_key ? ` "${a.target_key}"` : ""} (${a.created_at})`);
        }
        sections.push("");
      }

      if (stats.totalMemories === 0) {
        sections.length = 0;
        sections.push("=== CURRENT PROJECT CONTEXT ===");
        sections.push("");
        sections.push("No memories stored yet. Use the `remember` tool to start building project context.");
        sections.push("Examples:");
        sections.push('  remember({ key: "project-stack", value: "Next.js + PostgreSQL", type: "decision" })');
        sections.push('  remember({ key: "user-prefers-typescript", value: "Always use TypeScript", type: "preference" })');
      }

      return markdown(sections.join("\n"));
    }
  );

  // --- memory://agent-activity ---
  server.resource(
    {
      name: "agent-activity",
      uri: "memory://agent-activity",
      description:
        "Agent activity feed: which AI agents have been working, what they stored/searched/deleted, and when. Use this to understand cross-agent collaboration.",
      mimeType: "text/plain",
    },
    async () => {
      const activity = getRecentActivity(db, 50);
      const agents = getDistinctAgents(db);
      const stats = getStats(db);

      if (activity.length === 0) {
        return text("No agent activity recorded yet. Activity is logged automatically when agents use remember, recall, forget, or list-memories tools.");
      }

      const lines: string[] = [];

      lines.push("=== AGENT ACTIVITY FEED ===");
      lines.push(`${stats.uniqueAgents} agent(s) | ${stats.totalActions} total actions`);
      lines.push("");

      if (agents.length > 0) {
        lines.push("## Agent Summary");
        for (const agentIdVal of agents) {
          const agentActivity = getActivityByAgent(db, agentIdVal, 1);
          const displayName = agentDisplayName(agentIdVal);
          if (agentActivity.length > 0) {
            const last = agentActivity[0];
            lines.push(`- ${displayName} (${agentIdVal}): last active ${last.created_at}, last action: ${last.action}${last.target_key ? ` "${last.target_key}"` : ""}`);
          } else {
            lines.push(`- ${displayName} (${agentIdVal})`);
          }
        }
        lines.push("");
      }

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

      return markdown(lines.join("\n"));
    }
  );

  // --- memory://{key} resource template ---
  server.resourceTemplate(
    {
      uriTemplate: "memory://{key}",
      name: "Memory by Key",
      mimeType: "application/json",
    },
    async (uri: URL, params: Record<string, string>) => {
      const memory = getMemoryByKey(db, params.key);
      if (!memory) {
        return text("Memory not found: " + params.key);
      }
      const tags = getTagsForMemory(db, memory.id);
      return text(JSON.stringify({ ...memory, tags }, null, 2));
    }
  );

  // --- memory://handoff-queue ---
  server.resource(
    {
      name: "handoff-queue",
      uri: "memory://handoff-queue",
      description:
        "Pending handoffs from other agents. Read this when you first connect to see if another agent left work for you to pick up. This is how agents pass the baton in a relay.",
      mimeType: "text/plain",
    },
    async () => {
      const pending = getPendingHandoffs(db);
      const all = getAllHandoffs(db, 10);

      if (all.length === 0) {
        return text("No handoffs yet. Use the `handoff` tool when you want another agent to continue your work.");
      }

      const lines: string[] = [];
      lines.push("=== HANDOFF QUEUE ===");
      lines.push("");

      if (pending.length > 0) {
        lines.push(`## Pending Handoffs (${pending.length})`);
        lines.push("These are waiting for an agent to pick up. Use `pickup` tool to accept one.");
        lines.push("");
        for (const h of pending) {
          const contextKeys = h.context_keys ? JSON.parse(h.context_keys) : [];
          lines.push(`### Handoff #${h.id} from ${agentDisplayName(h.from_agent)}`);
          lines.push(`Created: ${h.created_at}`);
          if (h.to_agent) lines.push(`Preferred agent: ${agentDisplayName(h.to_agent)}`);
          lines.push(`Summary: ${h.summary}`);
          if (h.stuck_reason) lines.push(`Stuck because: ${h.stuck_reason}`);
          lines.push(`Next steps: ${h.next_steps}`);
          if (contextKeys.length > 0) lines.push(`Context keys: ${contextKeys.join(", ")}`);
          lines.push("");
        }
      } else {
        lines.push("No pending handoffs -- all caught up!");
        lines.push("");
      }

      const completed = all.filter(h => h.status === "completed");
      const inProgress = all.filter(h => h.status === "in_progress");

      if (inProgress.length > 0) {
        lines.push(`## In Progress (${inProgress.length})`);
        for (const h of inProgress) {
          lines.push(`- Handoff #${h.id}: ${agentDisplayName(h.from_agent)} → ${agentDisplayName(h.picked_up_by || "unknown")} | ${h.summary.substring(0, 80)}`);
        }
        lines.push("");
      }

      if (completed.length > 0) {
        lines.push(`## Recently Completed (${completed.length})`);
        for (const h of completed) {
          lines.push(`- Handoff #${h.id}: ${agentDisplayName(h.from_agent)} → ${agentDisplayName(h.picked_up_by || "unknown")} | ${h.summary.substring(0, 80)}`);
        }
        lines.push("");
      }

      return markdown(lines.join("\n"));
    }
  );

  // --- memory://changelog ---
  server.resource(
    {
      name: "changelog",
      uri: "memory://changelog",
      description:
        "Memory change history: see how decisions and preferences evolved over time, who changed what, and the old vs new values.",
      mimeType: "text/plain",
    },
    async () => {
      const changes = getRecentChanges(db, 20);

      if (changes.length === 0) {
        return text("No memory changes recorded yet. History is tracked automatically when memories are updated.");
      }

      const lines: string[] = [];
      lines.push("=== MEMORY CHANGELOG ===");
      lines.push("");

      for (const c of changes) {
        lines.push(`**${c.key}** changed by ${agentDisplayName(c.changed_by || "unknown")} at ${c.changed_at}`);
        lines.push(`  Old: ${truncate(c.old_value, 150)}`);
        const current = getMemoryByKey(db, c.key);
        if (current) {
          lines.push(`  New: ${truncate(current.value, 150)}`);
        }
        lines.push("");
      }

      return markdown(lines.join("\n"));
    }
  );
}
