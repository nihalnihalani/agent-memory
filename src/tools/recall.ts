import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { searchMemories, logActivity, incrementAccessCount, getTagsForMemory } from "../db/queries.js";

export function registerRecallTool(server: McpServer, db: Database.Database): void {
  server.tool(
    "recall",
    "Search and retrieve stored memories. Uses full-text search to find relevant memories by topic, or filter by tags.",
    {
      query: z.string().describe("Natural language search query (e.g., 'What database does the project use?')"),
      tags: z.array(z.string()).optional()
        .describe("Optional: filter to memories with these tags"),
      type: z.enum(["decision", "preference", "task", "snippet", "note"]).optional()
        .describe("Optional: filter to memories of this type"),
      limit: z.number().optional()
        .describe("Max results to return (default: 5, max: 20)"),
    },
    async (params, extra) => {
      try {
        const agentId = (extra as any)._meta?.clientInfo?.name
          || (extra as any).meta?.clientInfo?.name
          || "unknown";

        const results = searchMemories(db, {
          query: params.query,
          tags: params.tags,
          type: params.type,
          limit: params.limit,
        });

        logActivity(db, {
          agent_id: agentId,
          action: "recall",
          target_key: params.query,
          detail: `Searched for: "${params.query}" (${results.length} results)`,
        });

        if (results.length > 0) {
          const ids = results.map((r) => r.id);
          incrementAccessCount(db, ids);
        }

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: `No memories found matching "${params.query}"` }],
          };
        }

        const formatted = results.map((m, i) => {
          const tags = getTagsForMemory(db, m.id);
          return [
            `--- Result ${i + 1} ---`,
            `Key: ${m.key}`,
            `Type: ${m.type}`,
            `Value: ${m.value}`,
            tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
            m.context ? `Context: ${m.context}` : null,
            m.agent_id ? `Stored by: ${m.agent_id}` : null,
            `Last updated: ${m.updated_at}`,
            `Access count: ${m.access_count + 1}`,
          ].filter(Boolean).join("\n");
        });

        const text = `Found ${results.length} memories matching "${params.query}":\n\n${formatted.join("\n\n")}`;

        return { content: [{ type: "text", text }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
