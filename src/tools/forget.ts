import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type Database from "better-sqlite3";
import { deleteMemory, logActivity } from "../db/queries.js";

export function registerForgetTool(server: McpServer, db: Database.Database): void {
  server.tool(
    "forget",
    "Remove a specific memory by its key. Use when information is outdated or user requests deletion.",
    {
      key: z.string().describe("The key of the memory to delete"),
    },
    async (params, extra) => {
      try {
        const agentId = (extra as any)._meta?.clientInfo?.name
          || (extra as any).meta?.clientInfo?.name
          || "unknown";

        const deleted = deleteMemory(db, params.key);

        logActivity(db, {
          agent_id: agentId,
          action: "forget",
          target_key: params.key,
          detail: deleted ? `Deleted memory: ${params.key}` : `Memory not found: ${params.key}`,
        });

        if (deleted) {
          return { content: [{ type: "text", text: `Forgot memory: ${params.key}` }] };
        } else {
          return { content: [{ type: "text", text: `Memory not found: ${params.key}` }] };
        }
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
