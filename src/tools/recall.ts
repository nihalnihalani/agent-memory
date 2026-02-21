import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type Database from "better-sqlite3";
import { searchMemories, logActivity, incrementAccessCount, getTagsForMemories } from "../db/queries.js";
import type { SearchResultRow } from "../db/queries.js";
import { agentDisplayName, relativeTime, truncate } from "./helpers.js";

const WIDGET_URI = "ui://agent-memory/dashboard.html";

/** Type priority weights for composite scoring */
const TYPE_PRIORITY: Record<string, number> = {
  decision: 1.0,
  preference: 0.9,
  task: 0.8,
  snippet: 0.7,
  note: 0.5,
};

/**
 * Compute composite relevance score combining BM25, recency, access frequency, and type priority.
 */
function computeCompositeScore(
  result: SearchResultRow,
  normalizedBm25: number,
  maxAccessCount: number
): number {
  // Recency: 1.0 / (1.0 + age_days * 0.1)
  const now = Date.now();
  const created = new Date(result.created_at + (result.created_at.endsWith("Z") ? "" : "Z")).getTime();
  const ageDays = (now - created) / (1000 * 60 * 60 * 24);
  const recencyScore = 1.0 / (1.0 + ageDays * 0.1);

  // Access frequency: log-normalized
  const accessScore = maxAccessCount > 0
    ? Math.log(1 + result.access_count) / Math.log(1 + maxAccessCount)
    : 0;

  // Type priority
  const typePriority = TYPE_PRIORITY[result.type] ?? 0.5;

  return (0.6 * normalizedBm25) + (0.2 * recencyScore) + (0.1 * accessScore) + (0.1 * typePriority);
}

export function registerRecallTool(server: McpServer, db: Database.Database): void {
  registerAppTool(
    server,
    "recall",
    {
      description: "Search and retrieve stored memories. Uses full-text search to find relevant memories by topic, or filter by tags.",
      inputSchema: {
        query: z.string().describe("Natural language search query (e.g., 'What database does the project use?')"),
        tags: z.array(z.string()).optional()
          .describe("Optional: filter to memories with these tags"),
        type: z.enum(["decision", "preference", "task", "snippet", "note"]).optional()
          .describe("Optional: filter to memories of this type"),
        limit: z.number().optional()
          .describe("Max results to return (default: 5, max: 20)"),
      },
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async (params, extra) => {
      try {
        const agentId = (extra as any)._meta?.clientInfo?.name
          || (extra as any).meta?.clientInfo?.name
          || "unknown";

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
          const noResultText = `No memories found matching "${params.query}". Try a broader search.`;
          return { content: [{ type: "text", text: noResultText }] };
        }

        // --- Composite scoring ---
        // Normalize BM25 scores (they are negative in SQLite FTS5, more negative = better match)
        const bm25Scores = rawResults.map((r) => r.rank);
        const minBm25 = Math.min(...bm25Scores);
        const maxBm25 = Math.max(...bm25Scores);
        const bm25Range = maxBm25 - minBm25;

        const maxAccessCount = Math.max(...rawResults.map((r) => r.access_count), 1);

        const scored = rawResults.map((r) => {
          // Normalize BM25 to 0-1 (BM25 in FTS5 is negative, more negative = better match)
          const normalizedBm25 = bm25Range !== 0
            ? (maxBm25 - r.rank) / bm25Range
            : 1.0;
          const compositeScore = computeCompositeScore(r, normalizedBm25, maxAccessCount);
          return { ...r, compositeScore };
        });

        // Sort by composite score descending and take requested limit
        scored.sort((a, b) => b.compositeScore - a.compositeScore);
        const results = scored.slice(0, requestedLimit);

        // Increment access counts
        const ids = results.map((r) => r.id);
        incrementAccessCount(db, ids);

        // Fetch tags
        const tagsMap = getTagsForMemories(db, results.map((m) => m.id));

        // --- Build formatted text response ---
        const lines: string[] = [];
        lines.push(`Found ${results.length} memor${results.length === 1 ? "y" : "ies"} matching "${params.query}":`);
        lines.push("");

        results.forEach((m, i) => {
          const tags = tagsMap.get(m.id) || [];
          const agent = m.agent_id ? agentDisplayName(m.agent_id) : "Unknown";
          const time = relativeTime(m.updated_at);
          const valueLine = truncate(m.value, 200);

          lines.push(`${i + 1}. [${m.type}] ${m.key}`);
          lines.push(`   ${valueLine}`);
          const meta: string[] = [];
          if (tags.length > 0) meta.push(`Tags: ${tags.join(", ")}`);
          meta.push(`Stored by: ${agent}`);
          meta.push(time);
          lines.push(`   ${meta.join(" | ")}`);
          lines.push("");
        });

        const formattedText = lines.join("\n").trimEnd();

        // --- Build structured JSON for widget ---
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

        const jsonData = JSON.stringify({
          memories: memoriesWithTags,
          total: results.length,
        });

        return {
          content: [
            { type: "text", text: formattedText },
            { type: "text", text: jsonData },
          ],
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
