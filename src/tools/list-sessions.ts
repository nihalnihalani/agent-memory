import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type Database from "better-sqlite3";
import { listSessions } from "../db/sessions-schema.js";

const WIDGET_URI = "ui://agent-memory/dashboard.html";

export function registerListSessionsTool(server: McpServer, db: Database.Database): void {
  registerAppTool(
    server,
    "list-sessions",
    {
      description:
        "List all saved context sessions. Shows what conversations have been captured " +
        "from AI coding tools, with their objectives, token counts, and timestamps.",
      inputSchema: {
        source_agent: z
          .enum(["claude-code", "codex", "gemini", "cursor"])
          .optional()
          .describe("Filter by source agent. Omit to see all sessions."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(10)
          .describe("Max number of sessions to return (default 10)."),
      },
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async (params) => {
      try {
        const sessions = listSessions(db, {
          source_agent: params.source_agent,
          limit: params.limit ?? 10,
        });

        if (!sessions.length) {
          return {
            content: [
              {
                type: "text",
                text: "No saved sessions found. Use save-context to capture your current session.",
              },
            ],
          };
        }

        const lines: string[] = [
          `Found ${sessions.length} saved session${sessions.length !== 1 ? "s" : ""}:`,
          "",
        ];

        for (const s of sessions) {
          const pending = JSON.parse(s.pending_tasks ?? "[]") as string[];
          const files = JSON.parse(s.file_changes ?? "[]") as unknown[];
          const age = formatAge(s.captured_at);

          lines.push(`[${s.id}] ${s.source_agent} — ${age}`);
          lines.push(`    ID:        ${s.session_id.slice(0, 16)}…`);
          lines.push(`    Project:   ${s.project_path ?? "unknown"}`);
          if (s.git_branch) lines.push(`    Branch:    ${s.git_branch}`);
          lines.push(`    Tokens:    ${s.token_count.toLocaleString()}`);
          lines.push(`    Files:     ${files.length} changed`);
          lines.push(`    Objective: ${s.objective ?? "unknown"}`);
          if (pending.length) lines.push(`    Pending:   ${pending.join(", ")}`);
          lines.push("");
        }

        lines.push(
          `To load a session: use load-context with the session_id above.`,
          `To save current session: use save-context.`
        );

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error listing sessions: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}

function formatAge(capturedAt: string): string {
  const now = Date.now();
  const then = new Date(capturedAt + "Z").getTime(); // SQLite stores UTC without Z
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
