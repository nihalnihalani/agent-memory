import { MCPServer, text, error, widget, markdown } from "mcp-use/server";
import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";
import { initializeDatabase } from "./src/db/schema.js";
import { seedDatabase } from "./src/db/seed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  upsertMemory,
  searchMemories,
  deleteMemory,
  listMemories,
  logActivity,
  getMemoryByKey,
  getTagsForMemory,
  getTagsForMemories,
  incrementAccessCount,
  getRecentActivity,
  getMemoriesByType,
  getMemoryCountsByType,
  getMostAccessedMemories,
  getStats,
  getDistinctAgents,
  getActivityByAgent,
} from "./src/db/queries.js";
import type { SearchResultRow } from "./src/db/queries.js";
import { agentDisplayName, relativeTime, truncate, getAgentId } from "./src/tools/helpers.js";

// --- Database initialization ---
const dbPath = path.resolve(__dirname, "data", "agent-memory.db");
const db = initializeDatabase(dbPath);
seedDatabase(db);

// --- MCP Server ---
const server = new MCPServer({
  name: "agent-memory",
  title: "Agent Memory",
  version: "1.0.0",
  description: "Shared memory layer for multi-agent collaboration. Store, search, and recall knowledge across AI agents.",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  favicon: "favicon.ico",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

// --- Type priority weights for composite scoring ---
const TYPE_PRIORITY: Record<string, number> = {
  decision: 1.0,
  preference: 0.9,
  task: 0.8,
  snippet: 0.7,
  note: 0.5,
};

function computeCompositeScore(
  result: SearchResultRow,
  normalizedBm25: number,
  maxAccessCount: number
): number {
  const now = Date.now();
  const created = new Date(result.created_at + (result.created_at.endsWith("Z") ? "" : "Z")).getTime();
  const ageDays = (now - created) / (1000 * 60 * 60 * 24);
  const recencyScore = 1.0 / (1.0 + ageDays * 0.1);

  const accessScore = maxAccessCount > 0
    ? Math.log(1 + result.access_count) / Math.log(1 + maxAccessCount)
    : 0;

  const typePriority = TYPE_PRIORITY[result.type] ?? 0.5;

  return (0.6 * normalizedBm25) + (0.2 * recencyScore) + (0.1 * accessScore) + (0.1 * typePriority);
}

// ========================
// TOOLS
// ========================

const memoryTypeEnum = z.enum(["decision", "preference", "task", "snippet", "note"]);

// --- remember ---
server.tool(
  {
    name: "remember",
    description:
      "Store a memory that can be recalled later by any AI agent. Use this to save important facts, decisions, user preferences, code snippets, or any information worth remembering across conversations.",
    schema: z.object({
      key: z.string().describe("Short descriptive identifier (e.g., 'project-db-schema', 'user-prefers-dark-mode')"),
      value: z.string().describe("The content to remember. Can be plain text, code, JSON, or any string."),
      type: memoryTypeEnum.optional().describe(
        "Memory type. 'decision' for architectural choices, 'preference' for user prefs, 'task' for current work, 'snippet' for code, 'note' for general."
      ),
      tags: z.array(z.string()).optional().describe("Optional tags for categorization (e.g., ['preference', 'ui'], ['code', 'python'])"),
      context: z.string().optional().describe("Why you're storing this -- what problem you're solving, what alternative you considered"),
    }),
    widget: {
      name: "memory-dashboard",
      invoking: "Storing memory...",
      invoked: "Memory stored",
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  async (params, ctx) => {
    try {
      const agentId = getAgentId(ctx);
      const existing = getMemoryByKey(db, params.key);

      const memory = upsertMemory(db, {
        key: params.key,
        value: params.value,
        type: params.type,
        context: params.context,
        agent_id: agentId,
        tags: params.tags,
      });

      const tags = getTagsForMemory(db, memory.id);

      if (existing) {
        const originalAgent = existing.agent_id ? agentDisplayName(existing.agent_id) : "Unknown";
        const isConflict = existing.agent_id && existing.agent_id !== agentId && existing.value !== params.value;

        logActivity(db, {
          agent_id: agentId,
          action: "remember",
          target_key: params.key,
          detail: `Updated ${params.type || "note"}: ${params.key} (originally by ${originalAgent})`,
        });

        const textOutput = [
          `Updated memory '${memory.key}' (originally stored by ${originalAgent})`,
          `Type: ${memory.type}`,
          `Value: ${memory.value}`,
          tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
          memory.context ? `Context: ${memory.context}` : null,
        ].filter(Boolean).join("\n");

        return widget({
          props: {
            action: isConflict ? "conflict" : "updated",
            memory: {
              id: memory.id,
              key: memory.key,
              value: memory.value,
              type: memory.type,
              context: memory.context,
              agent_id: memory.agent_id,
              created_at: memory.created_at,
              updated_at: memory.updated_at,
              access_count: memory.access_count,
              tags,
            },
            originalAgent: existing.agent_id,
            originalValue: isConflict ? existing.value : undefined,
          },
          output: text(textOutput),
        });
      } else {
        logActivity(db, {
          agent_id: agentId,
          action: "remember",
          target_key: params.key,
          detail: `Stored ${params.type || "note"}: ${params.key}`,
        });

        const textOutput = [
          `Stored new [${memory.type}] memory '${memory.key}'`,
          `Value: ${memory.value}`,
          tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
          memory.context ? `Context: ${memory.context}` : null,
        ].filter(Boolean).join("\n");

        return widget({
          props: {
            action: "created",
            memory: {
              id: memory.id,
              key: memory.key,
              value: memory.value,
              type: memory.type,
              context: memory.context,
              agent_id: memory.agent_id,
              created_at: memory.created_at,
              updated_at: memory.updated_at,
              access_count: memory.access_count,
              tags,
            },
          },
          output: text(textOutput),
        });
      }
    } catch (err: any) {
      return error(`Error: ${err.message}`);
    }
  }
);

// --- recall ---
server.tool(
  {
    name: "recall",
    description:
      "Search and retrieve stored memories. Uses full-text search to find relevant memories by topic, or filter by tags.",
    schema: z.object({
      query: z.string().describe("Natural language search query (e.g., 'What database does the project use?')"),
      tags: z.array(z.string()).optional().describe("Optional: filter to memories with these tags"),
      type: memoryTypeEnum.optional().describe("Optional: filter to memories of this type"),
      limit: z.number().min(1).max(20).optional().describe("Max results to return (default: 5, max: 20)"),
    }),
    widget: {
      name: "memory-dashboard",
      invoking: "Searching memories...",
      invoked: "Results ready",
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async (params, ctx) => {
    try {
      const agentId = getAgentId(ctx);
      const requestedLimit = Math.min(Math.max(params.limit || 5, 1), 20);

      const rawResults = searchMemories(db, {
        query: params.query,
        tags: params.tags,
        type: params.type,
        limit: requestedLimit,
      });

      logActivity(db, {
        agent_id: agentId,
        action: "recall",
        target_key: params.query,
        detail: `Searched for: "${params.query}" (${rawResults.length} results)`,
      });

      if (rawResults.length === 0) {
        return widget({
          props: {
            memories: [],
            query: params.query,
            total: 0,
          },
          output: text(`No memories found matching "${params.query}". Try a broader search.`),
        });
      }

      // --- Composite scoring ---
      const bm25Scores = rawResults.map((r) => r.rank);
      const minBm25 = Math.min(...bm25Scores);
      const maxBm25 = Math.max(...bm25Scores);
      const bm25Range = maxBm25 - minBm25;
      const maxAccessCount = Math.max(...rawResults.map((r) => r.access_count), 1);

      const scored = rawResults.map((r) => {
        const normalizedBm25 = bm25Range !== 0
          ? (maxBm25 - r.rank) / bm25Range
          : 1.0;
        const compositeScore = computeCompositeScore(r, normalizedBm25, maxAccessCount);
        return { ...r, compositeScore };
      });

      scored.sort((a, b) => b.compositeScore - a.compositeScore);
      const results = scored.slice(0, requestedLimit);

      // Increment access counts
      incrementAccessCount(db, results.map((r) => r.id));

      // Fetch tags
      const tagsMap = getTagsForMemories(db, results.map((m) => m.id));

      // Build formatted text
      const lines: string[] = [];
      lines.push(`Found ${results.length} memor${results.length === 1 ? "y" : "ies"} matching "${params.query}":`);
      lines.push("");

      results.forEach((m, i) => {
        const memTags = tagsMap.get(m.id) || [];
        const agent = m.agent_id ? agentDisplayName(m.agent_id) : "Unknown";
        const time = relativeTime(m.updated_at);
        const valueLine = truncate(m.value, 200);

        lines.push(`${i + 1}. [${m.type}] ${m.key}`);
        lines.push(`   ${valueLine}`);
        const meta: string[] = [];
        if (memTags.length > 0) meta.push(`Tags: ${memTags.join(", ")}`);
        meta.push(`Stored by: ${agent}`);
        meta.push(time);
        lines.push(`   ${meta.join(" | ")}`);
        lines.push("");
      });

      const memoriesWithTags = results.map((m) => ({
        id: m.id,
        key: m.key,
        value: m.value,
        type: m.type,
        context: m.context,
        agent_id: m.agent_id,
        created_at: m.created_at,
        updated_at: m.updated_at,
        access_count: m.access_count,
        tags: tagsMap.get(m.id) || [],
      }));

      return widget({
        props: {
          memories: memoriesWithTags,
          query: params.query,
          total: results.length,
        },
        output: text(lines.join("\n").trimEnd()),
      });
    } catch (err: any) {
      return error(`Error: ${err.message}`);
    }
  }
);

// --- forget ---
server.tool(
  {
    name: "forget",
    description: "Remove a specific memory by its key. Use when information is outdated or user requests deletion.",
    schema: z.object({
      key: z.string().describe("The key of the memory to delete"),
    }),
    widget: {
      name: "memory-dashboard",
      invoking: "Removing memory...",
      invoked: "Memory removed",
    },
    annotations: {
      destructiveHint: true,
      readOnlyHint: false,
    },
  },
  async (params, ctx) => {
    try {
      const agentId = getAgentId(ctx);
      const deleted = deleteMemory(db, params.key);

      if (!deleted) {
        logActivity(db, {
          agent_id: agentId,
          action: "forget",
          target_key: params.key,
          detail: `Memory not found: ${params.key}`,
        });
        return error(`No memory found with key '${params.key}'`);
      }

      const originalAgent = deleted.agent_id ? agentDisplayName(deleted.agent_id) : "Unknown";

      logActivity(db, {
        agent_id: agentId,
        action: "forget",
        target_key: params.key,
        detail: `Deleted ${deleted.type} memory: ${params.key} (was stored by ${originalAgent})`,
      });

      return widget({
        props: {
          action: "deleted",
          memory: {
            id: deleted.id,
            key: deleted.key,
            value: deleted.value,
            type: deleted.type,
            agent_id: deleted.agent_id,
          },
        },
        output: text(`Forgotten: '${params.key}' (was a [${deleted.type}] stored by ${originalAgent})`),
      });
    } catch (err: any) {
      return error(`Error: ${err.message}`);
    }
  }
);

// --- list-memories ---
server.tool(
  {
    name: "list-memories",
    description: "Browse all stored memories with optional filtering by tags and type.",
    schema: z.object({
      tags: z.array(z.string()).optional().describe("Optional: filter to memories with these tags"),
      type: memoryTypeEnum.optional().describe("Optional: filter by memory type"),
      limit: z.number().min(1).max(50).optional().describe("Max results (default: 10, max: 50)"),
      offset: z.number().optional().describe("Skip N results for pagination"),
    }),
    widget: {
      name: "memory-dashboard",
      invoking: "Loading memories...",
      invoked: "Memories loaded",
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async (params, ctx) => {
    try {
      const agentId = getAgentId(ctx);

      const { memories, total } = listMemories(db, {
        tags: params.tags,
        type: params.type,
        limit: params.limit,
        offset: params.offset,
      });

      // Do NOT log activity for unfiltered calls (widget polls flood the activity feed)
      const hasFilters = params.tags || params.type;
      if (hasFilters) {
        logActivity(db, {
          agent_id: agentId,
          action: "list_memories",
          detail: `Listed memories (${memories.length}/${total})${params.type ? ` type=${params.type}` : ""}${params.tags ? ` tags=${params.tags.join(",")}` : ""}`,
        });
      }

      // Fetch tags in bulk
      const tagsMap = getTagsForMemories(db, memories.map((m) => m.id));

      // Build formatted text
      const lines: string[] = [];
      if (memories.length === 0) {
        lines.push("No memories found.");
        if (params.type || params.tags) {
          lines.push("Try removing filters to see all memories.");
        }
      } else {
        const showing = total > memories.length
          ? `Showing ${memories.length} of ${total} memories`
          : `${memories.length} memor${memories.length === 1 ? "y" : "ies"}`;
        lines.push(`${showing}${params.type ? ` (type: ${params.type})` : ""}:`);
        lines.push("");

        memories.forEach((m, i) => {
          const memTags = tagsMap.get(m.id) || [];
          const agent = m.agent_id ? agentDisplayName(m.agent_id) : "Unknown";
          const time = relativeTime(m.updated_at);
          const valueLine = truncate(m.value, 200);

          lines.push(`${i + 1}. [${m.type}] ${m.key}`);
          lines.push(`   ${valueLine}`);
          const meta: string[] = [];
          if (memTags.length > 0) meta.push(`Tags: ${memTags.join(", ")}`);
          meta.push(`Stored by: ${agent}`);
          meta.push(time);
          lines.push(`   ${meta.join(" | ")}`);
          lines.push("");
        });
      }

      const memoriesWithTags = memories.map((m) => ({
        ...m,
        tags: tagsMap.get(m.id) || [],
      }));

      const activities = getRecentActivity(db, 30);

      return widget({
        props: {
          memories: memoriesWithTags,
          activities,
          total,
        },
        output: text(lines.join("\n").trimEnd()),
      });
    } catch (err: any) {
      return error(`Error: ${err.message}`);
    }
  }
);

// ========================
// RESOURCES
// ========================

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
      return text(`No memory found with key '${params.key}'`);
    }
    const tags = getTagsForMemory(db, memory.id);
    return text(JSON.stringify({ ...memory, tags }, null, 2));
  }
);

// ========================
// HEALTH CHECK
// ========================

server.app.get("/api/health", (c) => {
  const count = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as any).c;
  return c.json({ status: "ok", memories: count });
});

// ========================
// START
// ========================

const PORT = parseInt(process.env.PORT || "3000");
console.log(`Agent Memory server starting on port ${PORT}`);
server.listen(PORT);
