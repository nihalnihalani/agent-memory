import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type Database from "better-sqlite3";
import { getStats, getMemoryCountsByType, getMostAccessedMemories, getDistinctAgents } from "../db/queries.js";
import { agentDisplayName } from "./helpers.js";

const WIDGET_URI = "ui://agent-memory/dashboard.html";

export function registerStatsTool(server: McpServer, db: Database.Database): void {
  registerAppTool(
    server,
    "get_stats",
    {
      description: "Get memory system statistics: total memories, agents, actions, type breakdown, most accessed memories, and active agents.",
      inputSchema: {},
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async () => {
      try {
        const stats = getStats(db);
        const countsByType = getMemoryCountsByType(db);
        const topMemories = getMostAccessedMemories(db, 5);
        const agents = getDistinctAgents(db);

        const lines: string[] = [];
        lines.push(`Memory System Statistics:`);
        lines.push(`  Total memories: ${stats.totalMemories}`);
        lines.push(`  Unique agents: ${stats.uniqueAgents}`);
        lines.push(`  Total actions: ${stats.totalActions}`);
        lines.push("");
        lines.push("By type:");
        for (const [type, count] of Object.entries(countsByType)) {
          lines.push(`  ${type}: ${count}`);
        }
        if (topMemories.length > 0) {
          lines.push("");
          lines.push("Most accessed:");
          topMemories.forEach((m, i) => {
            lines.push(`  ${i + 1}. ${m.key} (${m.access_count} accesses)`);
          });
        }
        if (agents.length > 0) {
          lines.push("");
          lines.push("Active agents: " + agents.map(a => agentDisplayName(a)).join(", "));
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          structuredContent: {
            ...stats,
            countsByType,
            topMemories: topMemories.map(m => ({
              key: m.key,
              type: m.type,
              access_count: m.access_count,
            })),
            agents: agents.map(a => ({ id: a, name: agentDisplayName(a) })),
          },
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
