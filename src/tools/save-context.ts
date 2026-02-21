import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import type Database from "better-sqlite3";
import { findLatestSessionFile, parseClaudeCodeSession } from "../adapters/claude-code.js";
import { upsertSession } from "../db/sessions-schema.js";

const WIDGET_URI = "ui://agent-memory/dashboard.html";

export function registerSaveContextTool(server: McpServer, db: Database.Database): void {
  registerAppTool(
    server,
    "save-context",
    {
      description:
        "Capture your current AI coding session context and save it for transfer to another tool. " +
        "Reads the latest Claude Code session file, extracts the conversation, decisions, and file changes, " +
        "and stores them in a universal format that any supported AI tool can load.",
      inputSchema: {
        project_path: z
          .string()
          .optional()
          .describe(
            "Absolute path to the project (defaults to cwd). Used to find the right session file."
          ),
        pending_tasks: z
          .array(z.string())
          .optional()
          .describe("Tasks still to be done that should carry over to the next session."),
        key_decisions: z
          .array(z.string())
          .optional()
          .describe("Important decisions made this session (e.g. 'Chose PKCE flow over implicit')."),
        notes: z.string().optional().describe("Any extra notes to include in the saved context."),
      },
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async (params) => {
      try {
        const projectPath = params.project_path ?? process.cwd();

        const found = findLatestSessionFile(projectPath);
        if (!found) {
          return {
            content: [
              {
                type: "text",
                text: `No Claude Code session files found for project: ${projectPath}\n\nMake sure you are running this from a project you've previously worked on with Claude Code.`,
              },
            ],
            isError: true,
          };
        }

        const ctx = parseClaudeCodeSession(found.sessionFile);

        // Layer in user-supplied pending tasks and key decisions
        if (params.pending_tasks?.length) {
          ctx.conversation_summary.pending_tasks = params.pending_tasks;
        }
        if (params.key_decisions?.length) {
          ctx.conversation_summary.key_decisions = params.key_decisions;
        }
        if (params.notes) {
          ctx.conversation_summary.current_state =
            ctx.conversation_summary.current_state + "\n\nNotes: " + params.notes;
        }

        const row = upsertSession(db, {
          session_id: ctx.metadata.session_id,
          source_agent: "claude-code",
          project_path: ctx.metadata.project_path || projectPath,
          git_branch: ctx.metadata.git_branch,
          objective: ctx.conversation_summary.objective,
          current_state: ctx.conversation_summary.current_state,
          completed_steps: ctx.conversation_summary.completed_steps,
          pending_tasks: ctx.conversation_summary.pending_tasks,
          key_decisions: ctx.conversation_summary.key_decisions,
          file_changes: ctx.file_changes,
          token_count: ctx.metadata.token_count,
          raw_context: ctx,
        });

        const summary = [
          `✓ Context saved (session: ${row.session_id.slice(0, 8)}…)`,
          `  Source:    Claude Code`,
          `  Project:   ${ctx.metadata.project_path || projectPath}`,
          `  Branch:    ${ctx.metadata.git_branch || "unknown"}`,
          `  Turns:     ${ctx.raw_turns.length}`,
          `  Tokens:    ${ctx.metadata.token_count.toLocaleString()}`,
          `  Files:     ${ctx.file_changes.length} changed`,
          ``,
          `  Objective: ${ctx.conversation_summary.objective}`,
          `  State:     ${ctx.conversation_summary.current_state.slice(0, 100)}${ctx.conversation_summary.current_state.length > 100 ? "…" : ""}`,
          ctx.conversation_summary.pending_tasks.length
            ? `  Pending:   ${ctx.conversation_summary.pending_tasks.join(", ")}`
            : null,
          ctx.conversation_summary.key_decisions.length
            ? `  Decisions: ${ctx.conversation_summary.key_decisions.join("; ")}`
            : null,
          ``,
          `To load this in another tool, run:`,
          `  load-context (session_id: "${row.session_id}")`,
        ]
          .filter(l => l !== null)
          .join("\n");

        return { content: [{ type: "text", text: summary }] };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error saving context: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
