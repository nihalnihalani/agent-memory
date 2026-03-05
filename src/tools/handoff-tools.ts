import type { MCPServer } from "mcp-use/server";
import { text, error, widget } from "mcp-use/server";
import { z } from "zod";
import type Database from "better-sqlite3";
import {
  logActivity,
  getMemoryByKey,
  getTagsForMemory,
  getTagsForMemories,
  incrementAccessCount,
  getMemoriesByType,
  createHandoff,
  getPendingHandoffs,
  pickupHandoff,
  completeHandoff,
  checkRateLimit,
  safeParseJsonArray,
} from "../db/queries.js";
import { agentDisplayName, truncate, getAgentId } from "./helpers.js";

export function registerHandoffTools(server: MCPServer, db: Database.Database): void {
  // --- handoff ---
  server.tool(
    {
      name: "handoff",
      description:
        "Hand off your current task to the next agent. Use when you're stuck, done with your part, or a different agent would be better suited. The next agent that connects will see this handoff and can pick it up instantly without re-analyzing the project.",
      schema: z.object({
        summary: z.string().describe("What you were working on and what's been done so far"),
        stuck_reason: z.string().optional().describe("Why you're handing off -- what blocked you, what you tried"),
        next_steps: z.string().describe("Exactly what the next agent should do. Be specific."),
        to_agent: z.string().optional().describe("Preferred next agent (e.g., 'codex', 'cursor', 'claude-code'). Leave empty for any agent."),
        context_keys: z.array(z.string()).optional().describe("Keys of memories relevant to this handoff (the next agent should recall these)"),
      }),
      widget: {
        name: "memory-dashboard",
        invoking: "Creating handoff...",
        invoked: "Handoff created",
      },
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

        const handoff = createHandoff(db, {
          from_agent: agentId,
          to_agent: params.to_agent,
          summary: params.summary,
          stuck_reason: params.stuck_reason,
          next_steps: params.next_steps,
          context_keys: params.context_keys,
        });

        logActivity(db, {
          agent_id: agentId,
          action: "handoff",
          target_key: params.to_agent || "any",
          detail: `Handed off: ${params.summary.substring(0, 100)}${params.stuck_reason ? ` (stuck: ${params.stuck_reason.substring(0, 60)})` : ""}`,
        });

        // Gather context memories if specified
        let contextMemories: any[] = [];
        if (params.context_keys && params.context_keys.length > 0) {
          for (const key of params.context_keys) {
            const mem = getMemoryByKey(db, key);
            if (mem) {
              const tags = getTagsForMemory(db, mem.id);
              contextMemories.push({ ...mem, tags });
            }
          }
        }

        const textOutput = [
          `Handoff #${handoff.id} created by ${agentDisplayName(agentId)}`,
          ``,
          `Summary: ${params.summary}`,
          params.stuck_reason ? `Stuck because: ${params.stuck_reason}` : null,
          `Next steps: ${params.next_steps}`,
          params.to_agent ? `Preferred agent: ${agentDisplayName(params.to_agent)}` : `Open to any agent`,
          contextMemories.length > 0 ? `Context: ${contextMemories.map(m => m.key).join(", ")}` : null,
        ].filter(Boolean).join("\n");

        return widget({
          props: {
            action: "handoff_created",
            handoff: {
              ...handoff,
              context_keys: params.context_keys || [],
            },
            contextMemories,
          },
          output: text(textOutput),
        });
      } catch (err: any) {
        return error(`Error: ${err.message}`);
      }
    }
  );

  // --- pickup ---
  server.tool(
    {
      name: "pickup",
      description:
        "Pick up a pending handoff from another agent. Call this when you're a new agent joining the project and want to continue where the previous agent left off. Returns the handoff details and relevant context.",
      schema: z.object({
        handoff_id: z.number().optional().describe("Specific handoff ID to pick up. If omitted, picks up the most recent pending handoff."),
      }),
      widget: {
        name: "memory-dashboard",
        invoking: "Picking up handoff...",
        invoked: "Handoff accepted",
      },
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

        let handoff: any;
        if (params.handoff_id) {
          handoff = pickupHandoff(db, params.handoff_id, agentId);
        } else {
          const pending = getPendingHandoffs(db);
          if (pending.length === 0) {
            return widget({
              props: { action: "no_handoffs" },
              output: text("No pending handoffs. All caught up!"),
            });
          }
          handoff = pickupHandoff(db, pending[0].id, agentId);
        }

        if (!handoff) {
          return error("Handoff not found or already picked up by another agent.");
        }

        logActivity(db, {
          agent_id: agentId,
          action: "pickup",
          target_key: `handoff-${handoff.id}`,
          detail: `Picked up handoff from ${agentDisplayName(handoff.from_agent)}: ${handoff.summary.substring(0, 80)}`,
        });

        // Gather context memories
        let contextMemories: any[] = [];
        const contextKeys: string[] = safeParseJsonArray(handoff.context_keys);
        for (const key of contextKeys) {
          const mem = getMemoryByKey(db, key);
          if (mem) {
            const tags = getTagsForMemory(db, mem.id);
            contextMemories.push({ ...mem, tags });
            incrementAccessCount(db, [mem.id]);
          }
        }

        // Get recent decisions and preferences for full context
        const decisions = getMemoriesByType(db, "decision");
        const preferences = getMemoriesByType(db, "preference");
        const decisionTags = getTagsForMemories(db, decisions.map(d => d.id));
        const prefTags = getTagsForMemories(db, preferences.map(p => p.id));

        const textOutput = [
          `=== HANDOFF BRIEFING ===`,
          `From: ${agentDisplayName(handoff.from_agent)}`,
          `To: ${agentDisplayName(agentId)} (you)`,
          ``,
          `## What was being worked on`,
          handoff.summary,
          ``,
          handoff.stuck_reason ? `## Why they handed off\n${handoff.stuck_reason}\n` : "",
          `## What you should do next`,
          handoff.next_steps,
          ``,
          contextMemories.length > 0 ? `## Relevant context\n${contextMemories.map(m => `- [${m.type}] ${m.key}: ${truncate(m.value, 150)}`).join("\n")}` : "",
          decisions.length > 0 ? `\n## Key decisions\n${decisions.map(d => `- ${d.key}: ${truncate(d.value, 100)}`).join("\n")}` : "",
          preferences.length > 0 ? `\n## User preferences\n${preferences.map(p => `- ${p.key}: ${truncate(p.value, 100)}`).join("\n")}` : "",
        ].filter(Boolean).join("\n");

        return widget({
          props: {
            action: "handoff_picked_up",
            handoff: {
              ...handoff,
              context_keys: contextKeys,
            },
            contextMemories,
            decisions: decisions.map(d => ({ ...d, tags: decisionTags.get(d.id) || [] })),
            preferences: preferences.map(p => ({ ...p, tags: prefTags.get(p.id) || [] })),
          },
          output: text(textOutput),
        });
      } catch (err: any) {
        return error(`Error: ${err.message}`);
      }
    }
  );

  // --- complete-handoff ---
  server.tool(
    {
      name: "complete-handoff",
      description: "Mark a handoff as completed after finishing the handed-off work.",
      schema: z.object({
        handoff_id: z.number().describe("The handoff ID to mark as completed"),
        result: z.string().optional().describe("Summary of what was accomplished"),
      }),
      widget: {
        name: "memory-dashboard",
        invoking: "Completing handoff...",
        invoked: "Handoff completed",
      },
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
        const handoff = completeHandoff(db, params.handoff_id, agentId);

        if (!handoff) {
          // Check if handoff exists with wrong status
          const existing = db.prepare(`SELECT status FROM handoffs WHERE id = ?`).get(params.handoff_id) as { status: string } | undefined;
          if (existing) {
            return error(`Handoff #${params.handoff_id} cannot be completed (current status: ${existing.status}). It must be picked up first.`);
          }
          return error(`Handoff #${params.handoff_id} not found.`);
        }

        logActivity(db, {
          agent_id: agentId,
          action: "complete_handoff",
          target_key: `handoff-${handoff.id}`,
          detail: `Completed handoff from ${agentDisplayName(handoff.from_agent)}${params.result ? `: ${params.result.substring(0, 100)}` : ""}`,
        });

        return widget({
          props: {
            action: "handoff_completed",
            handoff,
          },
          output: text(`Handoff #${handoff.id} completed by ${agentDisplayName(agentId)}. Originally from ${agentDisplayName(handoff.from_agent)}.${params.result ? `\nResult: ${params.result}` : ""}`),
        });
      } catch (err: any) {
        return error(`Error: ${err.message}`);
      }
    }
  );
}
