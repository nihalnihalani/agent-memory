import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { upsertMemory, logActivity, getTagsForMemory } from "../db/queries.js";

export function registerRememberTool(server: McpServer, db: Database.Database): void {
  server.tool(
    "remember",
    "Store a memory that can be recalled later by any AI agent. Use this to save important facts, decisions, user preferences, code snippets, or any information worth remembering across conversations.",
    {
      key: z.string().describe("Short descriptive identifier (e.g., 'project-db-schema', 'user-prefers-dark-mode')"),
      value: z.string().describe("The content to remember. Can be plain text, code, JSON, or any string."),
      type: z.enum(["decision", "preference", "task", "snippet", "note"]).optional()
        .describe("Memory type. 'decision' for architectural choices, 'preference' for user prefs, 'task' for current work, 'snippet' for code, 'note' for general."),
      tags: z.array(z.string()).optional()
        .describe("Optional tags for categorization (e.g., ['preference', 'ui'], ['code', 'python'])"),
      context: z.string().optional()
        .describe("Why you're storing this -- what problem you're solving, what alternative you considered"),
    },
    async (params, extra) => {
      try {
        const agentId = (extra as any)._meta?.clientInfo?.name
          || (extra as any).meta?.clientInfo?.name
          || "unknown";

        const memory = upsertMemory(db, {
          key: params.key,
          value: params.value,
          type: params.type,
          context: params.context,
          agent_id: agentId,
          tags: params.tags,
        });

        logActivity(db, {
          agent_id: agentId,
          action: "remember",
          target_key: params.key,
          detail: `Stored ${params.type || "note"}: ${params.key}`,
        });

        const tags = getTagsForMemory(db, memory.id);

        const text = [
          `Remembered: ${memory.key}`,
          `Type: ${memory.type}`,
          `Value: ${memory.value}`,
          tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
          memory.context ? `Context: ${memory.context}` : null,
          `Stored by: ${agentId}`,
          `Updated: ${memory.updated_at}`,
        ].filter(Boolean).join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
