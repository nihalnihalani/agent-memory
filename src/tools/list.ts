import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { listMemories, logActivity, getTagsForMemory } from "../db/queries.js";

export function registerListTool(server: McpServer, db: Database.Database): void {
  server.tool(
    "list_memories",
    "Browse all stored memories with optional filtering by tags and type.",
    {
      tags: z.array(z.string()).optional()
        .describe("Optional: filter to memories with these tags"),
      type: z.enum(["decision", "preference", "task", "snippet", "note"]).optional()
        .describe("Optional: filter by memory type"),
      limit: z.number().optional()
        .describe("Max results (default: 10, max: 50)"),
      offset: z.number().optional()
        .describe("Skip N results for pagination"),
    },
    async (params, extra) => {
      try {
        const agentId = (extra as any)._meta?.clientInfo?.name
          || (extra as any).meta?.clientInfo?.name
          || "unknown";

        const { memories, total } = listMemories(db, {
          tags: params.tags,
          type: params.type,
          limit: params.limit,
          offset: params.offset,
        });

        logActivity(db, {
          agent_id: agentId,
          action: "list_memories",
          detail: `Listed memories (${memories.length}/${total})${params.type ? ` type=${params.type}` : ""}${params.tags ? ` tags=${params.tags.join(",")}` : ""}`,
        });

        if (memories.length === 0) {
          return { content: [{ type: "text", text: "No memories found." }] };
        }

        const formatted = memories.map((m) => {
          const tags = getTagsForMemory(db, m.id);
          return [
            `[${m.type}] ${m.key}`,
            `  ${m.value.substring(0, 200)}${m.value.length > 200 ? "..." : ""}`,
            tags.length > 0 ? `  Tags: ${tags.join(", ")}` : null,
            m.agent_id ? `  Agent: ${m.agent_id}` : null,
          ].filter(Boolean).join("\n");
        });

        const text = `Showing ${memories.length} of ${total} memories:\n\n${formatted.join("\n\n")}`;

        return { content: [{ type: "text", text }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
