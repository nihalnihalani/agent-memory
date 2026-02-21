import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type Database from "better-sqlite3";
import { deleteMemory, logActivity } from "../db/queries.js";
import { agentDisplayName } from "./helpers.js";

const WIDGET_URI = "ui://agent-memory/dashboard.html";

export function registerForgetTool(server: McpServer, db: Database.Database): void {
  registerAppTool(
    server,
    "forget",
    {
      description: "Remove a specific memory by its key. Use when information is outdated or user requests deletion.",
      inputSchema: {
        key: z.string().describe("The key of the memory to delete"),
      },
      _meta: { ui: { resourceUri: WIDGET_URI, visibility: ["model", "app"] } },
    },
    async (params, extra) => {
      try {
        const agentId = (extra as any)._meta?.clientInfo?.name
          || (extra as any).meta?.clientInfo?.name
          || "unknown";

        const deleted = deleteMemory(db, params.key);

        if (deleted) {
          const originalAgent = deleted.agent_id
            ? agentDisplayName(deleted.agent_id)
            : "Unknown";

          logActivity(db, {
            agent_id: agentId,
            action: "forget",
            target_key: params.key,
            detail: `Deleted ${deleted.type} memory: ${params.key} (was stored by ${originalAgent})`,
          });

          return {
            content: [
              { type: "text", text: `Forgotten: '${params.key}' (was a [${deleted.type}] stored by ${originalAgent})` },
            ],
            structuredContent: { deleted: true, key: params.key },
          };
        } else {
          logActivity(db, {
            agent_id: agentId,
            action: "forget",
            target_key: params.key,
            detail: `Memory not found: ${params.key}`,
          });

          return {
            content: [
              { type: "text", text: `No memory found with key '${params.key}'` },
            ],
            structuredContent: { deleted: false, key: params.key },
          };
        }
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
