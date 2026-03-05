import type { MCPServer } from "mcp-use/server";
import { text, error } from "mcp-use/server";
import { z } from "zod";
import type Database from "better-sqlite3";
import type { ExportedMemory } from "../db/queries.js";
import {
  logActivity,
  exportMemories,
  importMemories,
  getMemoryStats,
  checkRateLimit,
} from "../db/queries.js";
import { agentDisplayName, getAgentId } from "./helpers.js";
import { memoryTypeEnum } from "./memory-tools.js";

export function registerUtilityTools(server: MCPServer, db: Database.Database): void {
  // --- export-memories ---
  server.tool(
    {
      name: "export-memories",
      description:
        "Export all memories as JSON. Optionally filter by agent, type, date range, or tags. Use this for backups or migrating memories between servers.",
      schema: z.object({
        agent_id: z.string().optional().describe("Filter by agent ID (e.g., 'claude-code', 'cursor-vscode')"),
        type: memoryTypeEnum.optional().describe("Filter by memory type"),
        tags: z.array(z.string()).optional().describe("Filter to memories with any of these tags"),
        date_from: z.string().optional().describe("Filter memories created on or after this date (ISO 8601, e.g., '2026-01-01')"),
        date_to: z.string().optional().describe("Filter memories created on or before this date (ISO 8601, e.g., '2026-12-31')"),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (params, ctx) => {
      try {
        const agentId = getAgentId(ctx);
        checkRateLimit(agentId);

        const exported = exportMemories(db, {
          agent_id: params.agent_id,
          type: params.type,
          tags: params.tags,
          date_from: params.date_from,
          date_to: params.date_to,
        });

        logActivity(db, {
          agent_id: agentId,
          action: "export",
          detail: `Exported ${exported.length} memories${params.type ? ` (type=${params.type})` : ""}${params.agent_id ? ` (agent=${params.agent_id})` : ""}`,
        });

        const jsonOutput = JSON.stringify({ version: 1, exported_at: new Date().toISOString(), count: exported.length, memories: exported }, null, 2);

        const lines: string[] = [];
        lines.push(`Exported ${exported.length} memor${exported.length === 1 ? "y" : "ies"}.`);
        if (params.type) lines.push(`Type filter: ${params.type}`);
        if (params.agent_id) lines.push(`Agent filter: ${params.agent_id}`);
        if (params.tags) lines.push(`Tag filter: ${params.tags.join(", ")}`);
        if (params.date_from) lines.push(`From: ${params.date_from}`);
        if (params.date_to) lines.push(`To: ${params.date_to}`);
        lines.push("");
        lines.push(jsonOutput);

        return text(lines.join("\n"));
      } catch (err: any) {
        return error(`Error: ${err.message}`);
      }
    }
  );

  // --- import-memories ---
  server.tool(
    {
      name: "import-memories",
      description:
        "Import memories from JSON format. Skips duplicates (by key). Validates all entries before importing. Use this to restore from a backup or migrate memories from another server.",
      schema: z.object({
        data: z.string().describe("JSON string containing the export data (must have a 'memories' array with objects containing at least 'key' and 'value')"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (params, ctx) => {
      try {
        const agentId = getAgentId(ctx);
        checkRateLimit(agentId);

        let parsed: any;
        try {
          parsed = JSON.parse(params.data);
        } catch {
          return error("Invalid JSON. Please provide valid JSON with a 'memories' array.");
        }

        const memories: ExportedMemory[] = parsed.memories || parsed;
        if (!Array.isArray(memories)) {
          return error("Expected a 'memories' array in the JSON data, or a top-level array of memory objects.");
        }

        const result = importMemories(db, memories, agentId);

        logActivity(db, {
          agent_id: agentId,
          action: "import",
          detail: `Imported ${result.imported} memories, skipped ${result.skipped}${result.errors.length > 0 ? `, ${result.errors.length} errors` : ""}`,
        });

        const lines: string[] = [];
        lines.push(`Import complete.`);
        lines.push(`  Imported: ${result.imported}`);
        lines.push(`  Skipped (duplicates): ${result.skipped}`);
        if (result.errors.length > 0) {
          lines.push(`  Errors: ${result.errors.length}`);
          for (const e of result.errors.slice(0, 10)) {
            lines.push(`    - ${e}`);
          }
          if (result.errors.length > 10) {
            lines.push(`    ... and ${result.errors.length - 10} more`);
          }
        }

        return text(lines.join("\n"));
      } catch (err: any) {
        return error(`Error: ${err.message}`);
      }
    }
  );

  // --- memory-stats ---
  server.tool(
    {
      name: "memory-stats",
      description:
        "Get comprehensive statistics about the memory database: totals by type, memories per agent, most accessed memories, storage size, active handoffs, and search index health.",
      schema: z.object({}),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (_params, ctx) => {
      try {
        const agentId = getAgentId(ctx);
        checkRateLimit(agentId);
        const stats = getMemoryStats(db);

        logActivity(db, {
          agent_id: agentId,
          action: "stats",
          detail: `Viewed memory stats (${stats.totalMemories} total memories)`,
        });

        const lines: string[] = [];
        lines.push("=== MEMORY STATISTICS ===");
        lines.push("");

        // Overview
        lines.push(`Total memories: ${stats.totalMemories}`);
        lines.push(`Total tags: ${stats.totalTags}`);
        lines.push(`Activity log entries: ${stats.totalActivityLogs}`);
        lines.push(`Active handoffs: ${stats.activeHandoffs}`);
        lines.push(`Storage estimate: ${(stats.storageSizeEstimate / 1024).toFixed(1)} KB`);
        lines.push(`Search index (FTS5): ${stats.ftsHealthy ? "healthy" : "unavailable (using LIKE fallback)"}`);
        lines.push("");

        // By type
        if (Object.keys(stats.memoriesByType).length > 0) {
          lines.push("## Memories by Type");
          for (const [type, count] of Object.entries(stats.memoriesByType)) {
            lines.push(`  ${type}: ${count}`);
          }
          lines.push("");
        }

        // Per agent
        if (stats.memoriesPerAgent.length > 0) {
          lines.push("## Memories per Agent");
          for (const { agent_id, count } of stats.memoriesPerAgent) {
            lines.push(`  ${agentDisplayName(agent_id)}: ${count}`);
          }
          lines.push("");
        }

        // Most accessed
        if (stats.mostAccessed.length > 0) {
          lines.push("## Most Accessed (Top 10)");
          for (const m of stats.mostAccessed) {
            lines.push(`  ${m.key} [${m.type}]: ${m.access_count} accesses`);
          }
          lines.push("");
        }

        return text(lines.join("\n").trimEnd());
      } catch (err: any) {
        return error(`Error: ${err.message}`);
      }
    }
  );
}
