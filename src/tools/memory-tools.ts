import type { MCPServer } from "mcp-use/server";
import { text, error, widget } from "mcp-use/server";
import { z } from "zod";
import type Database from "better-sqlite3";
import type { SearchResultRow } from "../db/queries.js";
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
} from "../db/queries.js";
import { agentDisplayName, relativeTime, truncate, getAgentId } from "./helpers.js";

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

export const memoryTypeEnum = z.enum(["decision", "preference", "task", "snippet", "note"]);

export function registerMemoryTools(server: MCPServer, db: Database.Database): void {
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
        openWorldHint: false,
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
        openWorldHint: false,
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
        openWorldHint: false,
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
        openWorldHint: false,
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
}
