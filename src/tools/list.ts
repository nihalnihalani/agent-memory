import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type Database from "better-sqlite3";
import { listMemories, logActivity, getTagsForMemories, getRecentActivity } from "../db/queries.js";
import { agentDisplayName, relativeTime, truncate } from "./helpers.js";

const WIDGET_URI = "ui://agent-memory/dashboard.html";

export function registerListTool(server: McpServer, db: Database.Database): void {
  registerAppTool(
    server,
    "list_memories",
    {
      description: "Browse all stored memories with optional filtering by tags and type.",
      inputSchema: {
        tags: z.array(z.string()).optional()
          .describe("Optional: filter to memories with these tags"),
        type: z.enum(["decision", "preference", "task", "snippet", "note"]).optional()
          .describe("Optional: filter by memory type"),
        limit: z.number().optional()
          .describe("Max results (default: 10, max: 50)"),
        offset: z.number().optional()
          .describe("Skip N results for pagination"),
      },
      _meta: { ui: { resourceUri: WIDGET_URI } },
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

        // Fetch tags in bulk
        const tagsMap = getTagsForMemories(db, memories.map((m) => m.id));

        // --- Build formatted text response ---
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
        }

        const formattedText = lines.join("\n").trimEnd();

        // --- Build structured JSON for widget ---
        const memoriesWithTags = memories.map((m) => ({
          ...m,
          tags: tagsMap.get(m.id) || [],
        }));

        const activities = getRecentActivity(db, 30);

        const jsonData = JSON.stringify({
          memories: memoriesWithTags,
          activities,
          total,
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
